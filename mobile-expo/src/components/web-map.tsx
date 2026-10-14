// Bản đồ VIETMAP GL JS (MapLibre) chạy trong WebView — dùng khi không có MapLibre native (Expo Go).
// Vẽ cùng nền, cùng lớp điểm/tuyến như bản native để hai chế độ trông giống nhau.
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { C } from '@/lib/theme';

export interface WebMapData {
  binsGeo: GeoJSON.FeatureCollection;
  routeLine: GeoJSON.Feature | null;
  directionsGeo: GeoJSON.FeatureCollection | null;
  stops: { id: string; lngLat: [number, number]; done: boolean }[];
  selected: [number, number] | null;
  position: [number, number] | null;
}

export interface WebMapHandle {
  flyTo: (options: { center: [number, number]; zoom?: number; duration?: number; padding?: any }) => void;
  fitBounds: (bounds: [number, number, number, number], options?: { padding?: any; duration?: number }) => void;
}

interface Props {
  mapStyle: StyleSpecification | string;
  bounds: [number, number, number, number];
  data: WebMapData;
  onSelectBin: (id: string) => void;
  onDeselect: () => void;
  onFail?: () => void;
}

// Tile VIETMAP dùng định dạng riêng, chỉ bản MapLibre của VIETMAP (vietmap-gl-js) giải mã được.
const GL = 'https://unpkg.com/@vietmap/vietmap-gl-js@6.0.1/dist/vietmap-gl';

const buildHtml = (style: StyleSpecification | string, bounds: [number, number, number, number]) => `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="${GL}.css">
<script src="${GL}.js"></script>
<style>
  html,body,#map{margin:0;height:100%;width:100%;background:#e8eee9}
  .maplibregl-ctrl-attrib,.vietmapgl-ctrl-attrib{font:11px sans-serif}
  .stop{width:24px;height:24px;border-radius:50%;background:${C.deep};border:2px solid #fff;
    color:#fff;font:700 12px sans-serif;display:flex;align-items:center;justify-content:center;
    box-shadow:0 1px 4px rgba(0,0,0,.3)}
  .stop.done{background:${C.blue};opacity:.8}
</style>
</head><body><div id="map"></div>
<script>
  const post = m => window.ReactNativeWebView.postMessage(JSON.stringify(m));
  const empty = { type: 'FeatureCollection', features: [] };
  let ready = false, pending = null, stopMarkers = [];

  const map = new vietmapgl.Map({
    container: 'map',
    style: ${JSON.stringify(style)},
    center: [105.8542, 21.0285],
    zoom: 12.5,
    minZoom: 10,
    maxZoom: 19,
    maxBounds: ${JSON.stringify(bounds)},
    attributionControl: { compact: true },
    pitchWithRotate: false,
    dragRotate: false,
  });
  map.touchZoomRotate.disableRotation();

  map.on('error', e => {
    // Lỗi khi tải style (vd. key VIETMAP bị chặn) → báo RN chuyển sang nền OSM.
    if (!map.isStyleLoaded() && !ready) post({ type: 'fail' });
  });

  // style.load: vẽ điểm ngay khi có style, không đợi tải xong tile nền.
  map.once('style.load', () => {
    map.addSource('route', { type: 'geojson', data: empty });
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', filter: ['==', ['get', 'estimate'], 0],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9 } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', filter: ['==', ['get', 'estimate'], 0],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '${C.deep}', 'line-width': 5 } });
    map.addLayer({ id: 'route-estimate', type: 'line', source: 'route', filter: ['==', ['get', 'estimate'], 1],
      paint: { 'line-color': '${C.deep}', 'line-width': 4, 'line-dasharray': [1, 2] } });

    // Chỉ đường: đường xanh dương, nét đứt khi chỉ là ước tính; chấm đích màu cam.
    const isLine = ['==', ['geometry-type'], 'LineString'];
    map.addSource('dir', { type: 'geojson', data: empty });
    map.addLayer({ id: 'dir-casing', type: 'line', source: 'dir', filter: ['all', isLine, ['==', ['get', 'estimate'], 0]],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 10 } });
    map.addLayer({ id: 'dir-line', type: 'line', source: 'dir', filter: ['all', isLine, ['==', ['get', 'estimate'], 0]],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '${C.blue}', 'line-width': 6 } });
    map.addLayer({ id: 'dir-estimate', type: 'line', source: 'dir', filter: ['all', isLine, ['==', ['get', 'estimate'], 1]],
      layout: { 'line-cap': 'round' }, paint: { 'line-color': '${C.blue}', 'line-width': 4, 'line-dasharray': [0.5, 2] } });
    map.addLayer({ id: 'dir-dest', type: 'circle', source: 'dir', filter: ['==', ['geometry-type'], 'Point'], paint: {
      'circle-radius': 11, 'circle-color': '${C.hot}', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });

    map.addSource('selected', { type: 'geojson', data: empty });
    map.addLayer({ id: 'selected-ring', type: 'circle', source: 'selected', paint: {
      'circle-radius': 17, 'circle-color': '${C.green}', 'circle-opacity': 0.18,
      'circle-stroke-color': '${C.deep}', 'circle-stroke-width': 3 } });

    map.addSource('bins', { type: 'geojson', data: empty });
    map.addLayer({ id: 'bins-circle', type: 'circle', source: 'bins', paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        11, ['case', ['==', ['get', 'urgent'], 1], 5, 3.5],
        16, ['case', ['==', ['get', 'urgent'], 1], 10, 7.5]],
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
      'circle-opacity': ['case', ['==', ['get', 'done'], 1], 0.6, 1] } });

    map.addSource('me', { type: 'geojson', data: empty });
    map.addLayer({ id: 'me-halo', type: 'circle', source: 'me',
      paint: { 'circle-radius': 18, 'circle-color': '#2f7fc1', 'circle-opacity': 0.18 } });
    map.addLayer({ id: 'me-dot', type: 'circle', source: 'me', paint: {
      'circle-radius': 7, 'circle-color': '#2f7fc1', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });

    ready = true;
    if (pending) window.__setData(pending);
    post({ type: 'ready' });
  });

  map.on('click', e => {
    const p = e.point;
    const hit = map.queryRenderedFeatures([[p.x - 12, p.y - 12], [p.x + 12, p.y + 12]], { layers: ['bins-circle'] });
    if (hit.length) post({ type: 'select', id: String(hit[0].properties.id) });
    else post({ type: 'deselect' });
  });

  const point = c => c ? { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } } : empty;

  window.__setData = d => {
    if (!ready) { pending = d; return; }
    map.getSource('bins').setData(d.binsGeo);
    map.getSource('route').setData(d.routeLine || empty);
    map.getSource('dir').setData(d.directionsGeo || empty);
    map.getSource('selected').setData(point(d.selected));
    map.getSource('me').setData(point(d.position));
    stopMarkers.forEach(m => m.remove());
    stopMarkers = d.stops.map((s, i) => {
      const el = document.createElement('div');
      el.className = 'stop' + (s.done ? ' done' : '');
      el.textContent = String(i + 1);
      return new vietmapgl.Marker({ element: el, anchor: 'bottom', offset: [0, -8] }).setLngLat(s.lngLat).addTo(map);
    });
  };
  window.__flyTo = o => map.flyTo(o);
  window.__fitBounds = (b, o) => map.fitBounds(b, o);
</script>
</body></html>`;

export const WebMap = forwardRef<WebMapHandle, Props>(function WebMap(
  { mapStyle, bounds, data, onSelectBin, onDeselect, onFail },
  ref,
) {
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  // Style chỉ dựng lại HTML khi đổi nền (VIETMAP → OSM), không theo từng lần cập nhật dữ liệu.
  const styleKey = typeof mapStyle === 'string' ? mapStyle : 'osm';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildHtml(mapStyle, bounds), [styleKey]);

  const run = (js: string) => web.current?.injectJavaScript(`${js};true;`);

  useEffect(() => {
    if (ready.current) run(`window.__setData(${JSON.stringify(data)})`);
  }, [data]);

  useImperativeHandle(ref, () => ({
    flyTo: o => run(`window.__flyTo(${JSON.stringify(o)})`),
    fitBounds: (b, o) => run(`window.__fitBounds(${JSON.stringify(b)}, ${JSON.stringify(o ?? {})})`),
  }));

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: { type: string; id?: string };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      ready.current = true;
      run(`window.__setData(${JSON.stringify(data)})`);
    } else if (msg.type === 'select' && msg.id) onSelectBin(msg.id);
    else if (msg.type === 'deselect') onDeselect();
    else if (msg.type === 'fail') onFail?.();
  };

  return (
    <WebView
      key={styleKey}
      ref={web}
      style={StyleSheet.absoluteFill}
      originWhitelist={['*']}
      source={{ html, baseUrl: 'https://localhost/' }}
      onMessage={onMessage}
      onLoadStart={() => { ready.current = false; }}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      overScrollMode="never"
      bounces={false}
      setSupportMultipleWindows={false}
      androidLayerType="hardware"
    />
  );
});
