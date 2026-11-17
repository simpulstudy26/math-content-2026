/**
 * 출발·도착 공항 (양식화된 모형). 활주로는 그 공항에서의 항로 방향(이륙: 접선 OP, 착륙: 접선 QA)에 맞춘다.
 * 실제 인천·목적지 공항의 활주로 배치와는 다르다. 단위: 내부는 m, 그룹 배율 0.001로 km 세계에 놓는다.
 * 지역 좌표: +X 활주로 진행 방향, +Y 위, +Z 오른쪽(터미널 쪽).
 */
import * as THREE from 'three';
import type { Trip } from '../math/trip';
import type { Vec2 } from '../math/vec';
import { ecef } from './globe';
import { buildAirliner } from './airliner';
import { rng } from './clouds';

/** 공항 지면을 지구 구면보다 살짝 띄우는 높이 (km) */
export const AIRPORT_LIFT_KM = 0.004;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

function noiseFill(g: CanvasRenderingContext2D, w: number, h: number, base: string, amp: number, n = 6000, rand = Math.random) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (rand() - 0.5) * amp;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 3);
  }
}

/** 활주로 표지 (길이 L m, 폭 60 m) */
function runwayTexture(L: number, numA: string, numB: string) {
  const W = 4096;
  const H = 96;
  const k = W / L; // px per m (길이 방향)
  const kz = H / 60;
  return canvasTex(W, H, (g) => {
    noiseFill(g, W, H, '#3d3f42', 0.12, 30000);
    // 접지 자국
    g.fillStyle = 'rgba(20,20,20,0.35)';
    for (const x0 of [300, L - 1200]) g.fillRect(x0 * k, H * 0.38, 900 * k, H * 0.24);
    g.fillStyle = '#f2f2ee';
    // 가장자리선
    g.fillRect(0, 1.5 * kz, W, 0.9 * kz);
    g.fillRect(0, H - 2.4 * kz, W, 0.9 * kz);
    // 중심선 점선
    for (let x = 160; x < L - 160; x += 60) g.fillRect(x * k, H / 2 - 0.45 * kz, 36 * k, 0.9 * kz);
    // 문턱 피아노 건반 + 번호
    const ends: [number, number, string][] = [
      [0, 1, numA],
      [L, -1, numB],
    ];
    for (const [x0, dir, num] of ends) {
      for (let i = 0; i < 8; i++) {
        const zc = (i < 4 ? 6 + i * 6 : 30 + (i - 4) * 6 + 6) * kz;
        const x = x0 + dir * 6;
        g.fillRect(Math.min(x, x + dir * 30) * k, zc - 1.0 * kz, 30 * k, 2.0 * kz);
      }
      // 번호 (활주로 방향으로 세워 씀)
      g.save();
      g.translate((x0 + dir * 60) * k, H / 2);
      g.rotate(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      g.font = `bold ${Math.round(18 * kz)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.scale(1, (k * 1.8) / kz);
      g.fillText(num, 0, 0);
      g.restore();
      // 착지 지점 표지
      for (const off of [300, 450, 600]) {
        const x = x0 + dir * off;
        g.fillRect(Math.min(x, x + dir * 22) * k, 8 * kz, 22 * k, 3 * kz);
        g.fillRect(Math.min(x, x + dir * 22) * k, H - 11 * kz, 22 * k, 3 * kz);
      }
      const x = x0 + dir * 400;
      g.fillRect(Math.min(x, x + dir * 45) * k, 14 * kz, 45 * k, 6 * kz);
      g.fillRect(Math.min(x, x + dir * 45) * k, H - 20 * kz, 45 * k, 6 * kz);
    }
  });
}

/** 방위각(도) → 활주로 번호 "09" 등 */
function rwyNum(azDeg: number) {
  let n = Math.round((((azDeg % 360) + 360) % 360) / 10);
  if (n === 0) n = 36;
  return String(n).padStart(2, '0');
}

export interface AirportSpec {
  /** 계산 좌표에서 기준점 (비행기 출발점 또는 정지점) */
  at: Vec2;
  /** 계산 좌표에서 활주로 진행 방향 (단위벡터) */
  dir: Vec2;
  /** 활주로 지역 x 범위 (m) */
  x0: number;
  x1: number;
  seed: number;
}

export function airportSpecs(trip: Trip): { origin: AirportSpec; dest: AirportSpec } {
  const d = trip.result.detour;
  const u1 = d ? { x: d.P.x / d.lO, y: d.P.y / d.lO } : { x: 1, y: 0 };
  const u3 = d ? { x: (trip.t - d.Q.x) / d.lA, y: -d.Q.y / d.lA } : { x: 1, y: 0 };
  return {
    origin: { at: { x: 0, y: 0 }, dir: u1, x0: -500, x1: 3800, seed: 11 },
    dest: { at: { x: trip.t, y: 0 }, dir: u3, x0: -3500, x1: 800, seed: 23 },
  };
}

export function makeAirport(trip: Trip, spec: AirportSpec): THREE.Group {
  const rand = rng(spec.seed);
  // 지역 좌표계
  const g0 = trip.toGeo(spec.at);
  const g1 = trip.toGeo({ x: spec.at.x + spec.dir.x, y: spec.at.y + spec.dir.y });
  const P = ecef(g0.lat, g0.lon, 0);
  const up = P.clone().normalize();
  const X = ecef(g1.lat, g1.lon, 0).sub(P);
  X.addScaledVector(up, -X.dot(up)).normalize();
  const Z = new THREE.Vector3().crossVectors(X, up).normalize();
  // 활주로 방위 (북쪽 기준 시계방향)
  const north = new THREE.Vector3(0, 1, 0).addScaledVector(up, -up.y).normalize();
  const east = new THREE.Vector3().crossVectors(north, up).normalize();
  const az = (Math.atan2(X.dot(east), X.dot(north)) * 180) / Math.PI;

  const root = new THREE.Group();
  root.matrixAutoUpdate = false;
  root.matrix.makeBasis(X, up, Z).scale(new THREE.Vector3(0.001, 0.001, 0.001)).setPosition(P.clone().addScaledVector(up, AIRPORT_LIFT_KM));

  const flat = (w: number, d: number, mat: THREE.Material, x: number, z: number, y = 0) => {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    root.add(m);
    return m;
  };

  const L = spec.x1 - spec.x0;
  const cx = (spec.x0 + spec.x1) / 2;

  // 잔디 들판 (가장자리는 투명하게 바다·땅에 녹아들게)
  const grass = canvasTex(
    512,
    512,
    (g) => {
      noiseFill(g, 512, 512, '#6f8f4e', 0.16, 26000);
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)';
        g.fillRect(0, i * 32, 512, 32);
      }
    },
    [18, 12],
  );
  const fade = canvasTex(256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    gr.addColorStop(0, '#fff');
    gr.addColorStop(1, '#000');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  });
  fade.colorSpace = THREE.NoColorSpace;
  flat(L + 5000, 7000, new THREE.MeshStandardMaterial({ map: grass, alphaMap: fade, transparent: true, depthWrite: false, roughness: 1 }), cx, 600, -0.3);

  // 활주로
  const numA = rwyNum(az);
  const numB = rwyNum(az + 180);
  flat(L, 60, new THREE.MeshStandardMaterial({ map: runwayTexture(L, numA, numB), roughness: 0.92 }), cx, 0, 0.05);
  // 유도로 + 연결로
  const taxiTex = canvasTex(1024, 32, (g) => {
    noiseFill(g, 1024, 32, '#4a4c4f', 0.1, 4000);
    g.fillStyle = '#e8b830';
    g.fillRect(0, 15, 1024, 2);
  });
  taxiTex.wrapS = THREE.RepeatWrapping;
  taxiTex.repeat.set(L / 200, 1);
  const taxiMat = new THREE.MeshStandardMaterial({ map: taxiTex, roughness: 0.9 });
  flat(L - 200, 24, taxiMat, cx, 190, 0.04);
  for (let x = spec.x0 + 250; x < spec.x1 - 100; x += 900) flat(24, 160, new THREE.MeshStandardMaterial({ color: '#4a4c4f', roughness: 0.9 }), x, 105, 0.03);

  // 계류장
  const apronTex = canvasTex(1024, 256, (g) => {
    noiseFill(g, 1024, 256, '#9a9c9c', 0.08, 12000);
    g.strokeStyle = 'rgba(60,60,60,0.25)';
    for (let x = 0; x < 1024; x += 32) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 256);
      g.stroke();
    }
    for (let y = 0; y < 256; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(1024, y);
      g.stroke();
    }
    g.strokeStyle = '#e8b830';
    g.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(140 + i * 190, 256);
      g.quadraticCurveTo(140 + i * 190, 120, 200 + i * 190, 40);
      g.stroke();
    }
  });
  const apronX = cx;
  flat(1000, 260, new THREE.MeshStandardMaterial({ map: apronTex, roughness: 0.85 }), apronX, 360, 0.02);

  // 터미널: 유리 외벽 + 곡면 지붕
  const glass = canvasTex(1024, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#9fc1d8');
    gr.addColorStop(1, '#3b566d');
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 128);
    g.strokeStyle = 'rgba(230,236,240,0.7)';
    g.lineWidth = 2;
    for (let x = 0; x < 1024; x += 16) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 128);
      g.stroke();
    }
    for (let y = 0; y < 128; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(1024, y);
      g.stroke();
    }
  });
  const termW = 760;
  const term = new THREE.Mesh(new THREE.BoxGeometry(termW, 24, 80), [
    new THREE.MeshStandardMaterial({ color: '#d9dcdc', roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: '#d9dcdc', roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: '#cfd3d6', roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ color: '#cfd3d6' }),
    new THREE.MeshStandardMaterial({ color: '#d9dcdc' }),
    new THREE.MeshStandardMaterial({ map: glass, roughness: 0.08, metalness: 0.5 }),
  ]);
  // BoxGeometry 면 순서: +x, −x, +y, −y, +z, −z → 활주로를 보는 면(−z)에 유리
  term.position.set(apronX, 12, 560);
  term.castShadow = term.receiveShadow = true;
  root.add(term);
  const roofGeo = new THREE.CylinderGeometry(70, 70, termW + 40, 40, 1, false, Math.PI / 2 - 0.75, 1.5);
  roofGeo.rotateZ(Math.PI / 2);
  roofGeo.scale(1, 0.32, 1);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: '#e8ebee', roughness: 0.3, metalness: 0.6 }));
  roof.position.set(apronX, 7.6, 560);
  root.add(roof);
  // 탑승교 + 주기된 비행기
  const parked = buildAirliner();
  parked.update(0, 0, 1);
  for (let i = 0; i < 4; i++) {
    const x = apronX - 300 + i * 200;
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 70), new THREE.MeshStandardMaterial({ color: '#c9cdd1', roughness: 0.5 }));
    bridge.position.set(x - 14, 6, 485);
    root.add(bridge);
    const pl = parked.group.clone();
    pl.position.set(x, 3.3, 445);
    pl.rotation.y = Math.PI; // 기수가 터미널(+z) 쪽
    root.add(pl);
  }

  // 관제탑
  const towerX = spec.x0 + L * 0.72;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 72, 20), new THREE.MeshStandardMaterial({ color: '#e3e3e0', roughness: 0.6 }));
  shaft.position.set(towerX, 36, 520);
  root.add(shaft);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(12, 9, 9, 20), new THREE.MeshStandardMaterial({ color: '#25404f', roughness: 0.1, metalness: 0.6 }));
  cab.position.set(towerX, 76, 520);
  root.add(cab);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(9, 13, 3, 20), new THREE.MeshStandardMaterial({ color: '#f0f0ee' }));
  cap.position.set(towerX, 82, 520);
  root.add(cap);

  // 격납고
  for (let i = 0; i < 3; i++) {
    const hx = spec.x0 + L * 0.82 + i * 140;
    const hg = new THREE.CylinderGeometry(45, 45, 90, 24, 1, false, Math.PI / 2, Math.PI);
    hg.rotateX(Math.PI / 2); // 축 = Z (문이 활주로 쪽)
    hg.scale(1, 0.55, 1);
    const h = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ color: '#b9bec3', roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide }));
    h.position.set(hx, 0, 470);
    root.add(h);
  }
  // 연료 탱크
  for (let i = 0; i < 4; i++) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 16, 20), new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.5 }));
    tank.position.set(spec.x0 + 300 + i * 40, 8, 700);
    root.add(tank);
  }
  // 나무 (공항 둘레)
  const treeGeo = new THREE.ConeGeometry(4, 13, 7);
  treeGeo.translate(0, 6.5, 0);
  const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: '#3f5e34', roughness: 1, flatShading: true }), 420);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 420; i++) {
    const side = rand() < 0.5 ? -1 : 1;
    const z = side < 0 ? -(320 + rand() * 900) : 820 + rand() * 900;
    const x = spec.x0 - 800 + rand() * (L + 1600);
    const s = 0.7 + rand() * 0.8;
    m.makeScale(s, s * (0.8 + rand() * 0.5), s).setPosition(x, 0, z);
    trees.setMatrixAt(i, m);
  }
  root.add(trees);
  return root;
}
