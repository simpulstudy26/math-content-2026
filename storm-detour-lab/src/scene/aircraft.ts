/**
 * 고전 단발 프로펠러기 (오리지널 디자인, 단위 m)
 *  · 크림색 동체 + 붉은 카울링·꼬리·날개 끝 + 금색 줄
 *  · 성형 엔진 카울링, 은색 스피너, 나무 프로펠러(회전 잔상 원판)
 *  · 개방형 조종석: 바람막이, 가죽 헬멧 조종사, 휘날리는 머플러
 * 좌표: +X 오른쪽, +Y 위, −Z 앞.
 */
import * as THREE from 'three';

const CREAM = '#efe4cc';
const RED = '#a3322b';
const GOLD = '#c9a252';

function fuselageTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = CREAM;
  g.fillRect(0, 0, 1024, 256);
  // 패널 이음선 (세로 = 동체 길이 방향 v, 가로 = 둘레 u)
  g.strokeStyle = 'rgba(90,70,40,0.18)';
  g.lineWidth = 1.2;
  for (const v of [40, 78, 120, 160, 196]) {
    g.beginPath();
    g.moveTo(0, v);
    g.lineTo(1024, v);
    g.stroke();
  }
  // 옆면 붉은 줄 + 금색 테 (u≈0.25 오른쪽, 0.75 왼쪽)
  for (const u of [0.25, 0.75]) {
    const x = u * 1024;
    g.fillStyle = RED;
    g.fillRect(x - 34, 0, 68, 256);
    g.fillStyle = GOLD;
    g.fillRect(x - 40, 0, 4, 256);
    g.fillRect(x + 36, 0, 4, 256);
  }
  // 약간의 얼룩 (손때 묻은 질감)
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(120,100,70,${Math.random() * 0.035})`;
    g.fillRect(Math.random() * 1024, Math.random() * 256, 2 + Math.random() * 6, 1 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function propBlurTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S - 0.5;
      const dy = (y + 0.5) / S - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const ang = Math.atan2(dy, dx);
      const blade = Math.pow(Math.abs(Math.cos(ang)), 30) * 0.5; // 두 날 자국
      const ring = r > 0.18 && r < 0.98 ? 0.1 + 0.05 * Math.sin(r * 40) : 0;
      const a = r < 1 ? Math.min(1, ring + blade * (r > 0.18 ? 1 : 0)) * (1 - Math.pow(r, 6)) : 0;
      const i = (y * S + x) * 4;
      img.data[i] = 70;
      img.data[i + 1] = 52;
      img.data[i + 2] = 38;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 평면형(x, z) 윤곽으로 두께 있는 날개판을 만든다 */
function panel(points: [number, number][], thickness: number, bevel: number) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 24,
  });
  // 모양 평면(x, y) → (x, z), 두께는 y 방향
  geo.rotateX(Math.PI / 2);
  geo.translate(0, thickness / 2, 0);
  return geo;
}

/** 타원형에 가까운 날개 윤곽의 한 구간 (u0~u1: 뿌리 0 → 끝 1) */
function wingOutline(root: number, span: number, sign: 1 | -1, u0 = 0, u1 = 1): [number, number][] {
  const pts: [number, number][] = [];
  const N = 24;
  const at = (u: number, lead: boolean): [number, number] => {
    const x = root + (span - root) * u;
    const ell = Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.6)));
    return [sign * x, lead ? -0.3 - 0.95 * ell - 0.1 * u : -0.3 + 0.85 * ell - 0.1 * u];
  };
  for (let i = 0; i <= N; i++) pts.push(at(u0 + ((u1 - u0) * i) / N, true));
  for (let i = N; i >= 0; i--) pts.push(at(u0 + ((u1 - u0) * i) / N, false));
  return pts;
}

export interface Aircraft {
  group: THREE.Group;
  /** 조종사 머플러 등 매 프레임 움직임 */
  update: (t: number, dt: number) => void;
  materials: THREE.MeshStandardMaterial[];
}

export function buildAircraft(): Aircraft {
  const group = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const M = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(p);
    mats.push(m);
    return m;
  };
  const body = M({ map: fuselageTexture(), roughness: 0.42, metalness: 0.05 });
  const red = M({ color: RED, roughness: 0.32, metalness: 0.15 });
  const cream = M({ color: CREAM, roughness: 0.45, metalness: 0.03 });
  const chrome = M({ color: '#d9d6cf', roughness: 0.15, metalness: 1 });
  const dark = M({ color: '#1c1a18', roughness: 0.7, metalness: 0.2 });
  const leather = M({ color: '#5b3a22', roughness: 0.62, metalness: 0 });
  const jacket = M({ color: '#4a3424', roughness: 0.8, metalness: 0 });
  const wool = M({ color: '#ede3cf', roughness: 0.95, metalness: 0 });
  const wood = M({ color: '#7a4e2a', roughness: 0.35, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false });
  const glass = M({ color: '#cfe3ea', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ── 동체 (회전체) ── y축 = 길이 방향으로 만든 뒤 −Z 앞을 향하게 회전
  const prof = (pts: [number, number][]) => pts.map(([r, y]) => new THREE.Vector2(r, y));
  const fus = new THREE.LatheGeometry(
    prof([
      [0.0, -4.75],
      [0.09, -4.7],
      [0.2, -4.3],
      [0.34, -3.3],
      [0.47, -2.1],
      [0.57, -0.9],
      [0.63, 0.3],
      [0.665, 1.4],
      [0.675, 2.05],
    ]),
    48,
  );
  fus.rotateX(-Math.PI / 2);
  fus.scale(1, 1.06, 1);
  add(fus, body);
  // 카울링 (붉은 금속)
  const cowl = new THREE.LatheGeometry(
    prof([
      [0.675, 2.05],
      [0.69, 2.5],
      [0.69, 3.0],
      [0.66, 3.3],
      [0.56, 3.42],
      [0.42, 3.42],
      [0.4, 3.3],
    ]),
    48,
  );
  cowl.rotateX(-Math.PI / 2);
  cowl.scale(1, 1.06, 1);
  add(cowl, red);
  // 이음매 크롬 띠
  const ring = new THREE.TorusGeometry(0.68, 0.018, 8, 48);
  ring.scale(1, 1.06, 1);
  add(ring, chrome).position.z = -2.05;
  // 엔진 앞면 + 실린더
  add(new THREE.CircleGeometry(0.41, 32), dark).position.set(0, 0, -3.36);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const cyl = add(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 10), chrome);
    cyl.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3 * 1.06, -3.38);
    cyl.rotation.z = a + Math.PI / 2;
  }
  // 배기관
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const ex = add(new THREE.CylinderGeometry(0.035, 0.04, 0.22, 8), dark);
      ex.position.set(s * 0.66, -0.1 - i * 0.12, -2.2);
      ex.rotation.x = Math.PI / 2.3;
    }
  }

  // ── 프로펠러 ──
  const prop = new THREE.Group();
  prop.position.z = -3.5;
  group.add(prop);
  const spinner = new THREE.LatheGeometry(
    prof([
      [0.0, 0.45],
      [0.08, 0.38],
      [0.16, 0.22],
      [0.2, 0.05],
      [0.2, 0.0],
    ]),
    32,
  );
  spinner.rotateX(-Math.PI / 2);
  add(spinner, chrome, prop);
  const blades = new THREE.Group();
  prop.add(blades);
  for (const s of [-1, 1]) {
    const bl = new THREE.BoxGeometry(0.15, 1.12, 0.035);
    bl.translate(0, 0.62, 0);
    const pos = bl.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setX(i, pos.getX(i) * (1.15 - 0.55 * (y / 1.2) ** 2)); // 끝으로 갈수록 가늘게
    }
    bl.computeVertexNormals();
    const m = add(bl, wood, blades);
    m.rotation.z = s > 0 ? 0 : Math.PI;
    m.rotation.y = 0.35 * s;
  }
  const blurMat = new THREE.MeshBasicMaterial({ map: propBlurTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.85 });
  const blur = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), blurMat);
  blur.position.z = 0.02;
  prop.add(blur);

  // ── 날개 (낮은 날개, 상반각) ──
  for (const s of [1, -1] as const) {
    const w = new THREE.Group();
    w.position.set(0, -0.36, 0);
    w.rotation.z = s * 0.075;
    group.add(w);
    // 크림색 날개 + 금색 띠 + 붉은 날개 끝 (각각 따로 만들어 색이 번지지 않게)
    const uTip = 0.84;
    add(panel(wingOutline(0.45, 5.6, s, 0, uTip - 0.012), 0.12, 0.05), cream, w);
    add(panel(wingOutline(0.45, 5.6, s, uTip - 0.012, uTip), 0.12, 0.05), M({ color: GOLD, roughness: 0.3, metalness: 0.5 }), w);
    add(panel(wingOutline(0.45, 5.6, s, uTip, 1), 0.12, 0.05), red, w);
    // 항법등
    const navMat = new THREE.MeshBasicMaterial({ color: s > 0 ? '#3cff7a' : '#ff3b30' });
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), navMat);
    nav.position.set(s * 5.62, 0.04, -0.35);
    w.add(nav);
    // 바퀴 덮개(스패츠)
    const spat = new THREE.SphereGeometry(0.28, 20, 14);
    spat.scale(0.55, 0.8, 1.6);
    const sp = add(spat, red, w);
    sp.position.set(s * 1.55, -0.55, -0.35);
    const strut = add(new THREE.BoxGeometry(0.08, 0.5, 0.25), cream, w);
    strut.position.set(s * 1.55, -0.28, -0.35);
  }

  // ── 꼬리 ──
  for (const s of [1, -1] as const) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      pts.push([s * (0.15 + 1.85 * u), 3.55 + 0.25 * u - 0.05 * Math.sqrt(1 - u * u)]);
    }
    for (let i = 16; i >= 0; i--) {
      const u = i / 16;
      pts.push([s * (0.15 + 1.85 * u), 4.45 - 0.25 * Math.pow(u, 3) + 0.0 * u]);
    }
    const g = panel(pts, 0.05, 0.025);
    const m = add(g, cream);
    m.position.y = 0.12;
  }
  // 수직 꼬리날개 (붉은색)
  const finShape = new THREE.Shape();
  finShape.moveTo(3.35, 0.35);
  finShape.bezierCurveTo(3.9, 0.9, 4.15, 1.62, 4.5, 1.66);
  finShape.bezierCurveTo(4.75, 1.66, 4.85, 1.4, 4.82, 1.0);
  finShape.lineTo(4.72, 0.25);
  finShape.lineTo(3.35, 0.35);
  const fin = new THREE.ExtrudeGeometry(finShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 20 });
  // 모양 (x=z방향, y=높이), 두께 = x
  fin.rotateY(-Math.PI / 2);
  fin.translate(0.03, 0, 0);
  add(fin, red);

  // ── 조종석 ──
  const coaming = new THREE.TorusGeometry(0.41, 0.028, 10, 48);
  coaming.rotateX(Math.PI / 2);
  coaming.scale(1, 1, 1.45);
  add(coaming, leather).position.set(0, 0.66, 0.35);
  const hole = new THREE.CircleGeometry(0.39, 32);
  hole.rotateX(-Math.PI / 2);
  hole.scale(1, 1, 1.45);
  add(hole, dark).position.set(0, 0.64, 0.35);
  // 바람막이
  const ws = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 24, 1, true, -0.9, 1.8);
  ws.rotateY(Math.PI);
  const wsm = add(ws, glass);
  wsm.position.set(0, 0.84, 0.25);
  wsm.rotation.x = 0.35; // 위쪽이 조종사 쪽으로 기울어짐
  wsm.castShadow = false;

  // ── 조종사 ──
  const pilot = new THREE.Group();
  pilot.position.set(0, 0.62, 0.42);
  group.add(pilot);
  const torso = new THREE.CapsuleGeometry(0.2, 0.22, 6, 16);
  torso.rotateZ(Math.PI / 2);
  torso.scale(1.15, 1, 0.75);
  add(torso, jacket, pilot).position.y = 0.16;
  const collar = new THREE.TorusGeometry(0.12, 0.05, 8, 20);
  collar.rotateX(Math.PI / 2);
  add(collar, wool, pilot).position.y = 0.32;
  const head = new THREE.SphereGeometry(0.125, 24, 18);
  head.scale(0.95, 1.05, 1.05);
  const headM = add(head, leather, pilot);
  headM.position.y = 0.47;
  const strap = new THREE.TorusGeometry(0.128, 0.014, 6, 30);
  strap.rotateX(Math.PI / 2 - 0.25);
  add(strap, dark, pilot).position.set(0, 0.49, 0);
  for (const s of [-1, 1]) {
    const lens = add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), chrome, pilot);
    lens.rotation.x = Math.PI / 2 - 0.4;
    lens.position.set(s * 0.05, 0.56, -0.1);
  }
  // 머플러: 리본 메시를 매 프레임 휘날림
  const SEG = 16;
  const scarfGeo = new THREE.PlaneGeometry(0.1, 0.95, 1, SEG);
  scarfGeo.translate(0, -0.475, 0);
  scarfGeo.rotateX(-Math.PI / 2); // 길이 방향 = +Z(뒤)
  const scarfBase = (scarfGeo.attributes.position.array as Float32Array).slice();
  const scarf = add(scarfGeo, M({ color: '#f4efe6', roughness: 0.9, side: THREE.DoubleSide }), pilot);
  scarf.position.set(0.1, 0.33, 0.08);

  const update = (t: number, dt: number) => {
    blades.rotation.z -= dt * 38;
    blur.rotation.z -= dt * 5;
    const pos = scarfGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const bx = scarfBase[i * 3];
      const by = scarfBase[i * 3 + 1];
      const bz = scarfBase[i * 3 + 2];
      const k = bz / 0.95; // 0 (목) → 1 (끝)
      pos.setXYZ(
        i,
        bx + Math.sin(t * 9 + bz * 7) * 0.05 * k + 0.08 * k,
        by + Math.sin(t * 11 + bz * 9) * 0.06 * k + 0.05 * k,
        bz,
      );
    }
    pos.needsUpdate = true;
    scarfGeo.computeVertexNormals();
  };

  return { group, update, materials: mats };
}
