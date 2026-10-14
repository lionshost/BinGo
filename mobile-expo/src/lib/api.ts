// API CLIENT — cùng backend Express với bản web. App native không bị CORS.
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Bin } from './bins';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');
const CACHE_KEY = 'bingo.bins';

export interface MapConfig {
  tilemapKey?: string;
  routingConfigured?: boolean;
  geminiConfigured?: boolean;
}

export interface RoadRoute {
  geometry: [number, number][]; // [lat, lon]
  source: string;
}

export interface WasteAnalysis {
  image_usable: boolean;
  fill_label: string;
  fill_action: string;
  fill_percent_estimate: number | null;
  fill_confidence: number;
  overflow_detected: boolean;
  suggested_status: Bin['status'] | null;
  needs_manual_review: boolean;
  review_reasons: string[];
  waste_items: { name: string; group: string; confidence: number }[];
  guidance: { key: string; label: string; icon: string; color: string; guidance: string; detected: boolean }[];
  scene_summary: string;
}

async function request<T>(path: string, { body, timeout = 45000 }: { body?: unknown; timeout?: number } = {}): Promise<T> {
  if (!API_BASE_URL) throw new Error('Chưa cấu hình EXPO_PUBLIC_API_URL.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Máy chủ trả lỗi ${res.status}.`);
    return data as T;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Máy chủ phản hồi quá lâu (gói miễn phí có thể đang khởi động lại). Thử lại sau ít giây.');
    }
    if (err instanceof TypeError) throw new Error('Không kết nối được máy chủ. Kiểm tra mạng.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const CONFIG_KEY = 'bingo.mapConfig';

/** Cấu hình bản đồ (Tilemap key VIETMAP); lưu lại để lần mở sau dùng ngay. Lỗi → null. */
export async function fetchMapConfig(): Promise<MapConfig | null> {
  try {
    const data = await request<MapConfig>('/api/map-config', { timeout: 70000 });
    AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(data)).catch(() => {});
    return data;
  } catch {
    return null;
  }
}

export const loadCachedMapConfig = async (): Promise<MapConfig | null> =>
  JSON.parse((await AsyncStorage.getItem(CONFIG_KEY).catch(() => null)) || 'null');

/** Danh sách điểm thu gom; mất mạng thì dùng bản lưu gần nhất. */
export async function fetchBins(): Promise<{ bins: Bin[]; cachedAt: number | null }> {
  try {
    const data = await request<any[]>('/api/trash-bins', { timeout: 70000 });
    const bins: Bin[] = data.map(b => ({ ...b, latitude: Number(b.latitude), longitude: Number(b.longitude) }));
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), bins })).catch(() => {});
    return { bins, cachedAt: null };
  } catch (err) {
    const cached = JSON.parse((await AsyncStorage.getItem(CACHE_KEY).catch(() => null)) || 'null');
    if (cached?.bins?.length) return { bins: cached.bins, cachedAt: cached.at };
    throw err;
  }
}

export const requestRoadRoute = (binIds: string[]) => request<RoadRoute>('/api/road-route', { body: { bin_ids: binIds } });

export interface DirectionStep {
  text: string;
  distance: number; // m
  time: number; // giây
  sign: number; // mã rẽ GraphHopper: -2 trái, 2 phải, 4 đến nơi…
  index: number; // vị trí điểm rẽ trong geometry
}

export interface RoadDirections {
  geometry: [number, number][]; // [lat, lon]
  distance: number; // m
  time: number; // giây
  steps: DirectionStep[];
  source: string;
}

export const requestDirections = (from: { lat: number; lon: number }, binId: string) =>
  request<RoadDirections>('/api/directions', { body: { from: { lat: from.lat, lon: from.lon }, to_bin_id: binId } });

export const analyzeImage =(dataUrl: string, binId: string | null) =>
  request<WasteAnalysis>('/api/analyze-waste-image', { body: { image: dataUrl, bin_id: binId }, timeout: 60000 });
