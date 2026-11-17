/** 카메라를 감싸는 파스텔 하늘 돔 — 태양 높이에 따라 낮 → 노을 → 땅거미 */
import * as THREE from 'three';

export interface SkyPalette {
  zenith: THREE.Color;
  horizon: THREE.Color;
  haze: THREE.Color;
  sun: THREE.Color;
  skyLight: THREE.Color;
  ground: THREE.Color;
}

const C = (h: string) => new THREE.Color(h);
/** 태양 고도(도) 별 색 — 사이 값은 보간 */
const KEYS: { el: number; p: SkyPalette }[] = [
  { el: -6, p: { zenith: C('#2b2f5c'), horizon: C('#c98aa0'), haze: C('#8d7a9c'), sun: C('#ffb38a'), skyLight: C('#7d84b8'), ground: C('#4e4a6a') } },
  { el: 2, p: { zenith: C('#5b6fa8'), horizon: C('#ffb39a'), haze: C('#e6a9a0'), sun: C('#ffbf8f'), skyLight: C('#b4a9cf'), ground: C('#8f8399') } },
  { el: 10, p: { zenith: C('#7ea4d6'), horizon: C('#ffd2b0'), haze: C('#f1ccbd'), sun: C('#ffe0b8'), skyLight: C('#c8cde8'), ground: C('#b9b4b0') } },
  { el: 25, p: { zenith: C('#8fbbe6'), horizon: C('#f7e3d2'), haze: C('#eadfd9'), sun: C('#fff3df'), skyLight: C('#c9def2'), ground: C('#c4c9c2') } },
  { el: 45, p: { zenith: C('#86b8e8'), horizon: C('#e5eef3'), haze: C('#dfe9ee'), sun: C('#fffaf0'), skyLight: C('#cfe4f5'), ground: C('#c9d1c9') } },
];

export function paletteAt(elDeg: number): SkyPalette {
  const k = KEYS;
  if (elDeg <= k[0].el) return k[0].p;
  if (elDeg >= k[k.length - 1].el) return k[k.length - 1].p;
  let i = 0;
  while (elDeg > k[i + 1].el) i++;
  const u = (elDeg - k[i].el) / (k[i + 1].el - k[i].el);
  const mix = (a: THREE.Color, b: THREE.Color) => a.clone().lerp(b, u);
  const a = k[i].p;
  const b = k[i + 1].p;
  return {
    zenith: mix(a.zenith, b.zenith),
    horizon: mix(a.horizon, b.horizon),
    haze: mix(a.haze, b.haze),
    sun: mix(a.sun, b.sun),
    skyLight: mix(a.skyLight, b.skyLight),
    ground: mix(a.ground, b.ground),
  };
}

export function makeSky() {
  const uniforms = {
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    upDir: { value: new THREE.Vector3(0, 1, 0) },
    zenith: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    sunColor: { value: new THREE.Color() },
    horizonDip: { value: 0.07 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(mat3(modelMatrix) * position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir; uniform vec3 upDir; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunColor; uniform float horizonDip;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = dot(d, upDir) + horizonDip;
        float t = pow(clamp(h, 0.0, 1.0), 0.42);
        vec3 col = mix(horizon, zenith, t);
        float sd = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(sd, 6.0) * 0.28 + pow(sd, 64.0) * 0.5);
        col = mix(col, sunColor, smoothstep(0.9993, 0.9997, sd));
        // 지평선 아래(지구 뒤로 가려지지만 혹시 보일 때)
        col = mix(col, horizon * 0.92, smoothstep(0.0, -0.05, h));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.scale.setScalar(20000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
