/**
 * 로우폴리 구름: 항로 아래에 흩어진 뭉게구름 + 태풍 소용돌이.
 * 태풍은 계산 평면의 원을 그대로 지도로 옮긴 위치에 놓인다 (수학과 화면이 같은 원을 공유).
 */
import * as THREE from 'three';
import type { Trip } from '../math/trip';
import { EARTH_R, ecef } from './globe';

/** 결정적 난수 (같은 여행이면 같은 하늘) */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

function puffGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1);
  // 아래를 살짝 납작하게 — 뭉게구름 느낌
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0) p.setY(i, y * 0.55);
  }
  g.computeVertexNormals();
  return g;
}

/** 그늘진 면도 너무 어둡지 않게: 자체 발광을 조금 더한 파스텔 구름 */
export const cloudMaterial = () =>
  new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, fog: true, emissive: new THREE.Color('#c9d6ea'), emissiveIntensity: 0.38 });

/** 항로를 따라 아래쪽에 깔리는 구름 들판 */
export function makeRouteClouds(trip: Trip, seed: number): THREE.InstancedMesh {
  const rand = rng(seed);
  const { a, b } = { a: trip.C.x, b: trip.C.y };
  const r = trip.input.radius;
  const total = trip.path.total;
  const step = Math.max(18, total / 700);
  const items: { pos: THREE.Vector3; up: THREE.Vector3; s: number; sq: number; tint: number }[] = [];
  const up = new THREE.Vector3();
  for (let s = 0; s < total; s += step) {
    const q = trip.path.at(s);
    const nrm = { x: -q.dir.y, y: q.dir.x };
    const clusters = 1 + Math.floor(rand() * 3);
    for (let c = 0; c < clusters; c++) {
      const side = rand() < 0.5 ? -1 : 1;
      const off = side * (8 + Math.pow(rand(), 0.7) * 160);
      const along = (rand() - 0.5) * step;
      const m = { x: q.p.x + nrm.x * off + q.dir.x * along, y: q.p.y + nrm.y * off + q.dir.y * along };
      if (Math.hypot(m.x - a, m.y - b) < r * 1.15) continue; // 태풍 영역은 비워 둔다
      const g = trip.toGeo(m);
      const baseAlt = 2.5 + rand() * 4.5;
      const big = 2 + rand() * 4.5;
      const n = 3 + Math.floor(rand() * 6);
      const center = ecef(g.lat, g.lon, baseAlt);
      up.copy(center).normalize();
      const tx = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0)).normalize();
      if (tx.lengthSq() < 0.5) tx.set(1, 0, 0);
      const ty = new THREE.Vector3().crossVectors(up, tx).normalize();
      for (let k = 0; k < n; k++) {
        const ang = rand() * Math.PI * 2;
        const rad = rand() * big * 1.4;
        const pos = center
          .clone()
          .addScaledVector(tx, Math.cos(ang) * rad)
          .addScaledVector(ty, Math.sin(ang) * rad)
          .addScaledVector(up, rand() * big * 0.5);
        items.push({ pos, up: up.clone(), s: big * (0.5 + rand() * 0.7), sq: 0.55 + rand() * 0.25, tint: 0.93 + rand() * 0.07 });
      }
    }
  }
  const mesh = new THREE.InstancedMesh(puffGeometry(), cloudMaterial(), items.length);
  const m = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  items.forEach((it, i) => {
    quat.setFromUnitVectors(Y, it.up);
    m.compose(it.pos, quat, new THREE.Vector3(it.s, it.s * it.sq, it.s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.setScalar(it.tint));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

export interface Storm {
  group: THREE.Group;
  /** 회전 각속도 부호: 북반구 반시계(+), 남반구 시계(−) */
  spin: 1 | -1;
  /** 계산 평면 → 렌더 좌표의 국소 선형 근사 (태풍 중심 기준) */
  basis: THREE.Matrix4;
  update: (dt: number) => void;
}

/**
 * 태풍: 눈벽 + 나선 띠 + 중심 구름덮개. 퍼프는 계산 평면의 (x, y)에 놓고,
 * 중심에서의 좌표 변환 야코비안과 지구 곡률 보정으로 렌더 좌표에 옮긴다.
 * 퍼프는 0.9r 안쪽에만 두어, 원 둘레를 따라 나는 비행기와 겹치지 않게 한다.
 */
export function makeStorm(trip: Trip, seed: number): Storm {
  const rand = rng(seed ^ 0x9e3779b9);
  const { x: a, y: b } = trip.C;
  const r = trip.input.radius;
  const c0 = trip.toGeo({ x: a, y: b });
  const P0 = ecef(c0.lat, c0.lon, 0);
  const d = Math.min(20, r * 0.05);
  const at = (dx: number, dy: number) => {
    const g = trip.toGeo({ x: a + dx, y: b + dy });
    return ecef(g.lat, g.lon, 0);
  };
  // 경도 연속성: toGeo 결과가 ±180을 넘나들어도 ecef는 같은 점이라 문제없음
  const Jx = at(d, 0).sub(at(-d, 0)).divideScalar(2 * d);
  const Jy = at(0, d).sub(at(0, -d)).divideScalar(2 * d);
  const U = P0.clone().normalize();
  const basis = new THREE.Matrix4().makeBasis(Jx, Jy, U).setPosition(P0);

  const items: { x: number; y: number; z: number; s: number; flat: number; shade: number }[] = [];
  const drop = (x: number, y: number) => (x * x + y * y) / (2 * EARTH_R); // 곡률 보정
  // 퍼프 크기: 태풍 크기에 비례하되 너무 작아지지 않게 (km)
  const sz = (k: number) => Math.max(4, r * k);
  // 눈벽: 순항 고도(15 km)보다 높이 솟은 구름 기둥
  for (let i = 0; i < 300; i++) {
    const ang = rand() * Math.PI * 2;
    const rho = r * (0.1 + rand() * 0.12);
    const x = rho * Math.cos(ang);
    const y = rho * Math.sin(ang);
    const s = sz(0.045 + rand() * 0.035);
    items.push({ x, y, z: 3 + rand() * 13 - drop(x, y), s, flat: 1.1 + rand() * 0.9, shade: 0.9 + rand() * 0.1 });
  }
  // 중심 구름덮개 (CDO): 높고 넓게 덮인 하얀 구름
  for (let i = 0; i < 560; i++) {
    const ang = rand() * Math.PI * 2;
    const rho = r * (0.2 + Math.sqrt(rand()) * 0.45);
    const x = rho * Math.cos(ang);
    const y = rho * Math.sin(ang);
    items.push({ x, y, z: 9 + rand() * 4 - drop(x, y), s: sz(0.06 + rand() * 0.06), flat: 0.35 + rand() * 0.2, shade: 0.96 + rand() * 0.04 });
  }
  // 나선 띠 4개 (로그 나선)
  const arms = 4;
  for (let k = 0; k < arms; k++) {
    const phi0 = (k / arms) * Math.PI * 2 + rand() * 0.4;
    for (let i = 0; i < 420; i++) {
      const u = rand();
      const rho = r * (0.25 + u * 0.63);
      const ang = phi0 + Math.log(rho / (0.25 * r)) * 2.1 + (rand() - 0.5) * 0.3;
      const w = r * 0.04 * (1 + u * 2);
      const x = rho * Math.cos(ang) + (rand() - 0.5) * w;
      const y = rho * Math.sin(ang) + (rand() - 0.5) * w;
      if (Math.hypot(x, y) > r * 0.88) continue;
      items.push({
        x,
        y,
        z: 2.5 + (1 - u) * 8 + rand() * 2 - drop(x, y),
        s: sz(0.03 + rand() * 0.035) * (1 - u * 0.35),
        flat: 0.6 + rand() * 0.5,
        shade: 0.88 + rand() * 0.1,
      });
    }
  }
  const mesh = new THREE.InstancedMesh(puffGeometry(), cloudMaterial(), items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  const col = new THREE.Color();
  items.forEach((it, i) => {
    // 높이(km)는 퍼프 크기와 무관하게 실제 km, 수평 크기는 r에 비례
    m.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.s, it.s * it.flat, it.s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.setRGB(it.shade, it.shade, it.shade * 1.02));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;

  const spinner = new THREE.Group();
  spinner.add(mesh);
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.matrix.copy(basis);
  group.add(spinner);
  const spin: 1 | -1 = c0.lat >= 0 ? 1 : -1;
  // 퍼프의 세로축(z)은 basis 의 U(위쪽) 방향이다. 높이 단위 km 를 유지하기 위해 Jx, Jy 크기(≈1)를 그대로 쓴다.
  return {
    group,
    spin,
    basis,
    update: (dt) => {
      spinner.rotation.z += spin * dt * 0.03;
    },
  };
}
