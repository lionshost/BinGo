// ============================================================
// VỊ TRÍ XE THU GOM THỜI GIAN THỰC (lưu trong bộ nhớ)
// Nguồn phát: bảng điều phối web (mô phỏng) hoặc, sau này, GPS thật trên xe.
// Người dùng web/mobile hỏi "xe nào đang ở gần tôi" qua nearbyTrucks().
// Dữ liệu chỉ nằm trong một tiến trình: khởi động lại hoặc chạy nhiều
// instance thì mất/lệch — cần Redis/DB nếu triển khai nhiều worker.
// ============================================================

export const STALE_MS = 30_000;
export const MAX_PUBLISH = 100;
// Trần tổng số xe lưu trong bộ nhớ: chặn kẻ xấu gửi id ngẫu nhiên làm đầy RAM.
export const MAX_TRUCKS = 500;
export const MIN_RADIUS_M = 50;
export const MAX_RADIUS_M = 5_000;
export const DEFAULT_RADIUS_M = 500;
// Tốc độ giả định để ước tính thời gian tới (khớp tốc độ mô phỏng 30 km/h).
export const ETA_SPEED_MS = 30 / 3.6;

const trucks = new Map();

export class FleetError extends Error {}

const validCoord = (lat, lon) =>
    Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

export function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const rad = v => (v * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function pruneStale(now = Date.now()) {
    for (const [id, truck] of trucks) {
        if (now - truck.updatedAt > STALE_MS) trucks.delete(id);
    }
}

/** Ghi vị trí một loạt xe. Trả về số xe hợp lệ được cập nhật. */
export function updatePositions(list, now = Date.now()) {
    if (!Array.isArray(list) || list.length < 1 || list.length > MAX_PUBLISH) {
        throw new FleetError(`Cần từ 1 đến ${MAX_PUBLISH} xe mỗi lần gửi.`);
    }
    const accepted = [];
    for (const item of list) {
        const lat = Number(item?.lat);
        const lon = Number(item?.lon);
        if (typeof item?.id !== 'string' || !item.id || item.id.length > 32 || !validCoord(lat, lon)) {
            throw new FleetError('Dữ liệu vị trí xe không hợp lệ.');
        }
        accepted.push({
            id: item.id,
            name: typeof item.name === 'string' ? item.name.slice(0, 60) : item.id,
            color: typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : null,
            lat,
            lon,
            updatedAt: now
        });
    }
    pruneStale(now);
    const fresh = accepted.filter(truck => !trucks.has(truck.id)).length;
    if (trucks.size + fresh > MAX_TRUCKS) throw new FleetError('Số xe đang theo dõi đã đạt giới hạn.');
    for (const truck of accepted) trucks.set(truck.id, truck);
    return accepted.length;
}

export function activeTruckCount(now = Date.now()) {
    pruneStale(now);
    return trucks.size;
}

/** Xe còn hoạt động trong bán kính, gần nhất trước. */
export function nearbyTrucks(lat, lon, radiusM = DEFAULT_RADIUS_M, now = Date.now()) {
    if (!validCoord(lat, lon)) throw new FleetError('Vị trí không hợp lệ.');
    if (!Number.isFinite(radiusM) || radiusM < MIN_RADIUS_M || radiusM > MAX_RADIUS_M) {
        throw new FleetError(`Bán kính phải từ ${MIN_RADIUS_M} đến ${MAX_RADIUS_M} m.`);
    }
    pruneStale(now);
    const found = [];
    for (const truck of trucks.values()) {
        const distance = distanceMeters(lat, lon, truck.lat, truck.lon);
        if (distance <= radiusM) {
            found.push({
                id: truck.id,
                name: truck.name,
                color: truck.color,
                lat: truck.lat,
                lon: truck.lon,
                distance: Math.round(distance),
                etaMinutes: Math.max(1, Math.round(distance / ETA_SPEED_MS / 60))
            });
        }
    }
    return found.sort((a, b) => a.distance - b.distance);
}

export function clearFleet() {
    trucks.clear();
}
