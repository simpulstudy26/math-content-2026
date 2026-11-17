/**
 * 대기: three.js Sky(Preetham 모델)로 하늘을 그리고, 같은 식을 JS로 옮겨
 * 지평선 연무색·하늘 조명색·햇빛 색을 계산한다 → 지구·구름·비행기가 같은 하늘빛을 받는다.
 * 하늘은 "국소 좌표계(위 = +Y)"에서 그린다 (Sky 셰이더가 y를 위로 가정하기 때문).
 */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export interface SkyParams {
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
}

type V3 = [number, number, number];
const totalRayleigh: V3 = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MieConst: V3 = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const cutoffAngle = 1.6110731556870734;
const steepness = 1.5;
const EE = 1000;

/** Sky.js 셰이더와 같은 식 (위 = (0,1,0)) — 방향 d 의 하늘 휘도 (선형) */
export function skyRadiance(d: THREE.Vector3, sun: THREE.Vector3, p: SkyParams, withSunDisk = false): V3 {
  const sunE = EE * Math.max(0, 1 - Math.exp(-(cutoffAngle - Math.acos(Math.max(-1, Math.min(1, sun.y)))) / steepness));
  const sunfade = 1; // 단위벡터 태양 위치에서 Sky.js 의 vSunfade ≈ 1
  const rc = p.rayleigh - (1 - sunfade);
  const betaR: V3 = [totalRayleigh[0] * rc, totalRayleigh[1] * rc, totalRayleigh[2] * rc];
  const c = 0.2 * p.turbidity * 10e-18;
  const betaM: V3 = [0.434 * c * MieConst[0] * p.mieCoefficient, 0.434 * c * MieConst[1] * p.mieCoefficient, 0.434 * c * MieConst[2] * p.mieCoefficient];
  const zen = Math.acos(Math.max(0, d.y));
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - (zen * 180) / Math.PI, -1.253));
  const sR = 8.4e3 * inv;
  const sM = 1.25e3 * inv;
  const cosT = d.dot(sun);
  const rPhase = 0.05968310365946075 * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
  const g = p.mieDirectionalG;
  const mPhase = 0.07957747154594767 * ((1 - g * g) / Math.pow(1 - 2 * g * cosT + g * g, 1.5));
  const mixK = Math.min(1, Math.max(0, Math.pow(1 - sun.y, 5)));
  const out: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const Fex = Math.exp(-(betaR[i] * sR + betaM[i] * sM));
    const ratio = (betaR[i] * rPhase + betaM[i] * mPhase) / (betaR[i] + betaM[i]);
    let Lin = Math.pow(sunE * ratio * (1 - Fex), 1.5);
    Lin *= 1 + (Math.pow(sunE * ratio * Fex, 0.5) - 1) * mixK;
    let L0 = 0.1 * Fex;
    if (withSunDisk && cosT > 0.99995) L0 += sunE * 19000 * Fex;
    const tex = (Lin + L0) * 0.04 + [0, 0.0003, 0.00075][i];
    out[i] = Math.pow(tex, 1 / (1.2 + 1.2 * sunfade));
  }
  return out;
}

/** 태양 방향의 투과율 (햇빛 색) */
export function sunTransmittance(sun: THREE.Vector3, p: SkyParams): V3 {
  const rc = p.rayleigh;
  const c = 0.2 * p.turbidity * 10e-18;
  const zen = Math.acos(Math.max(0, sun.y));
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(Math.max(0.5, 93.885 - (zen * 180) / Math.PI), -1.253));
  const out: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const bR = totalRayleigh[i] * rc;
    const bM = 0.434 * c * MieConst[i] * p.mieCoefficient;
    out[i] = Math.exp(-(bR * 8.4e3 + bM * 1.25e3) * inv);
  }
  return out;
}

export interface Lighting {
  /** 지평선 연무색 (대기 원근의 목표색) */
  haze: THREE.Color;
  /** 하늘에서 오는 확산광 */
  ambient: THREE.Color;
  /** 햇빛 (색 × 세기) */
  sun: THREE.Color;
}

export class Atmosphere {
  readonly scene = new THREE.Scene();
  readonly sky = new Sky();
  readonly params: SkyParams = { turbidity: 3, rayleigh: 1.4, mieCoefficient: 0.005, mieDirectionalG: 0.82 };
  /** 국소 좌표계에서의 태양 방향 */
  readonly sunLocal = new THREE.Vector3(0, 1, 0);
  readonly lighting: Lighting = { haze: new THREE.Color(), ambient: new THREE.Color(), sun: new THREE.Color() };
  /** PMREM 반사용 하늘 (같은 재질 공유) */
  readonly envScene = new THREE.Scene();

  constructor() {
    this.sky.scale.setScalar(1000);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    const envSky = new THREE.Mesh(this.sky.geometry, this.sky.material);
    envSky.scale.setScalar(10);
    this.envScene.add(envSky);
  }

  /** 태양 고도 elDeg(도), 국소 방위각 azRad (−Z = 앞, +X = 오른쪽 기준) */
  setSun(sunLocal: THREE.Vector3, elDeg: number) {
    this.sunLocal.copy(sunLocal).normalize();
    // 해가 낮을수록 탁하고 붉게
    const low = 1 - Math.min(1, Math.max(0, (elDeg - 2) / 28));
    this.params.turbidity = 2.6 + 4.2 * low;
    this.params.rayleigh = 1.3 + 1.6 * low;
    this.params.mieCoefficient = 0.004 + 0.006 * low;
    this.params.mieDirectionalG = 0.8 + 0.06 * low;
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    u.turbidity.value = this.params.turbidity;
    u.rayleigh.value = this.params.rayleigh;
    u.mieCoefficient.value = this.params.mieCoefficient;
    u.mieDirectionalG.value = this.params.mieDirectionalG;
    u.sunPosition.value.copy(this.sunLocal);
    u.up.value.set(0, 1, 0);
    this.computeLighting(elDeg);
  }

  private computeLighting(elDeg: number) {
    const s = this.sunLocal;
    const p = this.params;
    const sunAz = Math.atan2(s.x, -s.z);
    // 지평선 연무: 여러 방위의 지평선 바로 위 평균 (해 쪽에 가중)
    const acc = [0, 0, 0];
    let wsum = 0;
    const d = new THREE.Vector3();
    for (let k = 0; k < 12; k++) {
      const az = sunAz + (k / 12) * Math.PI * 2;
      const el = 0.035;
      d.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      const w = 1 + 0.6 * Math.cos((k / 12) * Math.PI * 2);
      const c = skyRadiance(d, s, p);
      for (let i = 0; i < 3; i++) acc[i] += c[i] * w;
      wsum += w;
    }
    this.lighting.haze.setRGB(acc[0] / wsum, acc[1] / wsum, acc[2] / wsum, THREE.LinearSRGBColorSpace);
    // 하늘 확산광: 위쪽 반구 평균
    const amb = [0, 0, 0];
    let n = 0;
    for (let k = 0; k < 16; k++) {
      for (const el of [0.3, 0.75, 1.3]) {
        const az = (k / 16) * Math.PI * 2;
        d.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
        const c = skyRadiance(d, s, p);
        for (let i = 0; i < 3; i++) amb[i] += c[i];
        n++;
      }
    }
    this.lighting.ambient.setRGB(amb[0] / n, amb[1] / n, amb[2] / n, THREE.LinearSRGBColorSpace);
    // 햇빛: 대기 투과율 × 세기 (지평선 아래로 가면 사라짐)
    const T = sunTransmittance(s, p);
    const k = 3.2 * Math.min(1, Math.max(0, (elDeg + 1.5) / 5));
    this.lighting.sun.setRGB(T[0] * k, T[1] * k, T[2] * k, THREE.LinearSRGBColorSpace);
  }
}
