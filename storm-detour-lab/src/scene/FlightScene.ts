/**
 * 숄더 샷 비행 장면. 시간 τ(초) 하나로 모든 것이 정해진다:
 *   τ → (타임라인) 누적 거리 s → (경로) 계산 좌표 p → (역변환) 위도·경도 → 렌더 좌표
 *
 * 세 번에 나눠 그린다.
 *  ① 하늘: 국소 좌표계(위 = +Y)에서 Preetham 하늘
 *  ② 세계(km): 지구·구름·태풍 — 카메라를 원점에 두고 세계를 반대로 옮긴다 (부동 원점)
 *  ③ 비행기(m): 깊이를 비우고 조종사 어깨 뒤 카메라로 비행기를 그린다 (그림자·하늘 반사 포함)
 */
import * as THREE from 'three';
import type { Timeline, Trip } from '../math/trip';
import type { Phase } from '../math/detour';
import { ecef, lightingUniforms, makeEarth } from './globe';
import { Atmosphere } from './atmosphere';
import { makeRouteClouds, makeStorm, type Storm } from './clouds';
import { buildAircraft, type Aircraft } from './aircraft';
import type { CloudLayer } from './cloudSprites';

export const CRUISE_ALT_KM = 5;

export interface FlightState {
  time: number;
  distance: number;
  phase: Phase;
  altitude: number;
  playing: boolean;
  speed: number;
  done: boolean;
  x: number;
  y: number;
}
type Listener = (s: FlightState) => void;

const smooth = (e0: number, e1: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
};

/** 조종석 뒤 오른쪽 위, 어깨 너머로 기체가 살짝 보이는 자리 (비행기 좌표, m) */
const CAM_OFFSET = new THREE.Vector3(1.6, 2.5, 6.6);
const CAM_TARGET = new THREE.Vector3(-0.2, 0.1, -24);
const X_AXIS = new THREE.Vector3(1, 0, 0);

export class FlightScene {
  private renderer: THREE.WebGLRenderer;
  private atmos = new Atmosphere();
  private skyCam = new THREE.PerspectiveCamera(52, 1, 0.1, 5000);
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(52, 1, 0.02, 40000);
  private world = new THREE.Group();
  private light = lightingUniforms();
  private routeClouds: CloudLayer;
  private storm: Storm;
  private planeScene = new THREE.Scene();
  private planeCam = new THREE.PerspectiveCamera(52, 1, 0.05, 400);
  private aircraft: Aircraft;
  private sunLight = new THREE.DirectionalLight('#ffffff', 1.6);
  private hemi = new THREE.HemisphereLight('#ffffff', '#887766', 0.45);
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private lastEnvEl = 999;
  private lookQ = new THREE.Quaternion();
  private raf = 0;
  private last = 0;
  private clock = 0;
  private listeners = new Set<Listener>();
  private lastEmit = 0;
  private ro: ResizeObserver;

  time = 0;
  speed = 1;
  playing = false;
  frozen = false;
  private bank = 0;

  constructor(
    private host: HTMLElement,
    private trip: Trip,
    private timeline: Timeline,
    seed = 1,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.55;
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'scene-canvas';
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.scene.add(this.world);
    this.world.add(makeEarth(this.light));
    this.routeClouds = makeRouteClouds(trip, seed, this.light);
    this.world.add(this.routeClouds.mesh);
    this.storm = makeStorm(trip, seed, this.light);
    this.world.add(this.storm.group);

    this.aircraft = buildAircraft();
    this.planeScene.add(this.aircraft.group);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    const sc = this.sunLight.shadow.camera;
    sc.left = sc.bottom = -7;
    sc.right = sc.top = 7;
    sc.near = 0.5;
    sc.far = 60;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.03;
    this.planeScene.add(this.sunLight, this.sunLight.target, this.hemi);
    this.lookQ.setFromRotationMatrix(new THREE.Matrix4().lookAt(CAM_OFFSET, CAM_TARGET, new THREE.Vector3(0, 1, 0)));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
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
    for (const sc of [this.scene, this.planeScene]) {
      sc.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
    }
    this.envRT?.dispose();
    this.pmrem.dispose();
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
    const fov = w / h < 1 ? 72 : 52;
    for (const c of [this.camera, this.skyCam, this.planeCam]) {
      c.aspect = w / h;
      c.fov = fov;
      c.updateProjectionMatrix();
    }
  }

  private altitudeAt(sec: number) {
    const D = this.timeline.duration;
    return 0.4 + (CRUISE_ALT_KM - 0.4) * smooth(0, D * 0.07, sec) - (CRUISE_ALT_KM - 0.7) * smooth(D * 0.9, D, sec);
  }

  private loop(now: number) {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    this.clock += dt;
    if (this.playing) {
      this.time += dt * this.speed;
      if (this.time >= this.timeline.duration) {
        this.time = this.timeline.duration;
        this.playing = false;
        this.emit(true);
      }
    }
    if (!this.frozen) this.renderAt(this.time, dt);
    this.emit();
    this.raf = requestAnimationFrame(this.loop);
  }

  private v = {
    pos: new THREE.Vector3(),
    ahead: new THREE.Vector3(),
    up: new THREE.Vector3(),
    fwd: new THREE.Vector3(),
    right: new THREE.Vector3(),
    back: new THREE.Vector3(),
    base: new THREE.Vector3(),
    baseRight: new THREE.Vector3(),
    sun: new THREE.Vector3(),
    sunLocal: new THREE.Vector3(),
    sunPlane: new THREE.Vector3(),
    m: new THREE.Matrix4(),
    qFrame: new THREE.Quaternion(),
    qFrameInv: new THREE.Quaternion(),
    qFrameP: new THREE.Quaternion(),
    qRig: new THREE.Quaternion(),
    qTmp: new THREE.Quaternion(),
    e: new THREE.Euler(),
  };

  private renderAt(sec: number, dt: number) {
    const V = this.v;
    const trip = this.trip;
    const D = this.timeline.duration;
    const s = this.timeline.distanceAt(sec);
    const here = trip.path.at(s);
    const alt = this.altitudeAt(sec);
    const g = trip.toGeo(here.p);
    ecef(g.lat, g.lon, alt, V.pos);
    const g2 = trip.toGeo({ x: here.p.x + here.dir.x * 2, y: here.p.y + here.dir.y * 2 });
    ecef(g2.lat, g2.lon, alt, V.ahead);
    V.up.copy(V.pos).normalize();
    V.fwd.subVectors(V.ahead, V.pos);
    V.fwd.addScaledVector(V.up, -V.fwd.dot(V.up)).normalize();
    V.right.crossVectors(V.fwd, V.up).normalize();
    V.back.copy(V.fwd).negate();
    V.m.makeBasis(V.right, V.up, V.back);
    V.qFrame.setFromRotationMatrix(V.m);
    V.qFrameInv.copy(V.qFrame).invert();

    // 상승·하강 자세
    const pitch = 0.09 * (smooth(0, D * 0.01, sec) - smooth(D * 0.05, D * 0.075, sec)) - 0.05 * (smooth(D * 0.9, D * 0.92, sec) - smooth(D * 0.985, D, sec));
    V.qFrameP.copy(V.qFrame).multiply(V.qTmp.setFromAxisAngle(X_AXIS, pitch));

    // 원호 구간: 선회 방향으로 기울이고, 카메라는 태풍 쪽을 바라보도록 살짝 돈다
    const d = trip.result.detour;
    const turn = d ? d.arcDir : 0;
    // 시간의 함수로 정해 두어 구간을 건너뛰어도 자세가 바로 맞는다
    const { P: tP, Q: tQ } = this.timeline.marks;
    this.bank = turn * 0.3 * smooth(tP - 2.5, tP + 2.5, sec) * (1 - smooth(tQ - 2.5, tQ + 2.5, sec));
    const yaw = turn * 0.42 * smooth(tP - D * 0.1, tP, sec) * (1 - smooth(tQ, tQ + D * 0.06, sec));
    const t = this.clock;

    // 비행기 (프레임 공간): 기울기 + 잔잔한 흔들림
    this.aircraft.group.rotation.set(0.012 * Math.sin(t * 0.53), 0, this.bank + 0.018 * Math.sin(t * 0.71) + 0.008 * Math.sin(t * 1.9));
    this.aircraft.group.position.y = 0.05 * Math.sin(t * 1.1);
    this.aircraft.update(t, dt);
    // 카메라: 기울기의 일부만 따라가 지평선이 기울어지는 것이 느껴지게
    V.e.set(0, yaw, this.bank * 0.7, 'ZYX');
    V.qRig.setFromEuler(V.e);
    this.planeCam.position.copy(CAM_OFFSET).applyQuaternion(V.qRig);
    this.planeCam.quaternion.copy(V.qRig).multiply(this.lookQ);

    // 세계 카메라 = 프레임 × 카메라 자세. 위치는 원점이고 세계를 반대로 옮긴다
    this.camera.quaternion.copy(V.qFrameP).multiply(this.planeCam.quaternion);
    this.camera.position.set(0, 0, 0);
    this.world.position.copy(V.pos).negate();
    // 하늘 카메라: 국소 좌표계(위 = Y)
    this.skyCam.quaternion.copy(V.qFrameInv).multiply(this.camera.quaternion);

    // 태양: 항로 기본 방향(x축)의 오른쪽 앞. 비행이 진행될수록 노을로
    const gb = trip.toGeo({ x: here.p.x + 50, y: here.p.y });
    ecef(gb.lat, gb.lon, alt, V.base).sub(V.pos);
    V.base.addScaledVector(V.up, -V.base.dot(V.up)).normalize();
    V.baseRight.crossVectors(V.base, V.up).normalize();
    const u = sec / D;
    const elDeg = 30 - 28.2 * Math.pow(u, 1.3);
    const az = ((34 - 16 * u) * Math.PI) / 180;
    const el = (elDeg * Math.PI) / 180;
    V.sun
      .copy(V.base)
      .multiplyScalar(Math.cos(az))
      .addScaledVector(V.baseRight, Math.sin(az))
      .multiplyScalar(Math.cos(el))
      .addScaledVector(V.up, Math.sin(el))
      .normalize();
    V.sunLocal.copy(V.sun).applyQuaternion(V.qFrameInv);
    this.atmos.setSun(V.sunLocal, elDeg);
    const L = this.atmos.lighting;
    this.light.sunDir.value.copy(V.sun);
    this.light.upDir.value.copy(V.up);
    this.light.sunColor.value.copy(L.sun);
    this.light.ambient.value.copy(L.ambient);
    this.light.haze.value.copy(L.haze);
    this.light.hazeDist.value = (80 + 30 * alt) * (0.75 + 0.25 * Math.min(1, elDeg / 15));
    this.light.time.value = t;

    // 비행기 조명: 햇빛을 프레임 공간으로
    V.sunPlane.copy(V.sun).applyQuaternion(V.qTmp.copy(V.qFrameP).invert());
    this.sunLight.position.copy(V.sunPlane).multiplyScalar(25);
    this.sunLight.color.copy(L.sun);
    this.hemi.color.copy(L.ambient);
    this.hemi.groundColor.copy(L.haze).multiplyScalar(0.45);
    if (Math.abs(elDeg - this.lastEnvEl) > 0.8) {
      this.lastEnvEl = elDeg;
      const rt = this.pmrem.fromScene(this.atmos.envScene, 0, 0.1, 100);
      this.envRT?.dispose();
      this.envRT = rt;
      this.planeScene.environment = rt.texture;
      this.planeScene.environmentIntensity = 0.55;
    }

    // 구름
    this.storm.update(this.playing ? dt * this.speed : dt * 0.3);
    this.world.updateMatrixWorld();
    this.routeClouds.sort(8);
    this.storm.layer.sort(5);

    // 그리기
    const r = this.renderer;
    r.setRenderTarget(null);
    r.clear();
    r.render(this.atmos.scene, this.skyCam);
    r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.planeScene, this.planeCam);
  }
}
