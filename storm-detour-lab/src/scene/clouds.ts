/**
 * 구름 배치: 항로 아래 뭉게구름·층적운 + 태풍(눈벽·중심 구름덮개·나선 띠).
 * 태풍은 계산 평면의 원을 그대로 지도로 옮긴 위치에 놓인다 (수학과 화면이 같은 원을 공유).
 */
import * as THREE from 'three';
import type { Trip } from '../math/trip';
import { EARTH_R, ecef, type LightingUniforms } from './globe';
import { CloudLayer, type Puff } from './cloudSprites';

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

export function makeRouteClouds(trip: Trip, seed: number, lighting: LightingUniforms): CloudLayer {
  const rand = rng(seed);
  const { x: a, y: b } = trip.C;
  const r = trip.input.radius;
  const total = trip.path.total;
  const step = Math.max(9, total / 650);
  // 빠르게 지나가는 장거리 비행일수록 가까운 구름을 비워 눈이 편하게
  const clear = Math.max(4, total * 0.0028);
  const puffs: Puff[] = [];
  const up = new THREE.Vector3();
  const tx = new THREE.Vector3();
  const ty = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const place = (mx: number, my: number) => {
    const g = trip.toGeo({ x: mx, y: my });
    const c = ecef(g.lat, g.lon, 0);
    up.copy(c).normalize();
    tx.crossVectors(up, Y);
    if (tx.lengthSq() < 1e-6) tx.set(1, 0, 0);
    tx.normalize();
    ty.crossVectors(up, tx).normalize();
    return c;
  };
  const push = (c: THREE.Vector3, dx: number, dy: number, alt: number, size: number, squash: number, shade: number) => {
    const p = c.clone().addScaledVector(tx, dx).addScaledVector(ty, dy).addScaledVector(up, alt);
    puffs.push({ x: p.x, y: p.y, z: p.z, size, squash, shade });
  };

  for (let s = 0; s < total && puffs.length < 7000; s += step) {
    const q = trip.path.at(s);
    const nx = -q.dir.y;
    const ny = q.dir.x;
    // 뭉게구름 무리
    const clusters = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < clusters; k++) {
      const side = rand() < 0.5 ? -1 : 1;
      const off = side * (clear + Math.pow(rand(), 0.8) * 140);
      const along = (rand() - 0.5) * step;
      const mx = q.p.x + nx * off + q.dir.x * along;
      const my = q.p.y + ny * off + q.dir.y * along;
      if (Math.hypot(mx - a, my - b) < r * 1.12) continue; // 태풍 영역은 비운다
      const c = place(mx, my);
      const base = 1.1 + rand() * 1.2;
      const big = 0.9 + rand() * 1.4;
      const n = 5 + Math.floor(rand() * 8);
      for (let i = 0; i < n; i++) {
        const ang = rand() * Math.PI * 2;
        const rad = Math.sqrt(rand()) * big * 1.6;
        const h = rand();
        push(c, Math.cos(ang) * rad, Math.sin(ang) * rad, base + h * big * 1.3, big * (1.5 - h * 0.6) * (0.7 + rand() * 0.5), 0.75 + rand() * 0.2, 0.82 + h * 0.2);
      }
    }
    // 층적운 조각 (넓고 납작)
    if (rand() < 0.45) {
      const side = rand() < 0.5 ? -1 : 1;
      const off = side * (clear * 1.5 + rand() * 120);
      const mx = q.p.x + nx * off;
      const my = q.p.y + ny * off;
      if (Math.hypot(mx - a, my - b) > r * 1.15) {
        const c = place(mx, my);
        for (let i = 0; i < 6; i++) {
          push(c, (rand() - 0.5) * 14, (rand() - 0.5) * 14, 1.3 + rand() * 0.4, 4 + rand() * 5, 0.35, 0.9 + rand() * 0.1);
        }
      }
    }
    // 멀리 솟은 적란운 (순항 고도 근처까지)
    if (rand() < 0.06) {
      const side = rand() < 0.5 ? -1 : 1;
      const off = side * (35 + rand() * 120);
      const mx = q.p.x + nx * off;
      const my = q.p.y + ny * off;
      if (Math.hypot(mx - a, my - b) > r * 1.2) {
        const c = place(mx, my);
        for (let i = 0; i < 26; i++) {
          const h = i / 26;
          const ang = rand() * Math.PI * 2;
          const rad = rand() * 2.2 * (1 - h * 0.4);
          push(c, Math.cos(ang) * rad, Math.sin(ang) * rad, 1.5 + h * 7, 2.6 + rand() * 1.5 + (h > 0.85 ? 3 : 0), 0.85, 0.78 + h * 0.3);
        }
      }
    }
  }
  return new CloudLayer(puffs, lighting, false);
}

export interface Storm {
  group: THREE.Group;
  layer: CloudLayer;
  update: (dt: number) => void;
}

/**
 * 태풍: 눈벽(순항 고도보다 높이 솟음) + 중심 구름덮개 + 나선 띠.
 * 퍼프는 계산 평면 좌표 (x, y)에 놓고, 태풍 중심에서의 좌표 변환 야코비안과 지구 곡률 보정으로 옮긴다.
 * 퍼프는 원 안쪽에만 두어, 원 둘레를 따라 나는 비행기와 겹치지 않는다.
 */
export function makeStorm(trip: Trip, seed: number, lighting: LightingUniforms): Storm {
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
  const Jx = at(d, 0).sub(at(-d, 0)).divideScalar(2 * d);
  const Jy = at(0, d).sub(at(0, -d)).divideScalar(2 * d);
  const U = P0.clone().normalize();
  const basis = new THREE.Matrix4().makeBasis(Jx, Jy, U).setPosition(P0);

  const puffs: Puff[] = [];
  const drop = (x: number, y: number) => (x * x + y * y) / (2 * EARTH_R);
  const add = (rho: number, ang: number, z: number, size: number, squash: number, shade: number) => {
    const x = rho * Math.cos(ang);
    const y = rho * Math.sin(ang);
    // 퍼프 가장자리가 원 밖으로 나가지 않게
    if (rho + size * 0.5 > r - Math.max(2.5, r * 0.015)) return; // 항로(원 둘레)와 겹치지 않게
    puffs.push({ x, y, z: z - drop(x, y), size, squash, shade });
  };
  // 퍼프 크기: 태풍 크기에 비례하되, 큰 태풍에서도 뭉게구름 결이 보이도록 상한을 둔다
  const S = (k: number, min: number, max = 11) => Math.min(max, Math.max(min, r * k));

  // 눈벽: 낮은 곳부터 순항 고도보다 높이
  for (let i = 0; i < 320; i++) {
    const z = 1.5 + Math.pow(rand(), 0.8) * 14;
    add(r * (0.09 + rand() * 0.1), rand() * Math.PI * 2, z, S(0.07, 3) * (0.8 + rand() * 0.6), 0.9, 0.62 + (z / 15.5) * 0.42);
  }
  // 중심 구름덮개(CDO): 높고 넓게 덮인 하얀 구름
  for (let i = 0; i < 560; i++) {
    const rho = r * (0.15 + Math.sqrt(rand()) * 0.5);
    add(rho, rand() * Math.PI * 2, 9.5 + rand() * 3.5, S(0.1, 5, 16) * (0.8 + rand() * 0.8), 0.5, 0.95 + rand() * 0.1);
  }
  // 나선 띠 4개 (로그 나선)
  for (let k = 0; k < 4; k++) {
    const phi0 = (k / 4) * Math.PI * 2 + rand() * 0.4;
    for (let i = 0; i < 460; i++) {
      const u = rand();
      const rho = r * (0.25 + u * 0.66);
      const ang = phi0 + Math.log(rho / (0.25 * r)) * 2.1 + (rand() - 0.5) * 0.28;
      const z = 1.2 + (1 - u) * 7 + rand() * 2.5;
      add(rho + (rand() - 0.5) * r * 0.05, ang, z, S(0.05, 2.5) * (0.7 + rand() * 0.7) * (1 - u * 0.3), 0.72, 0.72 + (z / 11) * 0.35);
    }
  }
  // 바깥 구름벽: 진입 금지 원 바로 안쪽에 높이 솟아, 비행기 옆으로 태풍이 보이게
  const wallN = Math.round(Math.min(2400, 300 + r * 2.2));
  for (let i = 0; i < wallN; i++) {
    const z = 1.2 + Math.pow(rand(), 0.9) * 12.5;
    const size = S(0.04, 3.5, 9) * (0.8 + rand() * 0.7);
    const margin = Math.max(3, r * 0.02) + rand() * r * 0.06;
    const rho = r - margin - size * 0.5;
    add(rho, rand() * Math.PI * 2, z, size, 0.85, 0.55 + (z / 14) * 0.5);
  }
  const layer = new CloudLayer(puffs, lighting, true);
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.matrix.copy(basis);
  group.add(layer.mesh);
  const spin = c0.lat >= 0 ? 1 : -1; // 북반구 반시계, 남반구 시계
  return {
    group,
    layer,
    update: (dt) => {
      layer.uniforms.uSpin.value += spin * dt * 0.025;
    },
  };
}
