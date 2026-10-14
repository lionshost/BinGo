import type BottomSheet from '@gorhom/bottom-sheet';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BinSheet } from '@/components/bin-sheet';
import { DirectionsPanel, NavBanner } from '@/components/directions-panel';
import { MapContainer, type MapController } from '@/components/map-container';
import { Text, success, tap, useToast } from '@/components/ui';
import { inHanoi, matchesFilter, normalize, STATUS, type Filter } from '@/lib/bins';
import { useBinGo } from '@/lib/store';
import { C, F, shadow } from '@/lib/theme';

const FILTERS: { key: Filter; label: string; dot?: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'priority', label: 'Cần thu gom', dot: C.hot },
  { key: 'recyclable', label: 'Tái chế', dot: C.green },
  { key: 'broken', label: 'Hỏng', dot: C.grey },
  { key: 'collected', label: 'Đã thu', dot: C.blue },
];

// Nền dự phòng khi Tilemap key VIETMAP bị chặn hoặc chưa cấu hình.
const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const HANOI_BOUNDS: [number, number, number, number] = [105.6, 20.85, 106.05, 21.3];

/** Giữ màn hình sáng khi đang dẫn đường. */
function KeepAwake() {
  useKeepAwake('bingo-nav');
  return null;
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const camera = useRef<MapController>(null);
  const sheet = useRef<BottomSheet>(null);
  // Key VIETMAP đã lỗi khi tải → dùng OSM cho key đó; key mới từ máy chủ sẽ được thử lại.
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [text, setText] = useState('');
  const [panelH, setPanelH] = useState(0);
  const [starting, setStarting] = useState(false);
  const {
    bins, byId, config, loading, error, cachedAt, load, collected, position, locate, route,
    filter, setFilter, query, setQuery, selectedId, setSelectedId, focusBin, mapRequest,
    directions, clearDirections, navigating, progress, startNavigation, stopNavigation,
  } = useBinGo();

  // Tìm kiếm có trễ để gõ không giật.
  useEffect(() => {
    const t = setTimeout(() => setQuery(normalize(text)), 180);
    return () => clearTimeout(t);
  }, [text, setQuery]);

  const mapStyle = config?.tilemapKey && config.tilemapKey !== failedKey
    ? `https://maps.vietmap.vn/maps/styles/lm/style.json?apikey=${encodeURIComponent(config.tilemapKey)}`
    : OSM_STYLE;

  const visible = useMemo(() => bins.filter(b => matchesFilter(b, filter, query, collected)), [bins, filter, query, collected]);

  const binsGeo = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: visible.map(b => {
      const done = Boolean(collected[b.id]);
      return {
        type: 'Feature',
        id: b.id,
        geometry: { type: 'Point', coordinates: [b.longitude, b.latitude] },
        properties: {
          id: b.id,
          color: done ? C.blue : (STATUS[b.status] ?? STATUS.active).color,
          urgent: !done && (b.status === 'full' || b.status === 'overloaded') ? 1 : 0,
          done: done ? 1 : 0,
        },
      };
    }),
  }), [visible, collected]);

  const selected = selectedId ? byId.get(selectedId) : undefined;

  const routeLine = useMemo<GeoJSON.Feature | null>(() => {
    if (!route) return null;
    const coords = route.geometry?.length
      ? route.geometry.map(([lat, lon]) => [lon, lat])
      : [[route.start.lon, route.start.lat], ...route.binIds.map(id => byId.get(id)).filter(Boolean).map(b => [b!.longitude, b!.latitude])];
    return { type: 'Feature', properties: { estimate: route.geometry ? 0 : 1 }, geometry: { type: 'LineString', coordinates: coords } };
  }, [route, byId]);

  const dirBin = directions ? byId.get(directions.binId) : undefined;
  const directionsGeo = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!directions || !dirBin) return null;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { estimate: directions.estimate ? 1 : 0 },
          geometry: { type: 'LineString', coordinates: directions.geometry.map(([lat, lon]) => [lon, lat]) },
        },
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [dirBin.longitude, dirBin.latitude] } },
      ],
    };
  }, [directions, dirBin]);
  // Thẻ chỉ đường nhường chỗ cho bottom sheet khi đang xem chi tiết một điểm.
  const showPanel = Boolean(directions && dirBin && !selectedId);

  // Mở/đóng sheet theo điểm đang chọn.
  useEffect(() => {
    if (selectedId) sheet.current?.snapToIndex(0);
    else sheet.current?.close();
  }, [selectedId]);

  // Yêu cầu từ tab khác: bay tới điểm, hoặc khớp khung tuyến.
  useEffect(() => {
    if (!mapRequest) return;
    if (mapRequest.kind === 'bin') {
      const b = byId.get(mapRequest.id);
      if (b) {
        camera.current?.flyTo({ center: [b.longitude, b.latitude], zoom: 16, duration: 700, padding: { top: 0, left: 0, right: 0, bottom: 320 } });
      }
    } else if (mapRequest.kind === 'directions' && directions) {
      const lons = directions.geometry.map(p => p[1]);
      const lats = directions.geometry.map(p => p[0]);
      camera.current?.fitBounds([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], {
        padding: { top: insets.top + 140, left: 50, right: 50, bottom: (panelH || 220) + 40 },
        duration: 800,
      });
    } else if (mapRequest.kind === 'route' && route) {
      const pts = route.binIds.map(id => byId.get(id)).filter(Boolean).map(b => [b!.longitude, b!.latitude]);
      pts.push([route.start.lon, route.start.lat]);
      const lons = pts.map(p => p[0]);
      const lats = pts.map(p => p[1]);
      camera.current?.fitBounds([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], {
        padding: { top: insets.top + 140, left: 40, right: 40, bottom: 60 },
        duration: 800,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRequest]);

  // Đang dẫn đường: camera bám theo vị trí GPS.
  useEffect(() => {
    if (!navigating || !position) return;
    camera.current?.flyTo({
      center: [position.lon, position.lat],
      zoom: 17,
      duration: 800,
      padding: { top: insets.top + 120, left: 0, right: 0, bottom: (panelH || 100) + 20 },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigating, position]);

  // Tới nơi → kết thúc dẫn đường, mở chi tiết điểm để đánh dấu đã thu.
  useEffect(() => {
    if (!progress?.arrived || !directions) return;
    const { binId } = directions;
    success();
    toast(`Đã đến ${byId.get(binId)?.name ?? binId}`, 'ok');
    clearDirections();
    focusBin(binId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.arrived]);

  const onStartNav = async () => {
    setStarting(true);
    try {
      await startNavigation();
    } catch (err: any) {
      toast(err.message, 'danger');
    } finally {
      setStarting(false);
    }
  };

  const onLocate = async () => {
    tap();
    setLocating(true);
    try {
      const p = await locate();
      if (!inHanoi(p)) toast('Bạn đang ở ngoài khu vực Hà Nội của dữ liệu mẫu.');
      camera.current?.flyTo({ center: [p.lon, p.lat], zoom: 15, duration: 700 });
    } catch (err: any) {
      toast(err.message, 'danger');
    } finally {
      setLocating(false);
    }
  };

  const onSubmitSearch = () => {
    if (visible.length === 1) {
      tap();
      focusBin(visible[0].id);
    } else if (query && !visible.length) {
      toast('Không tìm thấy điểm phù hợp.');
    }
  };

  return (
    <View style={styles.root}>
      <MapContainer
        ref={camera}
        mapStyle={mapStyle}
        hanoiBounds={HANOI_BOUNDS}
        binsGeo={binsGeo}
        routeLine={routeLine}
        directionsGeo={directionsGeo}
        selected={selected}
        route={route}
        byId={byId}
        collected={collected}
        position={position}
        visibleBins={visible}
        totalBinsCount={bins.length}
        selectedId={selectedId}
        onSelectBin={id => focusBin(id)}
        onDeselect={() => setSelectedId(null)}
        onDidFailLoadingMap={() => setFailedKey(config?.tilemapKey ?? null)}
      />

      {navigating && <KeepAwake />}

      {/* Thanh tìm kiếm + bộ lọc (ẩn khi đang dẫn đường) */}
      <View style={[styles.top, { paddingTop: insets.top + 10 }, navigating && { display: 'none' }]} pointerEvents="box-none">
        <View style={styles.search}>
          <MaterialIcons name="search" size={22} color={C.muted} />
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={onSubmitSearch}
            placeholder="Tìm mã điểm, tên đường, quận…"
            placeholderTextColor="#9aaba4"
            returnKeyType="search"
            style={styles.searchInput}
            accessibilityLabel="Tìm điểm thu gom"
          />
          {text ? (
            <Pressable onPress={() => setText('')} hitSlop={10} accessibilityLabel="Xóa tìm kiếm">
              <MaterialIcons name="close" size={20} color={C.muted} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {FILTERS.map(f => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => { tap(); setFilter(f.key); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[styles.chip, on && { backgroundColor: C.ink }]}>
                {f.dot && <View style={[styles.dot, { backgroundColor: f.dot }]} />}
                <Text weight="semibold" style={{ fontSize: 13.5, color: on ? '#fff' : C.ink }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {(loading || error || cachedAt) && (
          <View style={[styles.banner, error ? { backgroundColor: '#fdeceb' } : cachedAt ? { backgroundColor: '#fff7e6' } : null]}>
            {loading && <ActivityIndicator color={C.green} size="small" />}
            <View style={{ flex: 1 }}>
              <Text weight="medium" style={{ fontSize: 13.5, color: error ? '#8b2018' : C.ink }}>
                {loading
                  ? 'Đang tải điểm thu gom…'
                  : error
                    ? error
                    : `Ngoại tuyến · dữ liệu lưu lúc ${new Date(cachedAt!).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`}
              </Text>
              {loading && <Text style={{ fontSize: 12, color: C.muted }}>Lần đầu có thể mất ~50 giây khi máy chủ khởi động.</Text>}
            </View>
            {!loading && (
              <Pressable onPress={() => load()} hitSlop={8}>
                <Text weight="bold" style={{ color: C.deep, textDecorationLine: 'underline' }}>Thử lại</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {bins.length > 0 && !selectedId && !showPanel && (
        <View style={styles.count} pointerEvents="none">
          <Text weight="semibold" style={{ color: '#fff', fontSize: 12.5 }}>{visible.length} / {bins.length} điểm</Text>
        </View>
      )}

      {!selectedId && (
        <Pressable
          style={({ pressed }) => [styles.fab, showPanel && { bottom: panelH + 12 }, pressed && { transform: [{ scale: 0.94 }] }]}
          onPress={onLocate} accessibilityLabel="Về vị trí của tôi">
          {locating ? <ActivityIndicator color={C.deep} /> : <MaterialIcons name="my-location" size={24} color={C.deep} />}
        </Pressable>
      )}

      {navigating && progress && dirBin && <NavBanner progress={progress} bin={dirBin} />}

      {showPanel && (
        <DirectionsPanel
          directions={directions!}
          bin={dirBin!}
          navigating={navigating}
          progress={progress}
          starting={starting}
          onStart={onStartNav}
          onStop={stopNavigation}
          onClose={() => { tap(); clearDirections(); }}
          onLayout={e => setPanelH(e.nativeEvent.layout.height)}
        />
      )}

      <BinSheet ref={sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e8eee9' },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    marginHorizontal: 14,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: C.surface,
    ...shadow,
    elevation: 4,
  },
  searchInput: { flex: 1, fontSize: 16, color: C.ink, fontFamily: F.regular, paddingVertical: 0 },
  chips: { gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: C.surface,
    ...shadow,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: C.surface,
    ...shadow,
    elevation: 4,
  },
  count: {
    position: 'absolute',
    left: 14,
    bottom: 26,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(25,61,52,0.85)',
  },
  fab: {
    position: 'absolute',
    right: 14,
    bottom: 18,
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    elevation: 5,
  },
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
  stopPinText: { color: '#fff', fontSize: 12.5 },
});
