// Logic thuần cho thông báo "xe thu gom gần bạn" (dễ kiểm thử, không phụ thuộc React).

export interface NearbyTruck {
  id: string;
  name: string;
  color: string | null;
  lat: number;
  lon: number;
  distance: number; // m
  etaMinutes: number;
}

export const RADII = [300, 500, 1000, 2000] as const;
export const POLL_MS = 3000;

export const fmtDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export const radiusLabel = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);

/** Xe vừa đi vào bán kính kể từ lần hỏi trước. */
export const newlyArrived = (known: ReadonlySet<string>, trucks: readonly NearbyTruck[]) =>
  trucks.filter(t => !known.has(t.id));

export const alertMessage = (t: NearbyTruck) =>
  `${t.name} cách bạn ${fmtDistance(t.distance)} (~${t.etaMinutes} phút). Chuẩn bị rác nhé!`;
