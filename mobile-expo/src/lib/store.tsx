// STATE — dữ liệu dùng chung giữa các tab + phần lưu trên máy (AsyncStorage).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import {
  fetchBins, fetchMapConfig, loadCachedMapConfig, requestDirections, requestRoadRoute,
  type DirectionStep, type MapConfig,
} from './api';
import {
  HANOI_CENTER, inHanoi, binPoint, distanceM, pathKm, planNearestRoute,
  type Bin, type BinStatus, type Filter, type Point,
} from './bins';
import { navProgress, OFF_ROUTE_M, type NavProgress } from './nav';

const LOCAL_KEY = 'bingo.local.v1';

export interface Route {
  binIds: string[];
  start: Point;
  geometry: [number, number][] | null; // [lat, lon]
  km: number;
  source: string; // "estimate" hoặc tên dịch vụ
}

/** Chỉ đường từ vị trí hiện tại tới một điểm (vẽ ngay trên bản đồ). */
export interface Directions {
  binId: string;
  from: Point;
  geometry: [number, number][]; // [lat, lon]
  distance: number; // m
  time: number | null; // giây; null khi chỉ là ước tính
  steps: DirectionStep[];
  estimate: boolean; // true = đường chim bay (chưa có đường bộ)
}

interface Local {
  day: string;
  collected: Record<string, number>;
  overrides: Record<string, { status: BinStatus; at: number }>;
}

/** Yêu cầu một lần cho màn bản đồ (bay tới điểm / khớp tuyến); nonce đổi để kích hoạt lại. */
export type MapRequest =
  | { kind: 'bin'; id: string; nonce: number }
  | { kind: 'route'; nonce: number }
  | { kind: 'directions'; nonce: number }
  | null;

const today = () => new Date().toDateString();

function useBinGoState() {
  const [rawBins, setRawBins] = useState<Bin[]>([]);
  const [config, setConfig] = useState<MapConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [local, setLocal] = useState<Local>({ day: today(), collected: {}, overrides: {} });
  const [position, setPosition] = useState<(Point & { accuracy?: number }) | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanBinId, setScanBinId] = useState<string | null>(null);
  const [mapRequest, setMapRequest] = useState<MapRequest>(null);
  const [directions, setDirections] = useState<Directions | null>(null);
  const [navigating, setNavigating] = useState(false);
  const watcher = useRef<Location.LocationSubscription | null>(null);
  const rerouting = useRef(0);
  const loadedAt = useRef(0);
  const hydrated = useRef(false);
  const configRef = useRef<MapConfig | null>(null);
  const configFresh = useRef(false);

  // Áp trạng thái cập nhật từ ảnh (lưu trên máy) lên dữ liệu máy chủ.
  const bins = useMemo(
    () => rawBins.map(b => {
      const o = local.overrides[b.id];
      return o ? { ...b, status: o.status, inspectedAt: o.at } : b;
    }),
    [rawBins, local.overrides],
  );
  const byId = useMemo(() => new Map(bins.map(b => [b.id, b])), [bins]);

  // Chỉ đặt state sau await — an toàn khi gọi trong effect.
  const fetchAll = useCallback(async (reportError: boolean) => {
    // Chưa lấy được cấu hình từ máy chủ (đang khởi động / mất mạng) → lấy lại cùng lúc.
    if (!configFresh.current) {
      fetchMapConfig().then(c => {
        if (!c) return;
        configFresh.current = true;
        configRef.current = c;
        setConfig(c);
      });
    }
    try {
      const res = await fetchBins();
      setRawBins(res.bins);
      setCachedAt(res.cachedAt);
      setError(null);
      loadedAt.current = Date.now();
    } catch (err: any) {
      if (reportError) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Tải lại có hiện trạng thái đang tải (nút "Thử lại"). */
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetchAll(true);
  }, [fetchAll]);

  useEffect(() => {
    (async () => {
      try {
        const saved = JSON.parse((await AsyncStorage.getItem(LOCAL_KEY)) || 'null');
        // "Đã thu" chỉ tính trong ngày; sang ngày mới thì reset.
        if (saved) setLocal({ day: today(), collected: saved.day === today() ? saved.collected || {} : {}, overrides: saved.overrides || {} });
      } catch {}
      hydrated.current = true;
      // Key đã lưu → vẽ nền VIETMAP ngay, không đợi máy chủ Render khởi động.
      const cached = await loadCachedMapConfig();
      if (cached && !configRef.current) {
        configRef.current = cached;
        setConfig(cached);
      }
      await fetchAll(true);
    })();
    // Quay lại app sau hơn 10 phút → làm mới dữ liệu ngầm.
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' && Date.now() - loadedAt.current > 10 * 60 * 1000) fetchAll(false);
    });
    return () => sub.remove();
  }, [fetchAll]);

  useEffect(() => {
    if (hydrated.current) AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(local)).catch(() => {});
  }, [local]);

  /** Trả về true nếu vừa đánh dấu đã thu. */
  const toggleCollected = useCallback((id: string) => {
    const done = !local.collected[id];
    setLocal(l => {
      const collected = { ...l.collected };
      if (done) collected[id] = Date.now();
      else delete collected[id];
      return { ...l, collected };
    });
    return done;
  }, [local.collected]);

  const setBinStatus = useCallback((id: string, status: BinStatus) => {
    setLocal(l => ({ ...l, overrides: { ...l.overrides, [id]: { status, at: Date.now() } } }));
  }, []);

  /** Xin quyền + lấy vị trí; ném lỗi tiếng Việt nếu không được. */
  const locate = useCallback(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') throw new Error('Chưa có quyền vị trí. Hãy bật định vị cho BinGo trong Cài đặt.');
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const p = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined };
      setPosition(p);
      return p;
    } catch {
      throw new Error('Không lấy được vị trí. Kiểm tra GPS rồi thử lại.');
    }
  }, []);

  /** Lập tuyến; trả về ghi chú cần báo người dùng (nếu có). */
  const buildRoute = useCallback(async (count: number): Promise<string[]> => {
    const notes: string[] = [];
    let start = HANOI_CENTER;
    try {
      const p = await locate();
      if (inHanoi(p)) start = p;
      else notes.push('Bạn ở ngoài Hà Nội — tuyến xuất phát từ trung tâm Hà Nội.');
    } catch (err: any) {
      notes.push(`${err.message} Tạm dùng trung tâm Hà Nội.`);
    }
    const picked = planNearestRoute(bins, local.collected, start, count);
    if (!picked.length) {
      setRoute(null);
      return ['Không còn điểm đầy/tràn cần thu gom. Tuyệt vời!'];
    }
    const binIds = picked.map(b => b.id);
    // Hiện ngay theo đường chim bay, rồi thay bằng đường bộ nếu có.
    const estimate: Route = { binIds, start, geometry: null, km: pathKm([start, ...picked.map(binPoint)]) * 1.35, source: 'estimate' };
    setRoute(estimate);
    if (config?.routingConfigured) {
      try {
        const road = await requestRoadRoute(binIds);
        const km = pathKm(road.geometry.map(([lat, lon]) => ({ lat, lon })));
        setRoute({ ...estimate, geometry: road.geometry, km, source: road.source });
      } catch (err: any) {
        notes.push(`${err.message} Đang hiển thị đường chim bay.`);
      }
    }
    setMapRequest({ kind: 'route', nonce: Date.now() });
    return notes;
  }, [bins, config, local.collected, locate]);

  /** Chỉ đường tới một điểm; trả về ghi chú cần báo người dùng (nếu có). Ném lỗi khi không có vị trí. */
  const startDirections = useCallback(async (binId: string): Promise<string | null> => {
    const bin = byId.get(binId);
    if (!bin) return null;
    const from = await locate();
    const to = binPoint(bin);
    // Hiện ngay đường chim bay, rồi thay bằng đường bộ VIETMAP.
    const estimate: Directions = {
      binId, from, geometry: [[from.lat, from.lon], [to.lat, to.lon]],
      distance: distanceM(from, to) * 1.35, time: null, steps: [], estimate: true,
    };
    setDirections(estimate);
    setSelectedId(null);
    setMapRequest({ kind: 'directions', nonce: Date.now() });
    try {
      const road = await requestDirections(from, binId);
      setDirections(d => (d?.binId === binId ? {
        ...estimate, geometry: road.geometry, distance: road.distance, time: road.time, steps: road.steps, estimate: false,
      } : d));
      setMapRequest({ kind: 'directions', nonce: Date.now() });
      return null;
    } catch (err: any) {
      return `${err.message} Đang hiển thị đường chim bay.`;
    }
  }, [byId, locate]);

  /** Dẫn đường trong app: theo dõi GPS liên tục, bản đồ bám theo người dùng. */
  const startNavigation = useCallback(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') throw new Error('Chưa có quyền vị trí. Hãy bật định vị cho BinGo trong Cài đặt.');
    watcher.current?.remove();
    watcher.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 2000 },
      pos => setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined }),
    );
    setNavigating(true);
  }, []);

  const stopNavigation = useCallback(() => {
    watcher.current?.remove();
    watcher.current = null;
    setNavigating(false);
  }, []);

  const clearDirections = useCallback(() => {
    stopNavigation();
    setDirections(null);
  }, [stopNavigation]);

  useEffect(() => () => watcher.current?.remove(), []);

  const progress = useMemo<NavProgress | null>(
    () => (navigating && directions && position ? navProgress(directions.geometry, directions.steps, position) : null),
    [navigating, directions, position],
  );

  // Lệch tuyến quá xa → tìm đường lại từ vị trí hiện tại (tối đa 1 lần / 20 giây).
  useEffect(() => {
    if (!progress || !directions || !position || progress.arrived || progress.offRouteM < OFF_ROUTE_M) return;
    if ((position.accuracy ?? 0) > OFF_ROUTE_M || Date.now() - rerouting.current < 20000) return;
    rerouting.current = Date.now();
    const { binId } = directions;
    const from = { lat: position.lat, lon: position.lon };
    requestDirections(from, binId)
      .then(road => setDirections(d => (d?.binId === binId ? {
        ...d, from, geometry: road.geometry, distance: road.distance, time: road.time, steps: road.steps, estimate: false,
      } : d)))
      .catch(() => {});
  }, [progress, directions, position]);

  const focusBin = useCallback((id: string) => {
    setSelectedId(id);
    setMapRequest({ kind: 'bin', id, nonce: Date.now() });
  }, []);

  return {
    bins, byId, config, loading, error, cachedAt, load,
    collected: local.collected, toggleCollected, setBinStatus,
    position, locate,
    route, buildRoute,
    directions, startDirections, clearDirections,
    navigating, progress, startNavigation, stopNavigation,
    filter, setFilter, query, setQuery,
    selectedId, setSelectedId, focusBin, mapRequest,
    scanBinId, setScanBinId,
  };
}

type BinGo = ReturnType<typeof useBinGoState>;
const Ctx = createContext<BinGo | null>(null);

export function BinGoProvider({ children }: { children: ReactNode }) {
  const value = useBinGoState();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBinGo() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBinGo phải nằm trong BinGoProvider');
  return v;
}
