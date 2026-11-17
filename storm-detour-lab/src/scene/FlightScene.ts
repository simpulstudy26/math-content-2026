/**
 * 1인칭 비행 장면. 시간 τ(초) 하나로 모든 것이 정해진다:
 *   τ → (타임라인) 누적 거리 s → (경로) 계산 좌표 p → (역변환) 위도·경도 → 렌더 좌표
 * 카메라는 늘 원점에 두고 세계를 반대로 옮긴다 (부동 원점: 지구 규모에서도 떨림 없음).
 */
import * as THREE from 'three';
import type { Trip } from '../math/trip';
import type { Timeline } from '../math/trip';
import type { Phase } from '../math/detour';
import { atmosphereUniforms, ecef, makeEarth, paintEarthTexture } from './globe';
import { makeSky, paletteAt } from './sky';
import { makeRouteClouds, makeStorm, type Storm } from './clouds';

export const CRUISE_ALT_KM = 15;

export interface FlightState {
  time: number;
  distance: number;
  phase: Phase;
  altitude: number;
  playing: boolean;
  speed: number;
  done: boolean;
  /** 계산 좌표 위치 */
  x: number;
  y: number;
}

type Listener = (s: FlightState) => void;

let sharedEarthTex: THREE.DataTexture | null = null;

const smooth = (e0: number, e1: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
};

export class FlightScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world = new THREE.Group();
  private sky = makeSky();
  private atmos = atmosphereUniforms();
  private sun = new THREE.DirectionalLight('#ffffff', 1.3);
  private hemi = new THREE.HemisphereLight('#cfe4f5', '#c4c9c2', 1.25);
  private storm: Storm;
  private raf = 0;
  private last = 0;
  private listeners = new Set<Listener>();
  private lastEmit = 0;
  private ro: ResizeObserver;

  time = 0;
  speed = 1;
  playing = false;
  private bank = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private dragging = false;
  private dragFrom = { x: 0, y: 0, yaw: 0, pitch: 0 };

  constructor(
    private host: HTMLElement,
    private trip: Trip,
    private timeline: Timeline,
    seed = 1,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'scene-canvas';

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 30000);
    this.scene.add(this.sky.mesh);
    this.scene.add(this.world);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.scene.fog = new THREE.Fog('#f3d9c6', 60, 700);

    sharedEarthTex ??= paintEarthTexture(4096);
    this.world.add(makeEarth(sharedEarthTex, this.atmos));
    this.world.add(makeRouteClouds(trip, seed));
    this.storm = makeStorm(trip, seed);
    this.world.add(this.storm.group);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.bindLook();
    this.renderAt(0, 0);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ───── 재생 제어 ───── */
  play() {
    if (this.time >= this.timeline.duration) this.time = 0;
    this.playing = true;
    this.emit(true);
  }
  pause() {
    this.playing = false;
    this.emit(true);
  }
  setSpeed(k: number) {
    this.speed = k;
    this.emit(true);
  }
  seek(sec: number) {
    this.time = Math.min(this.timeline.duration, Math.max(0, sec));
    this.emit(true);
  }
  /** 엽서처럼 화면을 덮을 때 렌더링을 멈춰 기기 부담을 줄인다 */
  frozen = false;
  setFrozen(v: boolean) {
    this.frozen = v;
  }
  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.state());
    return () => this.listeners.delete(fn);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.domElement.remove();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.renderer.dispose();
  }

  /* ───── 내부 ───── */
  private state(): FlightState {
    const s = this.timeline.distanceAt(this.time);
    const q = this.trip.path.at(s);
    return {
      time: this.time,
      distance: s,
      phase: q.phase,
      altitude: this.altitudeAt(this.time),
      playing: this.playing,
      speed: this.speed,
      done: this.time >= this.timeline.duration - 1e-6,
      x: q.p.x,
      y: q.p.y,
    };
  }

  private emit(force = false) {
    const now = performance.now();
    if (!force && now - this.lastEmit < 80) return;
    this.lastEmit = now;
    const st = this.state();
    this.listeners.forEach((f) => f(st));
  }

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 75 : 62;
    this.camera.updateProjectionMatrix();
  }

  private bindLook() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.dragFrom = { x: e.clientX, y: e.clientY, yaw: this.lookYaw, pitch: this.lookPitch };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const k = 0.0042;
      this.lookYaw = Math.max(-2.2, Math.min(2.2, this.dragFrom.yaw - (e.clientX - this.dragFrom.x) * k));
      this.lookPitch = Math.max(-0.9, Math.min(0.6, this.dragFrom.pitch - (e.clientY - this.dragFrom.y) * k));
    });
    const end = () => (this.dragging = false);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private altitudeAt(sec: number) {
    const D = this.timeline.duration;
    const climb = smooth(0, D * 0.07, sec);
    const descent = smooth(D * 0.9, D, sec);
    return 1.2 + (CRUISE_ALT_KM - 1.2) * climb - (CRUISE_ALT_KM - 1.6) * descent;
  }

  private loop(now: number) {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.playing) {
      this.time += dt * this.speed;
      if (this.time >= this.timeline.duration) {
        this.time = this.timeline.duration;
        this.playing = false;
        this.emit(true);
      }
    }
    if (!this.dragging) {
      this.lookYaw *= Math.exp(-dt * 0.8);
      this.lookPitch *= Math.exp(-dt * 0.8);
    }
    if (!this.frozen) this.renderAt(this.time, dt);
    this.emit();
    this.raf = requestAnimationFrame(this.loop);
  }

  private tmp = {
    pos: new THREE.Vector3(),
    ahead: new THREE.Vector3(),
    up: new THREE.Vector3(),
    fwd: new THREE.Vector3(),
    right: new THREE.Vector3(),
    base: new THREE.Vector3(),
    m: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
  };

  private renderAt(sec: number, dt: number) {
    const { pos, ahead, up, fwd, right, base, m, q } = this.tmp;
    const trip = this.trip;
    const s = this.timeline.distanceAt(sec);
    const here = trip.path.at(s);
    const alt = this.altitudeAt(sec);
    const g = trip.toGeo(here.p);
    ecef(g.lat, g.lon, alt, pos);
    const g2 = trip.toGeo({ x: here.p.x + here.dir.x * 3, y: here.p.y + here.dir.y * 3 });
    ecef(g2.lat, g2.lon, alt, ahead);
    up.copy(pos).normalize();
    fwd.subVectors(ahead, pos);
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    right.crossVectors(fwd, up).normalize();

    // 기울기: 원호 구간에서 선회 방향으로
    const d = trip.result.detour;
    // arcDir +1 = 반시계 = 왼쪽 선회 → 카메라를 반시계로 굴림(왼쪽 날개가 내려감)
    const targetBank = here.phase === 'ARC' && d ? d.arcDir * 0.2 : 0;
    this.bank += (targetBank - this.bank) * (1 - Math.exp(-(dt || 0.016) * 1.4));
    const D = this.timeline.duration;
    const pitch = -0.045 + 0.1 * (smooth(0, D * 0.02, sec) - smooth(D * 0.05, D * 0.08, sec)) - 0.05 * smooth(D * 0.9, D * 0.93, sec) + this.lookPitch;

    // 태풍 쪽으로 고개 돌리기: P에 다가갈 때부터 Q를 지날 때까지 (선회 안쪽 = 태풍 방향)
    const { P: tP, Q: tQ } = this.timeline.marks;
    const turnSide = d ? d.arcDir : 0;
    const autoYaw = turnSide * 0.62 * smooth(tP - D * 0.12, tP, sec) * (1 - smooth(tQ, tQ + D * 0.06, sec));

    // 카메라 방향: x=오른쪽, y=위, z=뒤
    m.makeBasis(right, up, fwd.clone().negate());
    this.camera.quaternion.setFromRotationMatrix(m);
    this.camera.rotateY(this.lookYaw + autoYaw);
    this.camera.rotateX(pitch);
    this.camera.rotateZ(this.bank);
    this.camera.position.set(0, 0, 0);
    this.world.position.copy(pos).negate();

    // 태양: 항로 기본 방향(x축) 기준 오른쪽 앞, 비행이 진행될수록 노을로
    const gb = trip.toGeo({ x: here.p.x + 50, y: here.p.y });
    ecef(gb.lat, gb.lon, alt, base).sub(pos);
    base.addScaledVector(up, -base.dot(up)).normalize();
    const baseRight = new THREE.Vector3().crossVectors(base, up).normalize();
    const u = sec / D;
    const elDeg = 34 - 31 * Math.pow(u, 1.25);
    const az = (32 - 14 * u) * (Math.PI / 180);
    const el = (elDeg * Math.PI) / 180;
    const sunDir = base.multiplyScalar(Math.cos(az)).addScaledVector(baseRight, Math.sin(az)).multiplyScalar(Math.cos(el)).addScaledVector(up, Math.sin(el)).normalize();
    const pal = paletteAt(elDeg);

    this.sky.uniforms.sunDir.value.copy(sunDir);
    this.sky.uniforms.upDir.value.copy(up);
    this.sky.uniforms.zenith.value.copy(pal.zenith);
    this.sky.uniforms.horizon.value.copy(pal.horizon);
    this.sky.uniforms.sunColor.value.copy(pal.sun);
    this.sky.uniforms.horizonDip.value = Math.sqrt((2 * alt) / 6371);
    this.atmos.sunDir.value.copy(sunDir);
    this.atmos.hazeColor.value.copy(pal.haze);
    this.atmos.skyTint.value.copy(pal.skyLight);
    this.atmos.sunColor.value.copy(pal.sun);
    (this.scene.fog as THREE.Fog).color.copy(pal.haze);
    this.sun.position.copy(sunDir).multiplyScalar(100);
    this.sun.color.copy(pal.sun);
    this.hemi.color.copy(pal.skyLight);
    this.hemi.groundColor.copy(pal.ground);
    void q;

    this.storm.update(this.playing ? dt * this.speed : dt * 0.3);
    this.renderer.render(this.scene, this.camera);
  }
}
