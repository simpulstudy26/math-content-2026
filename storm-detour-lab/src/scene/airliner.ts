/**
 * 쌍발 협동체 여객기 (오리지널 모델, 실존 항공사·기종 아님). 단위 m.
 * 좌표: +X 오른쪽, +Y 위, −Z 앞. 원점 = 날개 중심 높이의 동체 축.
 * 도장: 흰 동체, 남색 배·꼬리, 금색 띠, 항공사 표기 없음.
 */
import * as THREE from 'three';

const NAVY = '#1b2b4a';
const GOLD = '#c9a252';

const Z_NOSE = -19.4;
const Z_TAIL = 19.7;
/** 동체 길이 방향 z(m) → 텍스처 세로 위치 (0 = 기수, 1 = 꼬리) */
const texY = (z: number) => (z - Z_NOSE) / (Z_TAIL - Z_NOSE);

/** 동체 반지름 */
export const FUS_R = 1.98;
/** 지면에서 동체 축까지 높이 (바퀴 내렸을 때) */
export const GEAR_HEIGHT = 3.3;

function fuselageTexture() {
  // 가로 = 둘레 (0 위, 0.25 오른쪽, 0.5 아래, 0.75 왼쪽), 세로 = 캔버스 위(기수) → 아래(꼬리)
  const W = 2048;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f6f6f3';
  g.fillRect(0, 0, W, H);
  // 남색 배
  g.fillStyle = NAVY;
  g.fillRect(W * 0.36, 0, W * 0.28, H);
  // 금색 띠 (배 경계)
  g.fillStyle = GOLD;
  g.fillRect(W * 0.345, 0, W * 0.012, H);
  g.fillRect(W * 0.643, 0, W * 0.012, H);
  // 창문 줄 (양쪽): 캔버스 y = 꼬리(아래) → 기수(위)
  const rowY0 = H * texY(-14.2);
  const rowY1 = H * texY(8.5);
  const doors = [H * texY(-13.3), H * texY(7.6)];
  g.fillStyle = '#1d2733';
  for (const u of [0.205, 0.795]) {
    const x = u * W;
    for (let y = rowY0; y < rowY1; y += 13.5) {
      if (doors.some((yd) => Math.abs(y - yd) < 16)) continue; // 문 자리
      g.beginPath();
      g.roundRect(x - 5, y, 10, 8, 3.5);
      g.fill();
    }
    // 문
    for (const yd of doors) {
      g.strokeStyle = 'rgba(40,50,70,0.55)';
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(x - 9, yd - 14, 18, 30, 4);
      g.stroke();
    }
  }
  // 조종석 창 (기수 위쪽 둘레)
  g.fillStyle = '#1a222c';
  const cy = H * texY(-17.1);
  for (const [u0, u1] of [
    [0.03, 0.15],
    [0.85, 0.97],
  ]) {
    g.beginPath();
    g.moveTo(u0 * W, cy - 10);
    g.lineTo(u1 * W, cy - 4);
    g.lineTo(u1 * W, cy + 9);
    g.lineTo(u0 * W, cy + 12);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function panel(points: [number, number][], thickness: number, bevel: number) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 12 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, thickness / 2, 0);
  return geo;
}

export interface Airliner {
  group: THREE.Group;
  /** gear: 0 = 접힘, 1 = 내림 */
  update: (t: number, dt: number, gear: number) => void;
}

export function buildAirliner(): Airliner {
  const group = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const body = new THREE.MeshStandardMaterial({ map: fuselageTexture(), roughness: 0.32, metalness: 0.08 });
  const white = new THREE.MeshStandardMaterial({ color: '#f2f2ef', roughness: 0.35, metalness: 0.08 });
  const wingMat = new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.38, metalness: 0.35 });
  const navy = new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.35, metalness: 0.1 });
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.25, metalness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: '#15181c', roughness: 0.6, metalness: 0.3 });
  const tire = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 });

  // ── 동체: 회전체 + 꼬리 들림 ──
  const prof: [number, number][] = [
    [0.0, Z_NOSE],
    [0.35, -19.2],
    [0.9, -18.8],
    [1.35, -18.1],
    [1.7, -17.0],
    [1.9, -15.6],
    [1.98, -14.0],
    [1.98, 9.5],
    [1.9, 11.5],
    [1.65, 13.8],
    [1.25, 16.0],
    [0.8, 17.8],
    [0.4, 19.0],
    [0.12, 19.6],
    [0.0, Z_TAIL],
  ];
  // LatheGeometry: y = 길이(꼬리 + → 기수 −)를 만들기 위해 부호를 바꿔 넣는다
  // 텍스처가 길이에 비례하도록 0.25 m 간격으로 다시 표본화 (LatheGeometry의 v는 점 번호 기준)
  const samples: THREE.Vector2[] = [];
  for (let z = Z_NOSE; z <= Z_TAIL + 1e-6; z += 0.25) {
    let k = 0;
    while (k < prof.length - 2 && prof[k + 1][1] < z) k++;
    const [r0, z0] = prof[k];
    const [r1, z1] = prof[k + 1];
    const u = Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
    samples.push(new THREE.Vector2(r0 + (r1 - r0) * u, -z));
  }
  samples[0].x = 0;
  samples[samples.length - 1].x = 0;
  const fus = new THREE.LatheGeometry(samples.reverse(), 64);
  fus.rotateX(-Math.PI / 2); // y(+기수) → z(−)
  {
    const p = fus.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      let y = p.getY(i);
      if (z > 9.5) y += Math.pow((z - 9.5) / 10, 1.6) * 1.55; // 꼬리 들림
      if (z < -15) y -= Math.pow((-15 - z) / 4.5, 2) * 0.35; // 기수 살짝 내림
      p.setY(i, y);
    }
    fus.computeVertexNormals();
  }
  add(fus, body);

  // ── 날개 (후퇴익, 상반각) ──
  const sweep = Math.tan((27 * Math.PI) / 180);
  for (const s of [1, -1] as const) {
    const w = new THREE.Group();
    w.position.set(0, -1.15, 0);
    w.rotation.z = s * 0.09;
    group.add(w);
    const root = 1.2;
    const tip = 17.2;
    const outline: [number, number][] = [
      [s * root, -3.4],
      [s * tip, -3.4 + (tip - root) * sweep],
      [s * tip, -3.4 + (tip - root) * sweep + 1.6],
      [s * 6.2, 3.1],
      [s * root, 3.4],
    ];
    add(panel(outline, 0.32, 0.12), wingMat, w);
    // 윙렛
    const wl = new THREE.Shape();
    wl.moveTo(0, 0);
    wl.lineTo(1.7, 0);
    wl.lineTo(2.6, 2.4);
    wl.lineTo(2.0, 2.4);
    wl.closePath();
    const wlg = new THREE.ExtrudeGeometry(wl, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
    wlg.rotateY(-Math.PI / 2);
    const wlm = add(wlg, navy, w);
    wlm.position.set(s * tip + 0.06, 0.1, -3.4 + (tip - root) * sweep - 0.1);
    // 항법등
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color: s > 0 ? '#40ff80' : '#ff3b30' }));
    nav.position.set(s * (tip + 0.05), 0.05, -3.4 + (tip - root) * sweep + 0.8);
    w.add(nav);
    // 엔진 (날개 아래, 앞쪽)
    const eng = new THREE.Group();
    eng.position.set(s * 5.9, -1.05, -5.6);
    w.add(eng);
    const nac = new THREE.LatheGeometry(
      [
        [0.92, -2.6],
        [1.08, -2.3],
        [1.12, -1.2],
        [1.05, 0.6],
        [0.82, 1.7],
        [0.55, 2.1],
      ].map(([r, y]) => new THREE.Vector2(r, -y)).reverse(),
      40,
    );
    nac.rotateX(-Math.PI / 2);
    add(nac, white, eng);
    const lip = new THREE.TorusGeometry(1.0, 0.09, 10, 40);
    add(lip, metal, eng).position.z = -2.55;
    add(new THREE.CircleGeometry(0.92, 32), dark, eng).position.z = -2.35;
    const cone = new THREE.ConeGeometry(0.42, 1.1, 24);
    cone.rotateX(Math.PI / 2);
    add(cone, metal, eng).position.z = 2.5;
    const band = new THREE.CylinderGeometry(1.125, 1.125, 0.35, 40, 1, true);
    band.rotateX(Math.PI / 2);
    add(band, navy, eng).position.z = -0.2;
    // 파일런
    const py = add(new THREE.BoxGeometry(0.3, 0.9, 3.6), white, eng);
    py.position.set(0, 1.15, 0.6);
  }

  // ── 꼬리 ──
  for (const s of [1, -1] as const) {
    const sw = Math.tan((32 * Math.PI) / 180);
    const outline: [number, number][] = [
      [s * 0.6, 14.6],
      [s * 6.4, 14.6 + 5.8 * sw],
      [s * 6.4, 14.6 + 5.8 * sw + 1.2],
      [s * 0.6, 18.4],
    ];
    const hs = add(panel(outline, 0.18, 0.06), wingMat);
    hs.position.y = 1.1;
    hs.rotation.z = s * 0.1;
  }
  const fin = new THREE.Shape();
  fin.moveTo(11.8, 1.5);
  fin.lineTo(16.9, 8.6);
  fin.lineTo(19.4, 8.6);
  fin.lineTo(19.9, 2.2);
  fin.lineTo(19.6, 1.5);
  fin.closePath();
  const finG = new THREE.ExtrudeGeometry(fin, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3 });
  finG.rotateY(-Math.PI / 2);
  finG.translate(0.12, 0, 0);
  add(finG, navy);
  // 꼬리 장식: 앞전과 나란한 금색 사선 띠 두 줄 — 특정 항공사 로고가 아닌 추상 무늬
  const goldDS = gold.clone();
  goldDS.side = THREE.DoubleSide;
  for (const [z0, y0, w] of [[14.6, 2.6, 0.55], [15.55, 2.6, 0.26]] as const) {
    const band = new THREE.Shape();
    band.moveTo(z0, y0);
    band.lineTo(z0 + w, y0);
    band.lineTo(z0 + w + 2.6, y0 + 3.6);
    band.lineTo(z0 + 2.6, y0 + 3.6);
    band.closePath();
    for (const sd of [1, -1]) {
      const g = new THREE.ShapeGeometry(band);
      g.rotateY(-Math.PI / 2);
      g.translate(sd * 0.215, 0, 0);
      group.add(new THREE.Mesh(g, goldDS));
    }
  }

  // ── 바퀴 ──
  const gear = new THREE.Group();
  group.add(gear);
  const wheel = (x: number, z: number, strut: number, parent: THREE.Object3D) => {
    const g = new THREE.Group();
    g.position.set(x, -FUS_R + 0.2, z);
    parent.add(g);
    const st = add(new THREE.CylinderGeometry(0.12, 0.14, strut, 10), metal, g);
    st.position.y = -strut / 2;
    for (const dx of [-0.32, 0.32]) {
      const w = new THREE.CylinderGeometry(0.55, 0.55, 0.36, 20);
      w.rotateZ(Math.PI / 2);
      add(w, tire, g).position.set(dx, -strut, 0);
    }
    return g;
  };
  wheel(2.9, 0.9, GEAR_HEIGHT - FUS_R + 0.2 - 0.55, gear);
  wheel(-2.9, 0.9, GEAR_HEIGHT - FUS_R + 0.2 - 0.55, gear);
  wheel(0, -15.0, GEAR_HEIGHT - FUS_R + 0.2 - 0.55 - 0.25, gear);

  // 깜빡이는 등
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2a2a' }));
  beacon.position.set(0, FUS_R + 0.1, -2);
  group.add(beacon);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  strobe.position.set(0, 1.7, 19.75);
  group.add(strobe);

  const update = (t: number, _dt: number, g: number) => {
    gear.visible = g > 0.02;
    gear.scale.y = Math.max(0.02, g);
    gear.position.y = (1 - g) * 0.6;
    beacon.visible = t % 1.4 < 0.12;
    strobe.visible = (t + 0.5) % 1.8 < 0.06;
  };
  return { group, update };
}
