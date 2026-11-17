import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap, Marker } from 'maplibre-gl';
// MapLibre v6는 워커를 별도 모듈로 배포한다. Vite가 워커를 번들해 URL을 넘겨준다.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { feature } from 'topojson-client';
import countries50 from 'world-atlas/countries-50m.json';
import type { Topology } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry, LineString, Point } from 'geojson';
import { isClosed, type Airport } from '../data/airportTypes';
import { ICN, type LatLon } from '../math/geoProjection';
import type { Trip } from '../math/trip';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

/**
 * 러시아·피지처럼 날짜변경선(±180°)을 건너는 고리는 경도가 −180 ↔ 180으로 튀어
 * 지도 전체를 가로지르는 띠가 그려진다. 경도를 이어 붙여(±360) 연속으로 만든다.
 * 남극(−90°까지 내려가 닫히는 고리)은 이 지도 범위에서 쓰이지 않으므로 뺀다.
 */
function unwrapRing(r: number[][]): number[][] {
  const out = [r[0].slice()];
  for (let i = 1; i < r.length; i++) {
    let lon = r[i][0];
    const prev = out[i - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, r[i][1]]);
  }
  return out;
}
const landGeo: FeatureCollection = (() => {
  const fc = feature(countries50 as unknown as Topology, (countries50 as unknown as Topology).objects.countries) as unknown as FeatureCollection;
  const features = fc.features
    .filter((f) => f.id !== '010')
    .map((f) => {
      const g = f.geometry;
      if (g.type === 'Polygon') return { ...f, geometry: { ...g, coordinates: g.coordinates.map(unwrapRing) } };
      if (g.type === 'MultiPolygon') return { ...f, geometry: { ...g, coordinates: g.coordinates.map((p) => p.map(unwrapRing)) } };
      return f;
    });
  return { type: 'FeatureCollection', features };
})();
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const line = (pts: LatLon[]): Feature<LineString> => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lon, p.lat]) },
});
/** 인천 → 목적지 직선(경도는 짧은 쪽으로 이어 날짜변경선에서 끊기지 않게) */
const straight = (d: LatLon): LatLon[] => {
  let lon = d.lon;
  while (lon - ICN.lon > 180) lon -= 360;
  while (lon - ICN.lon < -180) lon += 360;
  return Array.from({ length: 33 }, (_, i) => ({ lat: ICN.lat + ((d.lat - ICN.lat) * i) / 32, lon: ICN.lon + ((lon - ICN.lon) * i) / 32 }));
};
const fc = (features: Feature<Geometry>[]): FeatureCollection => ({ type: 'FeatureCollection', features });

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { land: { type: 'geojson', data: landGeo } },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0b1524' } },
    { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#18273b' } },
    { id: 'border', type: 'line', source: 'land', paint: { 'line-color': '#2a3d57', 'line-width': 0.6 } },
  ],
};

function el(cls: string, html: string) {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return d;
}

interface Props {
  destination: Airport | null;
  airports: Airport[] | null;
  trip: Trip | null;
  placing: boolean;
  onPlace: (p: LatLon) => void;
  onStormDrag: (p: LatLon) => void;
  onSelectAirport: (id: number) => void;
  /** 지도 위를 덮는 패널을 피해 화면을 맞출 여백 */
  padding?: { top: number; right: number; bottom: number; left: number };
  /** 태풍 마커를 끌 수 있는지 */
  stormEditable?: boolean;
  /** false면 태풍·우회 경로를 숨기고 직선 항로만 */
  showStorm?: boolean;
}

export function BookingMap(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const markers = useRef<Record<string, Marker>>({});
  const propsRef = useRef(props);
  propsRef.current = props;
  const fitted = useRef('');

  useEffect(() => {
    const map = new maplibregl.Map({
      container: box.current!,
      style: STYLE,
      center: [ICN.lon + 10, ICN.lat],
      zoom: 1.6,
      attributionControl: { compact: true, customAttribution: '국경 Natural Earth · 공항 OurAirports' },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current = map;
    map.on('load', () => {
      for (const id of ['airports', 'base', 'storm', 'route', 'pts']) {
        map.addSource(id, id === 'airports' ? { type: 'geojson', data: EMPTY, cluster: true, clusterRadius: 34, clusterMaxZoom: 7 } : { type: 'geojson', data: EMPTY });
      }
      map.addLayer({
        id: 'ap-cluster',
        type: 'circle',
        source: 'airports',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#6f9ccf',
          'circle-opacity': 0.16,
          'circle-stroke-color': '#8fb6e0',
          'circle-stroke-width': 0.8,
          'circle-stroke-opacity': 0.35,
          'circle-radius': ['step', ['get', 'point_count'], 4.5, 50, 7, 500, 10],
        },
      });
      map.addLayer({
        id: 'ap-point',
        type: 'circle',
        source: 'airports',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['case', ['get', 'closed'], '#4a566a', ['get', 'major'], '#9cc6f0', '#5f87b3'],
          'circle-radius': ['case', ['get', 'major'], 4, 2.6],
          'circle-stroke-color': '#0b1524',
          'circle-stroke-width': 1,
        },
      });
      map.addLayer({ id: 'storm-fill', type: 'fill', source: 'storm', paint: { 'fill-color': '#ff7a59', 'fill-opacity': 0.14 } });
      map.addLayer({ id: 'storm-glow', type: 'line', source: 'storm', paint: { 'line-color': '#ff7a59', 'line-width': 8, 'line-opacity': 0.18, 'line-blur': 6 } });
      map.addLayer({ id: 'storm-line', type: 'line', source: 'storm', paint: { 'line-color': '#ff8a6a', 'line-width': 1.4 } });
      map.addLayer({
        id: 'base',
        type: 'line',
        source: 'base',
        paint: { 'line-color': ['case', ['get', 'blocked'], '#ff8a6a', '#c9d6e8'], 'line-width': 1.6, 'line-opacity': 0.8, 'line-dasharray': [2, 2.5] },
      });
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#f2b45a', 'line-width': 10, 'line-opacity': 0.22, 'line-blur': 6 },
      });
      map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#f6c470', 'line-width': 2.6 } });
      map.addLayer({
        id: 'pts',
        type: 'circle',
        source: 'pts',
        paint: { 'circle-color': ['get', 'color'], 'circle-radius': 4, 'circle-stroke-color': '#0b1524', 'circle-stroke-width': 1.5 },
      });
      map.on('click', 'ap-point', (e) => {
        if (propsRef.current.placing) return;
        const f = e.features?.[0];
        if (f) propsRef.current.onSelectAirport(Number(f.properties!.id));
      });
      map.on('click', 'ap-cluster', async (e) => {
        const f = e.features?.[0];
        if (!f || propsRef.current.placing) return;
        const z = await (map.getSource('airports') as GeoJSONSource).getClusterExpansionZoom(f.properties!.cluster_id);
        map.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom: z });
      });
      for (const id of ['ap-point', 'ap-cluster']) {
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = propsRef.current.placing ? 'crosshair' : ''));
      }
      ready.current = true;
      sync();
    });
    map.on('click', (e) => {
      if (propsRef.current.placing) propsRef.current.onPlace({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });
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

  function marker(key: string, make: () => Marker, at: LatLon | null) {
    const map = mapRef.current!;
    let m = markers.current[key];
    if (!at) {
      m?.remove();
      delete markers.current[key];
      return null;
    }
    if (!m) {
      m = make().setLngLat([at.lon, at.lat]).addTo(map);
      markers.current[key] = m;
    } else m.setLngLat([at.lon, at.lat]);
    return m;
  }

  function sync() {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const p = propsRef.current;
    const trip = p.showStorm === false ? null : p.trip;
    setData(
      'airports',
      fc(
        (p.airports ?? []).map((a) => ({
          type: 'Feature',
          properties: { id: a.id, closed: isClosed(a), major: a.type === 'large_airport' || a.type === 'medium_airport' },
          geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
        })),
      ),
    );
    if (trip) {
      setData('base', fc([{ ...line(trip.baseRoute), properties: { blocked: trip.result.status === 'crossing' } }]));
      setData('storm', fc([{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [trip.stormBoundary.map((q) => [q.lon, q.lat])] } }]));
      setData('route', trip.result.detour ? fc([line(trip.samples.map((s) => s.geo))]) : EMPTY);
      const pts: Feature<Point>[] = [];
      const add = (q: { x: number; y: number } | null, color: string) => {
        if (!q) return;
        const g = trip.toGeo(q);
        pts.push({ type: 'Feature', properties: { color }, geometry: { type: 'Point', coordinates: [g.lon, g.lat] } });
      };
      if (trip.result.status !== 'miss') {
        add(trip.result.B1, '#ff8a6a');
        add(trip.result.B2, '#ff8a6a');
      }
      add(trip.result.detour?.P ?? null, '#f6c470');
      add(trip.result.detour?.Q ?? null, '#f6c470');
      setData('pts', fc(pts));
    } else {
      // 아직 태풍이 없으면 직선 항로를 금빛 실선으로 보여 준다
      setData('base', EMPTY);
      setData('route', p.destination ? fc([line(p.trip?.baseRoute ?? straight(p.destination))]) : EMPTY);
      for (const id of ['storm', 'pts']) setData(id, EMPTY);
    }

    marker('O', () => new maplibregl.Marker({ element: el('bm-pin origin', '<i></i><span><b>ICN</b> 인천 · O</span>'), anchor: 'left' }), ICN);
    const dm = marker(
      'A',
      () => new maplibregl.Marker({ element: el('bm-pin dest', '<i></i><span></span>'), anchor: 'left' }),
      p.destination ? { lat: p.destination.lat, lon: p.destination.lon } : null,
    );
    if (dm && p.destination) dm.getElement().querySelector('span')!.innerHTML = `<b>${p.destination.iata || p.destination.ident}</b> A`;
    marker(
      'C',
      () => {
        const m = new maplibregl.Marker({
          element: el(
            'bm-storm',
            '<svg viewBox="-20 -20 40 40" width="34" height="34"><circle r="17" fill="rgba(255,122,89,.18)" stroke="#ff8a6a" stroke-width="1.5"/><path d="M0 0m-9 0a9 9 0 1 1 9 9M0 0m9 0a9 9 0 1 1-9-9" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg><span>C</span>',
          ),
          draggable: true,
        });
        m.on('drag', () => {
          const ll = m.getLngLat();
          propsRef.current.onStormDrag({ lat: ll.lat, lon: ll.lng });
        });
        return m;
      },
      trip ? trip.input.stormCenter : null,
    );

    markers.current.C?.setDraggable(!!p.stormEditable);
    markers.current.C?.getElement().classList.toggle('locked', !p.stormEditable);

    const key = p.destination ? `${p.destination.id}|${trip ? 'storm' : 'line'}` : '';
    if (key && key !== fitted.current) {
      fitted.current = key;
      let all: LatLon[];
      if (trip) {
        // 태풍 경계의 경도를 항로와 같은 쪽(±360°)으로 맞춰야 날짜변경선 근처에서 화면이 세계 전체로 벌어지지 않는다
        const routeMid = trip.baseRoute[Math.floor(trip.baseRoute.length / 2)].lon;
        const stormMid = trip.stormBoundary.reduce((acc, q) => acc + q.lon, 0) / trip.stormBoundary.length;
        const shift = Math.round((routeMid - stormMid) / 360) * 360;
        all = [...trip.baseRoute, ...trip.stormBoundary.map((q) => ({ lat: q.lat, lon: q.lon + shift }))];
      } else all = p.trip?.baseRoute ?? straight(p.destination!);
      const lons = all.map((q) => q.lon);
      const lats = all.map((q) => q.lat);
      map.fitBounds(
        [
          [Math.min(...lons), Math.max(-80, Math.min(...lats))],
          [Math.max(...lons), Math.min(80, Math.max(...lats))],
        ],
        { padding: p.padding ?? 60, duration: 1200, maxZoom: 5.5 },
      );
    }
  }

  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.trip, props.airports, props.destination, props.stormEditable, props.showStorm]);

  useEffect(() => {
    const c = mapRef.current?.getCanvas();
    if (c) c.style.cursor = props.placing ? 'crosshair' : '';
  }, [props.placing]);

  return <div ref={box} className="booking-map" />;
}
