/**
 * 부드러운 구름: 카메라를 향하는 반투명 퍼프(빌보드) 수천 개.
 *  · 퍼프 모양은 잡음으로 직접 만든 2×2 아틀라스 (외부 이미지 없음)
 *  · 각 퍼프를 공처럼 가정한 법선으로 햇빛·하늘빛·역광 은빛 테두리를 계산
 *  · 대기 원근을 지구와 같은 식으로 적용
 *  · 반투명이므로 몇 프레임마다 먼 것부터 그리도록 정렬
 */
import * as THREE from 'three';
import type { LightingUniforms } from './globe';

let atlas: THREE.DataTexture | null = null;

function makeAtlas(): THREE.DataTexture {
  const S = 128;
  const W = S * 2;
  const data = new Uint8Array(W * W * 4);
  // 값 잡음
  const perm = new Uint8Array(512);
  let seed = 1234567;
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 16807) % 2147483647;
    const j = seed % (i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (x: number, y: number) => perm[(perm[x & 255] + y) & 511] / 255;
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
    const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
  const fbm = (x: number, y: number) => {
    let s = 0;
    let a = 0.5;
    let f = 1;
    for (let o = 0; o < 5; o++) {
      s += a * noise(x * f, y * f);
      f *= 2.03;
      a *= 0.5;
    }
    return s;
  };
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * S;
    const oy = Math.floor(cell / 2) * S;
    const off = cell * 37.1;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const px = (x + 0.5) / S - 0.5;
        const py = (y + 0.5) / S - 0.5;
        // 아래가 납작한 뭉게구름 모양
        const r = Math.hypot(px, py < 0 ? py * 1.35 : py * 0.95) * 2;
        const n = fbm(px * 5 + off, py * 5 + off * 0.7);
        let dens = 1 - r * 1.05 + (n - 0.5) * 0.9;
        dens = Math.min(1, Math.max(0, dens * 1.8));
        dens = dens * dens * (3 - 2 * dens);
        const i = ((oy + y) * W + ox + x) * 4;
        const v = Math.round(dens * 255);
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
  }
  const t = new THREE.DataTexture(data, W, W, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export interface Puff {
  /** 로컬 좌표 (km) */
  x: number;
  y: number;
  z: number;
  /** 지름 (km) */
  size: number;
  /** 세로 납작함 (1 = 둥글게) */
  squash: number;
  /** 밝기 배수 (아래쪽·안쪽 퍼프는 어둡게) */
  shade: number;
}

export class CloudLayer {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private offsets: Float32Array;
  private data: Float32Array;
  private order: number[];
  private depth: Float32Array;
  readonly uniforms: { uSpin: { value: number }; uOpacity: { value: number }; uFlash: { value: number }; uFlashSeed: { value: number } };
  private frame = 0;

  constructor(
    private puffs: Puff[],
    lighting: LightingUniforms,
    /** 퍼프 로컬 좌표 → 세계 좌표 (회전 포함) */
    private readonly spinsInLocalXY = false,
  ) {
    atlas ??= makeAtlas();
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    this.offsets = new Float32Array(puffs.length * 3);
    this.data = new Float32Array(puffs.length * 4);
    geo.setAttribute('iOffset', new THREE.InstancedBufferAttribute(this.offsets, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('iData', new THREE.InstancedBufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = puffs.length;
    this.geo = geo;
    this.order = puffs.map((_, i) => i);
    this.depth = new Float32Array(puffs.length);
    this.uniforms = { uSpin: { value: 0 }, uOpacity: { value: 1 }, uFlash: { value: 0 }, uFlashSeed: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { atlas: { value: atlas }, ...lighting, ...this.uniforms },
      vertexShader: /* glsl */ `
        attribute vec3 iOffset;
        attribute vec4 iData; // size, variant, shade, squash
        uniform float uSpin;
        varying vec2 vUv;
        varying vec2 vQuad;
        varying float vShade;
        varying float vDist;
        varying float vSize;
        varying vec3 vCenter;
        varying float vRand;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vec3 off = iOffset;
          float c = cos(uSpin), s = sin(uSpin);
          off.xy = vec2(c * off.x - s * off.y, s * off.x + c * off.y);
          vec4 cw = modelMatrix * vec4(off, 1.0);
          vec4 cv = viewMatrix * cw;
          vec2 q = position.xy;
          cv.xy += q * iData.x * vec2(1.0, iData.w);
          gl_Position = projectionMatrix * cv;
          float v = iData.y;
          vUv = (uv + vec2(mod(v, 2.0), floor(v / 2.0))) * 0.5;
          vQuad = q * 2.0;
          vShade = iData.z;
          vDist = length(cw.xyz);
          vSize = iData.x;
          vCenter = cw.xyz;
          vRand = fract(sin(dot(iOffset.xy, vec2(12.9898, 78.233))) * 43758.5453);
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D atlas;
        uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 ambient; uniform vec3 haze; uniform float hazeDist; uniform float uOpacity; uniform vec3 upDir; uniform float uFlash; uniform float uFlashSeed;
        varying vec2 vUv; varying vec2 vQuad; varying float vShade; varying float vDist; varying float vSize; varying vec3 vCenter; varying float vRand;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          // 아틀라스 타일 경계(밉맵 번짐)가 사각형으로 드러나지 않도록 원형으로 한 번 더 감쇠
          float dens = texture2D(atlas, vUv).r * (1.0 - smoothstep(0.62, 0.98, length(vQuad)));
          if (dens < 0.02) discard;
          // 공 모양 가짜 법선 (뷰 공간) → 세계 공간
          vec2 p = vQuad;
          float z = sqrt(max(0.0, 1.0 - dot(p, p)));
          vec3 nV = normalize(vec3(p, z * 0.9 + 0.1));
          vec3 nW = normalize(transpose(mat3(viewMatrix)) * nV);
          float diff = clamp(dot(nW, sunDir) * 0.55 + 0.45, 0.0, 1.0);
          vec3 viewDir = normalize(vCenter);
          float fwd = pow(max(dot(viewDir, sunDir), 0.0), 6.0);
          float edge = 1.0 - smoothstep(0.15, 0.9, dens);
          vec3 col = ambient * (0.55 + 0.3 * dot(nW, upDir)) * vShade
                   + sunColor * diff * 0.62 * vShade
                   + sunColor * fwd * edge * 0.9;
          // 번개: 한 번에 일부 퍼프만 안쪽에서 번쩍
          float bolt = step(0.86, fract(vRand + uFlashSeed));
          col += vec3(0.78, 0.84, 1.0) * uFlash * bolt * (0.6 + 1.6 * dens);
          float T = exp(-vDist / (hazeDist * 3.0)); // 구름은 높이 떠 있어 공기가 맑다
          col = col * T + haze * (1.0 - T);
          float nearFade = smoothstep(0.35, 1.1, vDist / vSize);
          gl_FragColor = vec4(col, dens * nearFade * uOpacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.write();
  }

  private write() {
    const { puffs, order, offsets, data } = this;
    for (let k = 0; k < order.length; k++) {
      const p = puffs[order[k]];
      offsets[k * 3] = p.x;
      offsets[k * 3 + 1] = p.y;
      offsets[k * 3 + 2] = p.z;
      data[k * 4] = p.size;
      data[k * 4 + 1] = order[k] % 4;
      data[k * 4 + 2] = p.shade;
      data[k * 4 + 3] = p.squash;
    }
    this.geo.getAttribute('iOffset').needsUpdate = true;
    this.geo.getAttribute('iData').needsUpdate = true;
  }

  private tmp = new THREE.Vector3();
  /** 카메라(원점)에서 먼 것부터 그리도록 정렬 — 몇 프레임마다 */
  sort(every = 6) {
    if (this.frame++ % every !== 0) return;
    const m = this.mesh.matrixWorld;
    const c = Math.cos(this.uniforms.uSpin.value);
    const s = Math.sin(this.uniforms.uSpin.value);
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      const x = this.spinsInLocalXY ? c * p.x - s * p.y : p.x;
      const y = this.spinsInLocalXY ? s * p.x + c * p.y : p.y;
      this.tmp.set(x, y, p.z).applyMatrix4(m);
      this.depth[i] = this.tmp.lengthSq();
    }
    this.order.sort((a, b) => this.depth[b] - this.depth[a]);
    this.write();
  }
}
