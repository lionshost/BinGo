// Logic thuần (không phụ thuộc React Native) — có unit test trong tests/.

export type BinStatus = 'active' | 'near_full' | 'full' | 'overloaded' | 'broken';

export interface Bin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  district: string;
  type: string;
  status: BinStatus;
  recyclable: boolean;
  address: string;
  updated: string;
  inspectedAt?: number;
}

export interface Point {
  lat: number;
  lon: number;
}

export type Tone = 'ok' | 'warn' | 'hot' | 'danger' | 'muted';

export const STATUS: Record<BinStatus, { label: string; short: string; color: string; tone: Tone }> = {
  active: { label: 'Còn sức chứa', short: 'Bình thường', color: '#178760', tone: 'ok' },
  near_full: { label: 'Gần đầy', short: 'Gần đầy', color: '#d99a1e', tone: 'warn' },
  full: { label: 'Đầy', short: 'Đầy', color: '#e0672b', tone: 'hot' },
  overloaded: { label: 'Rác tràn ra ngoài', short: 'Tràn', color: '#c9352b', tone: 'danger' },
  broken: { label: 'Đang hỏng', short: 'Hỏng', color: '#8a979a', tone: 'muted' },
};

export const TONE: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: '#e3f3ea', fg: '#116347' },
  warn: { bg: '#fdf3dc', fg: '#8a5d00' },
  hot: { bg: '#fde8dc', fg: '#a2400f' },
  danger: { bg: '#fbe1df', fg: '#9b231b' },
  muted: { bg: '#eceff0', fg: '#556366' },
};

export const PRIORITY: BinStatus[] = ['overloaded', 'full'];

export const HANOI_CENTER: Point = { lat: 21.0285, lon: 105.8542 };
export const inHanoi = (p: Point) => p.lat > 20.85 && p.lat < 21.3 && p.lon > 105.6 && p.lon < 106.05;

export const binPoint = (bin: Bin): Point => ({ lat: bin.latitude, lon: bin.longitude });

/** Bỏ dấu tiếng Việt để tìm "hoan kiem" vẫn ra "Hoàn Kiếm". */
export function normalize(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

/** Khoảng cách Haversine, mét. */
export function distanceM(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return '';
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export const needsPickup = (bin: Bin, collected: Record<string, number>) =>
  PRIORITY.includes(bin.status) && !collected[bin.id];

/**
 * Chọn tối đa `count` điểm cần thu gom theo láng giềng gần nhất từ `start`.
 * Ưu tiên điểm tràn: khoảng cách của chúng được tính giảm 40%.
 */
export function planNearestRoute(bins: Bin[], collected: Record<string, number>, start: Point, count: number): Bin[] {
  const pool = bins.filter(b => needsPickup(b, collected));
  const order: Bin[] = [];
  let cursor = start;
  while (order.length < count && pool.length) {
    let best = 0;
    let bestScore = Infinity;
    pool.forEach((bin, i) => {
      const score = distanceM(cursor, binPoint(bin)) * (bin.status === 'overloaded' ? 0.6 : 1);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    const [next] = pool.splice(best, 1);
    order.push(next);
    cursor = binPoint(next);
  }
  return order;
}

export function pathKm(points: Point[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += distanceM(points[i - 1], points[i]) / 1000;
  return km;
}

export type Filter = 'all' | 'priority' | 'recyclable' | 'broken' | 'collected';

export function matchesFilter(bin: Bin, filter: Filter, query: string, collected: Record<string, number>) {
  const pass =
    filter === 'all' ||
    (filter === 'priority' && needsPickup(bin, collected)) ||
    (filter === 'recyclable' && bin.recyclable) ||
    (filter === 'broken' && bin.status === 'broken') ||
    (filter === 'collected' && Boolean(collected[bin.id]));
  if (!pass) return false;
  if (!query) return true;
  return normalize(`${bin.id} ${bin.name} ${bin.address} ${bin.district} ${bin.type}`).includes(query);
}
