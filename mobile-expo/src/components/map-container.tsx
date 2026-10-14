import type { CameraRef, StyleSpecification } from '@maplibre/maplibre-react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, TurboModuleRegistry, View } from 'react-native';

import { Text, tap } from '@/components/ui';
import { WebMap, type WebMapData, type WebMapHandle } from '@/components/web-map';
import type { Bin } from '@/lib/bins';
import type { Route } from '@/lib/store';
import { C } from '@/lib/theme';

export function isMapLibreSupported(): boolean {
  if (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    return false;
  }
  try {
    return Boolean(TurboModuleRegistry?.get?.('MLRNCameraModule'));
  } catch {
    return false;
  }
}

// Chỉ nạp native module khi KHÔNG chạy trong Expo Go và có native module trong binary.
let MapLibre: typeof import('@maplibre/maplibre-react-native') | null = null;
if (isMapLibreSupported()) {
  try {
    MapLibre = require('@maplibre/maplibre-react-native');
  } catch {
    MapLibre = null;
  }
}

export interface MapController {
  flyTo: (options: { center: [number, number]; zoom?: number; duration?: number; padding?: any }) => void;
  fitBounds: (bounds: [number, number, number, number], options?: { padding?: any; duration?: number }) => void;
}

export interface MapContainerProps {
  mapStyle: StyleSpecification | string;
  hanoiBounds: [number, number, number, number];
  binsGeo: GeoJSON.FeatureCollection;
  routeLine: GeoJSON.Feature | null;
  directionsGeo: GeoJSON.FeatureCollection | null;
  selected: Bin | undefined;
  route: Route | null;
  byId: Map<string, Bin>;
  collected: Record<string, number>;
  position: { lat: number; lon: number } | null;
  visibleBins: Bin[];
  totalBinsCount: number;
  selectedId: string | null;
  onSelectBin: (id: string) => void;
  onDeselect: () => void;
  onDidFailLoadingMap?: () => void;
}

export const MapContainer = forwardRef<MapController, MapContainerProps>(function MapContainer(
  {
    mapStyle,
    hanoiBounds,
    binsGeo,
    routeLine,
    directionsGeo,
    selected,
    route,
    byId,
    collected,
    position,
    onSelectBin,
    onDeselect,
    onDidFailLoadingMap,
  },
  ref
) {
  const nativeCameraRef = useRef<CameraRef>(null);
  const webRef = useRef<WebMapHandle>(null);

  const webData = useMemo<WebMapData>(
    () => ({
      binsGeo,
      routeLine,
      directionsGeo,
      stops: (route?.binIds ?? []).flatMap(id => {
        const b = byId.get(id);
        return b ? [{ id, lngLat: [b.longitude, b.latitude] as [number, number], done: Boolean(collected[id]) }] : [];
      }),
      selected: selected ? [selected.longitude, selected.latitude] : null,
      position: position ? [position.lon, position.lat] : null,
    }),
    [binsGeo, routeLine, directionsGeo, route, byId, collected, selected, position]
  );

  useImperativeHandle(ref, () => ({
    flyTo: options => {
      if (MapLibre) nativeCameraRef.current?.flyTo(options);
      else webRef.current?.flyTo(options);
    },
    fitBounds: (bounds, options) => {
      if (MapLibre) nativeCameraRef.current?.fitBounds(bounds, options);
      else webRef.current?.fitBounds(bounds, options);
    },
  }));

  // === CHẾ ĐỘ NATIVE MAPLIBRE (Đã build Dev Client) ===
  if (MapLibre) {
    const { Camera, GeoJSONSource, Layer, Map, NativeUserLocation, ViewAnnotation } = MapLibre;

    return (
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyle}
        attributionPosition={{ bottom: 8, left: 8 }}
        logo={false}
        compass={false}
        onDidFailLoadingMap={onDidFailLoadingMap}
        onPress={onDeselect}>
        <Camera
          ref={nativeCameraRef}
          initialViewState={{ center: [105.8542, 21.0285], zoom: 12.5 }}
          minZoom={10}
          maxZoom={19}
          maxBounds={hanoiBounds}
        />

        {routeLine && (
          <GeoJSONSource id="route" data={routeLine}>
            <Layer
              id="route-casing"
              type="line"
              filter={['==', ['get', 'estimate'], 0]}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#ffffff', 'line-width': 9 }}
            />
            <Layer
              id="route-line"
              type="line"
              filter={['==', ['get', 'estimate'], 0]}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': C.deep, 'line-width': 5 }}
            />
            <Layer
              id="route-estimate"
              type="line"
              filter={['==', ['get', 'estimate'], 1]}
              paint={{ 'line-color': C.deep, 'line-width': 4, 'line-dasharray': [1, 2] }}
            />
          </GeoJSONSource>
        )}

        {directionsGeo && (
          <GeoJSONSource id="directions" data={directionsGeo}>
            <Layer
              id="dir-casing"
              type="line"
              filter={['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'estimate'], 0]]}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#ffffff', 'line-width': 10 }}
            />
            <Layer
              id="dir-line"
              type="line"
              filter={['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'estimate'], 0]]}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': C.blue, 'line-width': 6 }}
            />
            <Layer
              id="dir-estimate"
              type="line"
              filter={['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'estimate'], 1]]}
              layout={{ 'line-cap': 'round' }}
              paint={{ 'line-color': C.blue, 'line-width': 4, 'line-dasharray': [0.5, 2] }}
            />
            <Layer
              id="dir-dest"
              type="circle"
              filter={['==', ['geometry-type'], 'Point']}
              paint={{ 'circle-radius': 11, 'circle-color': C.hot, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 }}
            />
          </GeoJSONSource>
        )}

        <GeoJSONSource
          id="bins"
          data={binsGeo}
          hitbox={{ top: 12, left: 12, bottom: 12, right: 12 }}
          onPress={e => {
            e.stopPropagation();
            const id = e.nativeEvent.features[0]?.properties?.id;
            if (id) {
              tap();
              onSelectBin(String(id));
            }
          }}>
          <Layer
            id="bins-circle"
            type="circle"
            paint={{
              'circle-color': ['get', 'color'],
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                11,
                ['case', ['==', ['get', 'urgent'], 1], 5, 3.5],
                16,
                ['case', ['==', ['get', 'urgent'], 1], 10, 7.5],
              ],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
              'circle-opacity': ['case', ['==', ['get', 'done'], 1], 0.6, 1],
            }}
          />
        </GeoJSONSource>

        {selected && (
          <GeoJSONSource
            id="selected"
            data={{
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [selected.longitude, selected.latitude] },
            }}>
            <Layer
              id="selected-ring"
              type="circle"
              beforeId="bins-circle"
              paint={{
                'circle-radius': 17,
                'circle-color': C.green,
                'circle-opacity': 0.18,
                'circle-stroke-color': C.deep,
                'circle-stroke-width': 3,
              }}
            />
          </GeoJSONSource>
        )}

        {route?.binIds.map((id, i) => {
          const b = byId.get(id);
          if (!b) return null;
          return (
            <ViewAnnotation
              key={id}
              id={`stop-${id}`}
              lngLat={[b.longitude, b.latitude]}
              anchor="bottom"
              offset={[0, -8]}>
              <View
                style={[
                  styles.stopPin,
                  Boolean(collected[id]) && { backgroundColor: C.blue, opacity: 0.8 },
                ]}>
                <Text weight="bold" style={styles.stopPinText}>
                  {i + 1}
                </Text>
              </View>
            </ViewAnnotation>
          );
        })}

        {position && <NativeUserLocation />}
      </Map>
    );
  }

  // === EXPO GO: bản đồ MapLibre GL JS trong WebView ===
  return (
    <WebMap
      ref={webRef}
      mapStyle={mapStyle}
      bounds={hanoiBounds}
      data={webData}
      onSelectBin={id => {
        tap();
        onSelectBin(id);
      }}
      onDeselect={onDeselect}
      onFail={onDidFailLoadingMap}
    />
  );
});

const styles = StyleSheet.create({
  stopPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.deep,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopPinText: {
    color: '#fff',
    fontSize: 12.5,
  },
});
