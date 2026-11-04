/** 표시용 숫자 서식 — 계산은 하지 않는다. */
export const km = (x: number, d = 1) =>
  `${x.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d })} km`;
export const num = (x: number, d = 2) =>
  x.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
export const deg = (x: number, d = 4) => `${num(x, d)}°`;
export const pt = (p: { x: number; y: number }, d = 1) => `(${num(p.x, d)}, ${num(p.y, d)})`;
export const latlon = (p: { lat: number; lon: number }) => {
  let lon = p.lon;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return `${Math.abs(p.lat).toFixed(3)}°${p.lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'W'}`;
};
export const sq = (x: number, d = 1) => (x < 0 ? `(${num(x, d)})²` : `${num(x, d)}²`);
