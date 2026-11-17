/**
 * 지구: NASA Blue Marble(퍼블릭 도메인) 위성 영상 + Natural Earth 해안선으로 만든 육지/바다 마스크.
 * 바다는 셰이더에서 하늘 반사·햇빛 반짝임을, 전체에는 대기 원근(멀수록 연무)을 더한다.
 */
import * as THREE from 'three';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import countries50 from 'world-atlas/countries-50m.json';
import type { Topology } from 'topojson-specification';
import type { FeatureCollection } from 'geojson';
import marbleUrl from '../assets/earth-blue-marble.jpg';

/** 렌더링용 지구 반지름 (km) — 구면 근사 */
export const EARTH_R = 6371;

/** 위도·경도·고도(km) → 렌더 좌표 (three.js SphereGeometry UV와 일치) */
export function ecef(lat: number, lon: number, altKm = 0, out = new THREE.Vector3()): THREE.Vector3 {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  const R = EARTH_R + altKm;
  return out.set(R * Math.cos(la) * Math.cos(lo), R * Math.sin(la), -R * Math.cos(la) * Math.sin(lo));
}

const land = feature(countries50 as unknown as Topology, (countries50 as unknown as Topology).objects.countries) as unknown as FeatureCollection;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
}

let texPromise: Promise<THREE.DataTexture> | null = null;

/** RGB = 위성 영상, A = 육지 마스크 (캔버스 알파 사전곱 문제를 피하려고 DataTexture 사용) */
export function loadEarthTexture(): Promise<THREE.DataTexture> {
  texPromise ??= (async () => {
    const img = await loadImage(marbleUrl);
    const W = 4096;
    const H = 2048;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, W, H);
    const rgb = ctx.getImageData(0, 0, W, H).data;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
    ctx.beginPath();
    geoPath(proj, ctx)(land);
    ctx.fill();
    const mask = ctx.getImageData(0, 0, W, H).data;
    const out = new Uint8Array(W * H * 4);
    const row = W * 4;
    for (let y = 0; y < H; y++) {
      const s = y * row;
      const d = (H - 1 - y) * row;
      for (let x = 0; x < row; x += 4) {
        out[d + x] = rgb[s + x];
        out[d + x + 1] = rgb[s + x + 1];
        out[d + x + 2] = rgb[s + x + 2];
        out[d + x + 3] = mask[s + x + 3];
      }
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
  })();
  return texPromise;
}

export const lightingUniforms = () => ({
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  /** 카메라 위치의 위쪽 방향 */
  upDir: { value: new THREE.Vector3(0, 1, 0) },
  sunColor: { value: new THREE.Color(1, 1, 1) },
  ambient: { value: new THREE.Color(0.4, 0.5, 0.6) },
  haze: { value: new THREE.Color(0.7, 0.75, 0.8) },
  /** 대기 원근 거리 척도 (km) */
  hazeDist: { value: 160 },
  time: { value: 0 },
});
export type LightingUniforms = ReturnType<typeof lightingUniforms>;

const NOISE = /* glsl */ `
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

export function makeEarth(u: LightingUniforms) {
  const geo = new THREE.SphereGeometry(EARTH_R, 720, 360);
  const placeholder = new THREE.DataTexture(new Uint8Array([20, 50, 90, 0]), 1, 1);
  placeholder.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: placeholder as THREE.Texture }, ...u },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vObj;
      varying vec3 vW;
      varying vec3 vN;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = uv;
        vObj = position;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 ambient; uniform vec3 haze; uniform float hazeDist; uniform float time;
      varying vec2 vUv; varying vec3 vObj; varying vec3 vW; varying vec3 vN;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${NOISE}
      void main() {
        #include <logdepthbuf_fragment>
        vec4 tx = texture2D(map, vUv);
        float isLand = smoothstep(0.35, 0.65, tx.a);
        vec3 N = normalize(vN);
        vec3 V = normalize(-vW);
        float dist = length(vW);
        float ndl = dot(N, sunDir);
        float near = 1.0 - smoothstep(20.0, 260.0, dist);

        // 육지: 위성 영상 + 가까울수록 보이는 들판·숲 잔무늬
        vec3 albedo = tx.rgb * 1.25;
        float n1 = vnoise(vObj * 0.6);
        float n2 = vnoise(vObj * 2.7);
        albedo *= 1.0 + ((n1 - 0.5) * 0.35 + (n2 - 0.5) * 0.22) * near;
        vec3 landCol = albedo * (sunColor * max(ndl, 0.0) * 0.55 + ambient * 0.35);

        // 바다: 깊은 남색 + 프레넬 하늘 반사 + 햇빛 반짝임
        vec3 g = vec3(vnoise(vObj * 9.0 + time * 0.3), vnoise(vObj * 9.0 + 17.0 - time * 0.25), vnoise(vObj * 9.0 + 41.0)) - 0.5;
        vec3 Nw = normalize(N + g * 0.05 * (0.4 + near));
        vec3 R = reflect(-V, Nw);
        float cosV = max(dot(Nw, V), 0.0);
        float fres = (0.02 + 0.98 * pow(1.0 - cosV, 5.0)) * 0.75;
        vec3 skyRef = mix(haze, ambient * 1.25, clamp(dot(R, N) * 4.0, 0.0, 1.0));
        float sd = max(dot(R, sunDir), 0.0);
        float glint = pow(sd, 900.0) * 18.0 + pow(sd, 60.0) * 0.6 + pow(sd, 8.0) * 0.05;
        vec3 deep = vec3(0.006, 0.035, 0.075) + tx.rgb * 0.22;
        vec3 waterCol = deep * (sunColor * max(ndl, 0.0) * 0.5 + ambient * 0.6) + fres * skyRef + glint * sunColor * smoothstep(-0.02, 0.08, ndl);

        vec3 col = mix(waterCol, landCol, isLand);
        // 대기 원근: 거리에 따라 지평선 연무로
        float T = exp(-dist / hazeDist);
        col = col * T + haze * (1.0 - T);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  loadEarthTexture()
    .then((t) => {
      mat.uniforms.map.value = t;
    })
    .catch(() => {});
  return mesh;
}
