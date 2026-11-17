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

const landGeo = feature(countries50 as unknown as Topology, (countries50 as unknown as Topology).objects.countries) as unknown as FeatureCollection;
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const line = (pts: LatLon[]): Feature<LineString> => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lon, p.lat]) },
});
const fc = (features: Feature<Geometry>[]): FeatureCollection => ({ type: 'FeatureCollection', features });

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { land: { type: 'geojson', data: landGeo } },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#c9dde3' } },
    { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#f4eee2' } },
    { id: 'border', type: 'line', source: 'land', paint: { 'line-color': '#dfd3bd', 'line-width': 0.6 } },
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
      zoom: 1.4,
      attributionControl: { compact: true, customAttribution: '국경 Natural Earth · 공항 OurAirports' },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
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
        paint: { 'circle-color': '#8fb9c9', 'circle-opacity': 0.6, 'circle-radius': ['step', ['get', 'point_count'], 7, 50, 11, 500, 15] },
      });
      map.addLayer({
        id: 'ap-point',
        type: 'circle',
        source: 'airports',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['case', ['get', 'closed'], '#b9b2a6', ['get', 'major'], '#3f8fb0', '#7fb3c7'],
          'circle-radius': ['case', ['get', 'major'], 4.5, 3],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1,
        },
      });
      map.addLayer({ id: 'storm-fill', type: 'fill', source: 'storm', paint: { 'fill-color': '#7c93b8', 'fill-opacity': 0.22 } });
      map.addLayer({ id: 'storm-line', type: 'line', source: 'storm', paint: { 'line-color': '#5b6f99', 'line-width': 1.6 } });
      map.addLayer({
        id: 'base',
        type: 'line',
        source: 'base',
        paint: { 'line-color': ['case', ['get', 'blocked'], '#d8735a', '#5b6f99'], 'line-width': 2, 'line-dasharray': [3, 2.5] },
      });
      map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#2e8f86', 'line-width': 3.5 } });
      map.addLayer({
        id: 'pts',
        type: 'circle',
        source: 'pts',
        paint: { 'circle-color': ['get', 'color'], 'circle-radius': 4.5, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
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
    const trip = p.trip;
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
        add(trip.result.B1, '#e07a5f');
        add(trip.result.B2, '#e07a5f');
      }
      add(trip.result.detour?.P ?? null, '#2a9d8f');
      add(trip.result.detour?.Q ?? null, '#2a9d8f');
      setData('pts', fc(pts));
    } else {
      setData('base', p.destination ? fc([{ ...line([ICN, p.destination]), properties: { blocked: false } }]) : EMPTY);
      for (const id of ['storm', 'route', 'pts']) setData(id, EMPTY);
    }

    marker('O', () => new maplibregl.Marker({ element: el('bm-pin origin', '<i></i><span>O 인천</span>'), anchor: 'left' }), ICN);
    const dm = marker(
      'A',
      () => new maplibregl.Marker({ element: el('bm-pin dest', '<i></i><span></span>'), anchor: 'left' }),
      p.destination ? { lat: p.destination.lat, lon: p.destination.lon } : null,
    );
    if (dm && p.destination) dm.getElement().querySelector('span')!.textContent = `A ${p.destination.iata || p.destination.ident}`;
    marker(
      'C',
      () => {
        const m = new maplibregl.Marker({ element: el('bm-storm', '🌀<span>C</span>'), draggable: true });
        m.on('drag', () => {
          const ll = m.getLngLat();
          propsRef.current.onStormDrag({ lat: ll.lat, lon: ll.lng });
        });
        return m;
      },
      trip ? trip.input.stormCenter : null,
    );

    const key = p.destination ? String(p.destination.id) : '';
    if (key && key !== fitted.current && trip) {
      fitted.current = key;
      // 태풍 경계의 경도를 항로와 같은 쪽(±360°)으로 맞춰야 날짜변경선 근처에서 화면이 세계 전체로 벌어지지 않는다
      const routeMid = trip.baseRoute[Math.floor(trip.baseRoute.length / 2)].lon;
      const stormMid = trip.stormBoundary.reduce((acc, q) => acc + q.lon, 0) / trip.stormBoundary.length;
      const shift = Math.round((routeMid - stormMid) / 360) * 360;
      const all = [...trip.baseRoute, ...trip.stormBoundary.map((q) => ({ lat: q.lat, lon: q.lon + shift }))];
      const lons = all.map((q) => q.lon);
      const lats = all.map((q) => q.lat);
      map.fitBounds(
        [
          [Math.min(...lons), Math.max(-80, Math.min(...lats))],
          [Math.max(...lons), Math.min(80, Math.max(...lats))],
        ],
        { padding: 60, duration: 900, maxZoom: 6 },
      );
    }
  }

  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.trip, props.airports, props.destination]);

  useEffect(() => {
    const c = mapRef.current?.getCanvas();
    if (c) c.style.cursor = props.placing ? 'crosshair' : '';
  }, [props.placing]);

  return <div ref={box} className="booking-map" />;
}
