/**
 * 파스텔 지구: 국경 데이터(Natural Earth)로 정거원통 텍스처를 직접 그리고,
 * 셰이더에서 조명·잔무늬·대기 원근(안개)을 더한다. 외부 이미지 없음.
 */
import * as THREE from 'three';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import countries50 from 'world-atlas/countries-50m.json';
import type { Topology } from 'topojson-specification';
import type { FeatureCollection } from 'geojson';

/** 렌더링용 지구 반지름 (km) — 구면으로 근사 */
export const EARTH_R = 6371;

/**
 * 위도·경도·고도(km) → 렌더 좌표 (three.js SphereGeometry 의 UV 와 일치하도록 정의)
 *   x = cos φ cos λ, y = sin φ, z = −cos φ sin λ
 */
export function ecef(lat: number, lon: number, altKm = 0, out = new THREE.Vector3()): THREE.Vector3 {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  const R = EARTH_R + altKm;
  return out.set(R * Math.cos(la) * Math.cos(lo), R * Math.sin(la), -R * Math.cos(la) * Math.sin(lo));
}

const land = feature(
  countries50 as unknown as Topology,
  (countries50 as unknown as Topology).objects.countries,
) as unknown as FeatureCollection;

/** 위도별 파스텔 팔레트 */
function landGradient(ctx: CanvasRenderingContext2D, H: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const stops: [number, string][] = [
    [90, '#f4f6f7'],
    [72, '#eef1ef'],
    [64, '#b9cfa6'],
    [52, '#a8c99a'],
    [40, '#bcd59b'],
    [30, '#e2d6a8'],
    [20, '#e8d9ab'],
    [10, '#a9d293'],
    [0, '#9ccd8f'],
    [-10, '#a9d293'],
    [-22, '#e3d4a4'],
    [-32, '#cfd8a0'],
    [-45, '#b6cf9c'],
    [-58, '#c9d7c4'],
    [-66, '#f1f4f5'],
    [-90, '#f6f8f9'],
  ];
  for (const [lat, c] of stops) g.addColorStop((90 - lat) / 180, c);
  return g;
}

function oceanGradient(ctx: CanvasRenderingContext2D, H: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const stops: [number, string][] = [
    [90, '#d7e6ee'],
    [65, '#a9c9dc'],
    [40, '#86bccf'],
    [20, '#7ccdcc'],
    [0, '#74d0c9'],
    [-20, '#7ccdcc'],
    [-40, '#86bccf'],
    [-62, '#a9c9dc'],
    [-90, '#e1ecf1'],
  ];
  for (const [lat, c] of stops) g.addColorStop((90 - lat) / 180, c);
  return g;
}

/** 4096×2048 텍스처: RGB = 색, A = 육지(1)/바다(0) */
export function paintEarthTexture(W = 4096): THREE.DataTexture {
  const H = W / 2;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const proj = geoEquirectangular()
    .scale(W / (2 * Math.PI))
    .translate([W / 2, H / 2]);
  const path = geoPath(proj, ctx);

  // 바다
  ctx.fillStyle = oceanGradient(ctx, H);
  ctx.fillRect(0, 0, W, H);
  // 얕은 바다(해안선 주변) — 부드러운 띠
  ctx.save();
  ctx.strokeStyle = 'rgba(190, 238, 230, 0.55)';
  ctx.lineWidth = W / 700;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path(land);
  ctx.stroke();
  ctx.restore();

  // 육지 마스크 → 위도 그라데이션
  const mask = document.createElement('canvas');
  mask.width = W;
  mask.height = H;
  const mctx = mask.getContext('2d')!;
  const mpath = geoPath(proj, mctx);
  mctx.fillStyle = '#fff';
  mctx.beginPath();
  mpath(land);
  mctx.fill();
  mctx.globalCompositeOperation = 'source-in';
  mctx.fillStyle = landGradient(mctx, H);
  mctx.fillRect(0, 0, W, H);
  ctx.drawImage(mask, 0, 0);

  // 국경: 아주 옅게
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = W / 4096;
  ctx.beginPath();
  path(land);
  ctx.stroke();

  // 알파 채널에 육지 마스크. 캔버스는 알파를 미리 곱해 바다 색을 잃으므로
  // 픽셀을 꺼내 DataTexture로 올린다 (행 순서를 뒤집어 v=1 이 북쪽이 되게).
  const img = ctx.getImageData(0, 0, W, H).data;
  const mimg = mctx.getImageData(0, 0, W, H).data;
  const out = new Uint8Array(W * H * 4);
  const rowBytes = W * 4;
  for (let y = 0; y < H; y++) {
    const src = y * rowBytes;
    const dst = (H - 1 - y) * rowBytes;
    out.set(img.subarray(src, src + rowBytes), dst);
    for (let x = 3; x < rowBytes; x += 4) out[dst + x] = mimg[src + x] > 127 ? 255 : 0;
  }
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export const atmosphereUniforms = () => ({
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  hazeColor: { value: new THREE.Color('#f3d9c6') },
  skyTint: { value: new THREE.Color('#bcd8f0') },
  sunColor: { value: new THREE.Color('#fff1dc') },
  hazeDist: { value: 420 },
});

export function makeEarth(tex: THREE.Texture, uniforms: ReturnType<typeof atmosphereUniforms>) {
  const geo = new THREE.SphereGeometry(EARTH_R, 512, 256);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, ...uniforms },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vObj;
      varying vec3 vWorldN;
      varying float vDist;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = uv;
        vObj = position;
        vWorldN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = length(mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 sunDir;
      uniform vec3 hazeColor;
      uniform vec3 skyTint;
      uniform vec3 sunColor;
      uniform float hazeDist;
      varying vec2 vUv;
      varying vec3 vObj;
      varying vec3 vWorldN;
      varying float vDist;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x) {
        vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec4 tx = texture2D(map, vUv);
        vec3 col = tx.rgb;
        float isLand = tx.a;
        // 들판·숲 같은 잔무늬 (거리가 가까울수록 보임)
        float n1 = noise(vObj * 0.045);
        float n2 = noise(vObj * 0.23);
        float detail = mix(n1, n2, 0.45) - 0.5;
        float near = 1.0 - smoothstep(60.0, 700.0, vDist);
        col *= 1.0 + detail * mix(0.06, 0.22, near) * isLand;
        col += (1.0 - isLand) * (n2 - 0.5) * 0.035 * near;
        // 조명: 부드러운 램버트 + 하늘빛
        float ndl = dot(normalize(vWorldN), normalize(sunDir));
        float light = smoothstep(-0.25, 0.6, ndl);
        vec3 lit = col * (0.42 * skyTint + 0.78 * light * sunColor);
        // 대기 원근: 멀수록 지평선 빛으로
        float haze = 1.0 - exp(-vDist / hazeDist);
        haze = pow(haze, 1.15);
        gl_FragColor = vec4(mix(lit, hazeColor, clamp(haze, 0.0, 0.96)), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}
