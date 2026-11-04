import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap, Marker } from 'maplibre-gl';
// MapLibre v6는 워커를 별도 모듈로 배포한다. Vite가 워커를 번들해 URL을 넘겨준다.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { feature } from 'topojson-client';
import countries50 from 'world-atlas/countries-50m.json';
import type { Topology } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry, LineString, Point } from 'geojson';
import type { Airport } from '../data/airportTypes';
import { isClosed } from '../data/airportTypes';
import type { LatLon } from '../math/geoProjection';
import type { ScenarioResult } from '../math/scenario';
import { mathToPlane } from '../math/frame45';
import { planeToGeo } from '../math/geoProjection';

export type MapProjection = 'mercator' | 'globe';

interface Props {
  origin: LatLon;
  destination: Airport | null;
  countryAirports: Airport[] | null;
  scenario: ScenarioResult | null;
  progress: number;
  showOther: boolean;
  projection: MapProjection;
  placing: boolean;
  onPlace: (p: LatLon) => void;
  onStormDrag: (p: LatLon, final: boolean) => void;
  onSelectAirport: (id: number) => void;
}

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const landGeo = feature(
  countries50 as unknown as Topology,
  (countries50 as unknown as Topology).objects.countries,
) as unknown as FeatureCollection;

function graticule(): FeatureCollection<LineString> {
  const feats: Feature<LineString>[] = [];
  for (let lon = -180; lon <= 180; lon += 30) {
    feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 33 }, (_, i) => [lon, -80 + i * 5]) } });
  }
  for (let lat = -60; lat <= 80; lat += 20) {
    feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]) } });
  }
  return { type: 'FeatureCollection', features: feats };
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const line = (pts: LatLon[]): Feature<LineString> => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lon, p.lat]) },
});
const fc = (features: Feature<Geometry>[]): FeatureCollection => ({ type: 'FeatureCollection', features });

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    land: { type: 'geojson', data: landGeo },
    grat: { type: 'geojson', data: graticule() },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0e2233' } },
    { id: 'grat', type: 'line', source: 'grat', paint: { 'line-color': '#1f3a50', 'line-width': 0.6 } },
    { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#1d3648' } },
    { id: 'border', type: 'line', source: 'land', paint: { 'line-color': '#3b5b73', 'line-width': 0.5 } },
  ],
};

const PLANE_SVG = `<svg viewBox="0 0 24 24" width="30" height="30"><path fill="#fff" stroke="#0b1a26" stroke-width="1" d="M12 1.5c.9 0 1.5 1.2 1.5 2.6v5.6l8 4.6v2.2l-8-2.4v4.4l2.4 1.8v1.7L12 21l-3.9 1v-1.7l2.4-1.8v-4.4l-8 2.4v-2.2l8-4.6V4.1c0-1.4.6-2.6 1.5-2.6z"/></svg>`;

function el(cls: string, html: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return d;
}

export function WorldFlightMap(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const markers = useRef<Record<string, Marker>>({});
  const propsRef = useRef(props);
  propsRef.current = props;
  const lastFitKey = useRef('');

  // 지도 생성
  useEffect(() => {
    const map = new maplibregl.Map({
      container: box.current!,
      style: STYLE,
      center: [props.origin.lon, props.origin.lat],
      zoom: 1.6,
      attributionControl: { compact: true, customAttribution: '국경: Natural Earth · 공항: OurAirports' },
      renderWorldCopies: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    map.on('load', () => {
      map.addSource('airports', { type: 'geojson', data: EMPTY, cluster: true, clusterRadius: 36, clusterMaxZoom: 7 });
      map.addSource('storm', { type: 'geojson', data: EMPTY });
      map.addSource('base', { type: 'geojson', data: EMPTY });
      map.addSource('other', { type: 'geojson', data: EMPTY });
      map.addSource('planned', { type: 'geojson', data: EMPTY });
      map.addSource('traveled', { type: 'geojson', data: EMPTY });
      map.addSource('pts', { type: 'geojson', data: EMPTY });

      map.addLayer({
        id: 'ap-cluster',
        type: 'circle',
        source: 'airports',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#2f6f8f',
          'circle-opacity': 0.55,
          'circle-radius': ['step', ['get', 'point_count'], 7, 50, 11, 500, 16],
          'circle-stroke-color': '#7fc4e0',
          'circle-stroke-width': 0.6,
        },
      });
      map.addLayer({
        id: 'ap-point',
        type: 'circle',
        source: 'airports',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['case', ['get', 'closed'], '#6b7785', ['get', 'major'], '#9fe3ff', '#5fb4d6'],
          'circle-radius': ['case', ['get', 'major'], 4.5, 3],
          'circle-stroke-color': '#0b1a26',
          'circle-stroke-width': 0.8,
        },
      });
      map.addLayer({ id: 'storm-fill', type: 'fill', source: 'storm', paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.18 } });
      map.addLayer({ id: 'storm-line', type: 'line', source: 'storm', paint: { 'line-color': '#7dd3fc', 'line-width': 1.6 } });
      map.addLayer({
        id: 'base',
        type: 'line',
        source: 'base',
        paint: {
          'line-color': ['case', ['get', 'blocked'], '#f0785a', '#e8eef3'],
          'line-width': 1.8,
          'line-dasharray': [3, 2.5],
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'other',
        type: 'line',
        source: 'other',
        paint: { 'line-color': '#c4b5fd', 'line-width': 1.6, 'line-dasharray': [1.5, 2], 'line-opacity': 0.8 },
      });
      map.addLayer({
        id: 'planned',
        type: 'line',
        source: 'planned',
        paint: { 'line-color': '#38bdf8', 'line-width': 2.5, 'line-opacity': 0.35 },
      });
      map.addLayer({
        id: 'traveled',
        type: 'line',
        source: 'traveled',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#38bdf8', 'line-width': 4 },
      });
      map.addLayer({
        id: 'pts',
        type: 'circle',
        source: 'pts',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 5,
          'circle-stroke-color': '#0b1a26',
          'circle-stroke-width': 1.5,
        },
      });

      map.on('click', 'ap-point', (e) => {
        if (propsRef.current.placing) return;
        const f = e.features?.[0];
        if (f) propsRef.current.onSelectAirport(Number(f.properties!.id));
      });
      map.on('click', 'ap-cluster', async (e) => {
        if (propsRef.current.placing) return;
        const f = e.features?.[0];
        if (!f) return;
        const src = map.getSource('airports') as GeoJSONSource;
        const z = await src.getClusterExpansionZoom(f.properties!.cluster_id);
        map.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom: z });
      });
      for (const id of ['ap-point', 'ap-cluster']) {
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
      }
      ready.current = true;
      sync();
    });
    map.on('click', (e) => {
      if (propsRef.current.placing) propsRef.current.onPlace({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });
    map.on('move', () => syncPlane());
    return () => {
      ready.current = false;
      map.remove();
      mapRef.current = null;
      markers.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setData(id: string, data: FeatureCollection) {
    (mapRef.current?.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  }

  function upsertMarker(key: string, make: () => Marker, at: LatLon | null): Marker | null {
    const map = mapRef.current!;
    let m = markers.current[key];
    if (!at) {
      if (m) {
        m.remove();
        delete markers.current[key];
      }
      return null;
    }
    if (!m) {
      m = make();
      m.setOpacity('1', '0'); // 지구본 뒷면에 가려지면 숨김
      m.setLngLat([at.lon, at.lat]).addTo(map);
      markers.current[key] = m;
    } else m.setLngLat([at.lon, at.lat]);
    return m;
  }

  /** 수학 좌표점 → 지도 위치 (단일 역변환 경로) */
  function geoOfMath(s: ScenarioResult, p: { x: number; y: number }): LatLon {
    const g = planeToGeo(mathToPlane(s.coords.frame, p));
    return { lat: g.lat, lon: g.lon };
  }

  function sync() {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const p = propsRef.current;
    const s = p.scenario;

    // 국가 공항 (클러스터)
    setData(
      'airports',
      fc(
        (p.countryAirports ?? []).map((a) => ({
          type: 'Feature',
          properties: { id: a.id, closed: isClosed(a), major: a.type === 'large_airport' || a.type === 'medium_airport' },
          geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
        })),
      ),
    );

    // 기본 항로
    if (s) {
      setData('base', fc([{ ...line(s.render.baseRoute), properties: { blocked: s.math.detourRequired } }]));
    } else if (p.destination) {
      setData('base', fc([{ ...line([p.origin, { lat: p.destination.lat, lon: p.destination.lon }]), properties: { blocked: false } }]));
    } else setData('base', EMPTY);

    // 태풍
    if (s) {
      setData('storm', fc([{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [s.render.stormBoundary.map((q) => [q.lon, q.lat])] } }]));
    } else setData('storm', EMPTY);

    // 경로
    const c = s?.path.chosen;
    if (s && c) {
      setData('planned', fc([line([...s.render.segmentOP, ...s.render.arcPQSamples.slice(1), ...s.render.segmentQA.slice(1)])]));
      setData('other', p.showOther && s.render.otherRoute.length ? fc([line(s.render.otherRoute)]) : EMPTY);
      const pts: Feature<Point>[] = [];
      const add = (q: { x: number; y: number }, color: string) => {
        const g = geoOfMath(s, q);
        pts.push({ type: 'Feature', properties: { color }, geometry: { type: 'Point', coordinates: [g.lon, g.lat] } });
      };
      s.check.intersections.forEach((I) => add(I, '#f0785a'));
      add(c.P, '#38bdf8');
      add(c.Q, '#38bdf8');
      if (c.R) add(c.R, '#fbbf24');
      setData('pts', fc(pts));
    } else if (s) {
      setData('planned', fc([line(s.render.baseRoute)]));
      setData('other', EMPTY);
      setData('pts', fc(s.check.intersections.map((I) => {
        const g = geoOfMath(s, I);
        return { type: 'Feature', properties: { color: '#f0785a' }, geometry: { type: 'Point', coordinates: [g.lon, g.lat] } } as Feature<Point>;
      })));
    } else {
      setData('planned', EMPTY);
      setData('other', EMPTY);
      setData('pts', EMPTY);
    }

    // 라벨 마커
    upsertMarker('O', () => new maplibregl.Marker({ element: el('mk mk-origin', '<i></i><span>O · ICN 인천</span>'), anchor: 'left' }), p.origin);
    const destLabel = p.destination ? `A · ${p.destination.iata || p.destination.ident}` : '';
    const dm = upsertMarker(
      'A',
      () => new maplibregl.Marker({ element: el('mk mk-dest', '<i></i><span></span>'), anchor: 'left' }),
      p.destination ? { lat: p.destination.lat, lon: p.destination.lon } : null,
    );
    if (dm) dm.getElement().querySelector('span')!.textContent = destLabel;

    const lbl = (key: string, text: string, q: { x: number; y: number } | null, cls = '') =>
      upsertMarker(key, () => new maplibregl.Marker({ element: el(`mk-label ${cls}`, text), anchor: 'bottom-left', offset: [4, -4] }), s && q ? geoOfMath(s, q) : null);
    lbl('P', 'P', c?.P ?? null);
    lbl('Q', 'Q', c?.Q ?? null);
    lbl('R', 'R', c?.R ?? null, 'amber');

    // 태풍 중심 (드래그)
    const sm = upsertMarker(
      'C',
      () => {
        const m = new maplibregl.Marker({ element: el('mk-storm', '✛<span>C</span>'), draggable: true });
        m.on('drag', () => {
          const ll = m.getLngLat();
          propsRef.current.onStormDrag({ lat: ll.lat, lon: ll.lng }, false);
        });
        m.on('dragend', () => {
          const ll = m.getLngLat();
          propsRef.current.onStormDrag({ lat: ll.lat, lon: ll.lng }, true);
        });
        return m;
      },
      s ? s.input.stormCenterLatLon : null,
    );
    void sm;

    syncPlane();

    // 목적지가 바뀌면 화면 맞추기
    const fitKey = p.destination ? String(p.destination.id) : '';
    if (fitKey && fitKey !== lastFitKey.current && s) {
      lastFitKey.current = fitKey;
      frameView();
    }
  }

  /** 경로 전체가 보이도록 화면을 맞춘다. 조작 카드·미니뷰가 가리는 영역을 여백으로 둔다. */
  function frameView() {
    const map = mapRef.current;
    const s = propsRef.current.scenario;
    if (!map || !s) return;
    const all = [...s.render.baseRoute, ...s.render.stormBoundary];
    const wide = (box.current?.clientWidth ?? 0) > 900;
    const padding = wide ? { top: 50, bottom: 120, left: 380, right: 340 } : { top: 40, bottom: 120, left: 30, right: 30 };
    if (propsRef.current.projection === 'globe') {
      const mid = s.render.flightFramePositions[Math.floor(s.render.flightFramePositions.length / 2)].geo;
      let lon = mid.lon;
      while (lon > 180) lon -= 360;
      while (lon < -180) lon += 360;
      const z = s.coords.destDistanceKm > 6000 ? 1.3 : s.coords.destDistanceKm > 2500 ? 2.2 : 3.2;
      map.easeTo({ center: [lon, mid.lat], zoom: z, padding, duration: 900 });
      return;
    }
    const lons = all.map((q) => q.lon);
    const lats = all.map((q) => q.lat);
    map.fitBounds(
      [
        [Math.min(...lons), Math.max(-85, Math.min(...lats))],
        [Math.max(...lons), Math.min(85, Math.max(...lats))],
      ],
      { padding, duration: 900, maxZoom: 7 },
    );
  }

  function syncPlane() {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const p = propsRef.current;
    const s = p.scenario;
    const frames = s?.render.flightFramePositions;
    if (!s || !frames || !s.canFly) {
      upsertMarker('plane', () => new maplibregl.Marker({ element: el('mk-plane', PLANE_SVG), rotationAlignment: 'viewport' }), null);
      setData('traveled', EMPTY);
      return;
    }
    const N = frames.length - 1;
    const i = Math.min(N, Math.round(p.progress * N));
    const cur = frames[i].geo;
    const m = upsertMarker('plane', () => new maplibregl.Marker({ element: el('mk-plane', PLANE_SVG), rotationAlignment: 'viewport' }), cur)!;
    const j = Math.min(N, i + 2);
    const k = j === i ? Math.max(0, i - 2) : i;
    const a = map.project([frames[k].geo.lon, frames[k].geo.lat]);
    const b = map.project([frames[j === i ? i : j].geo.lon, frames[j === i ? i : j].geo.lat]);
    if (a.dist(b) > 0.01) m.setRotation((Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI);
    setData('traveled', i > 0 ? fc([line(frames.slice(0, i + 1).map((f) => f.geo))]) : EMPTY);
  }

  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scenario, props.countryAirports, props.destination, props.showOther]);

  useEffect(() => {
    syncPlane();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.progress]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.setProjection({ type: props.projection });
      frameView();
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [props.projection]);

  useEffect(() => {
    const c = mapRef.current?.getCanvas();
    if (c) c.style.cursor = props.placing ? 'crosshair' : '';
  }, [props.placing]);

  return <div ref={box} className={`map ${props.placing ? 'placing' : ''}`} />;
}
