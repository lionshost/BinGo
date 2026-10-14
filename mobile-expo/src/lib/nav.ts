// DẪN ĐƯỜNG — logic thuần: vị trí GPS so với tuyến (để dễ kiểm thử).
// Không import giá trị từ file khác để test Node chạy trực tiếp được (giống bins.ts).
import type { Point } from './bins';

const rad = (d: number) => (d * Math.PI) / 180;
function distanceM(a: Point, b: Point): number {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export interface NavStep {
  text: string;
  sign: number;
  index: number; // vị trí điểm rẽ trong geometry
}

export interface NavProgress {
  offRouteM: number; // khoảng cách từ GPS tới tuyến
  remainingM: number; // quãng đường còn lại theo tuyến
  nextStep: NavStep | null; // bước rẽ sắp tới (null = sắp tới đích)
  toNextM: number; // quãng đường tới bước rẽ sắp tới (hoặc tới đích)
  arrived: boolean;
}

export const ARRIVE_M = 25;
export const OFF_ROUTE_M = 50;

/** Chiếu điểm p lên đoạn a→b (xấp xỉ phẳng — đủ chính xác ở cự ly đô thị). Trả về tỉ lệ t ∈ [0,1]. */
function project(p: Point, a: Point, b: Point): number {
  const k = Math.cos((a.lat * Math.PI) / 180);
  const ax = a.lon * k, ay = a.lat, bx = b.lon * k, by = b.lat, px = p.lon * k, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (!len2) return 0;
  return Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
}

/** geometry: [lat, lon][] như API trả về. */
export function navProgress(geometry: [number, number][], steps: NavStep[], pos: Point): NavProgress {
  const pts = geometry.map(([lat, lon]) => ({ lat, lon }));
  const dest = pts[pts.length - 1];
  if (pts.length < 2) {
    const d = dest ? distanceM(pos, dest) : 0;
    return { offRouteM: d, remainingM: d, nextStep: null, toNextM: d, arrived: d < ARRIVE_M };
  }

  // Đoạn gần GPS nhất.
  let seg = 0, best = Infinity, bestProj = pts[0];
  for (let i = 0; i < pts.length - 1; i++) {
    const t = project(pos, pts[i], pts[i + 1]);
    const q = { lat: pts[i].lat + (pts[i + 1].lat - pts[i].lat) * t, lon: pts[i].lon + (pts[i + 1].lon - pts[i].lon) * t };
    const d = distanceM(pos, q);
    if (d < best) { best = d; seg = i; bestProj = q; }
  }

  // Quãng đường cộng dồn từ điểm chiếu tới đỉnh j (j > seg).
  const along = (j: number) => {
    let sum = distanceM(bestProj, pts[seg + 1]);
    for (let i = seg + 1; i < j; i++) sum += distanceM(pts[i], pts[i + 1]);
    return sum;
  };

  const remainingM = along(pts.length - 1);
  // Bước rẽ đầu tiên nằm phía trước vị trí hiện tại (bỏ bước "bắt đầu" ở index 0 và bước "đến nơi").
  const nextStep = steps.find(s => s.index > seg && s.sign !== 4 && s.sign !== 5) ?? null;
  const toNextM = nextStep ? along(nextStep.index) : remainingM;
  const arrived = remainingM < ARRIVE_M || distanceM(pos, dest) < ARRIVE_M;

  return { offRouteM: best, remainingM, nextStep, toNextM, arrived };
}
