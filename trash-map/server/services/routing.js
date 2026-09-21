// ============================================================
// VIETMAP ROUTE V4 SERVICE (NODE.JS)
// Road geometry and stop snapping with Polyline5 decoding
// ============================================================

export const MAX_STOPS = 100;
export const MAX_SNAP_METERS = 300;

let lastRequestTime = 0;

export class RoutingError extends Error {
    constructor(message) {
        super(message);
        this.name = "RoutingError";
    }
}

export function decodePolyline(encoded) {
    if (typeof encoded !== "string" || !encoded || encoded.length > 2000000) {
        throw new RoutingError("VIETMAP chưa trả về hình học tuyến đường hợp lệ.");
    }
    let index = 0;
    let latitude = 0;
    let longitude = 0;
    const result = [];

    while (index < encoded.length) {
        const deltas = [];
        for (let i = 0; i < 2; i++) {
            let number = 0;
            let shift = 0;
            while (true) {
                if (index >= encoded.length || shift > 30) {
                    throw new RoutingError("Hình học tuyến VIETMAP bị thiếu hoặc lỗi.");
                }
                const byte = encoded.charCodeAt(index++) - 63;
                if (byte < 0 || byte > 63) {
                    throw new RoutingError("Hình học tuyến VIETMAP không hợp lệ.");
                }
                number |= (byte & 31) << shift;
                shift += 5;
                if (byte < 32) break;
            }
            deltas.push(number & 1 ? ~(number >> 1) : number >> 1);
        }
        latitude += deltas[0];
        longitude += deltas[1];
        const point = [latitude / 1e5, longitude / 1e5];
        if (Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) {
            throw new RoutingError("Tọa độ tuyến đường không hợp lệ.");
        }
        result.push(point);
    }
    return result;
}

export function distance(a, b) {
    const radians = Math.PI / 180;
    const h =
        Math.sin(((b[0] - a[0]) * radians) / 2) ** 2 +
        Math.cos(a[0] * radians) *
            Math.cos(b[0] * radians) *
            Math.sin(((b[1] - a[1]) * radians) / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function convert(payload, bins, vehicle) {
    const paths = payload?.paths;
    if (!Array.isArray(paths) || paths.length === 0 || typeof paths[0] !== "object") {
        throw new RoutingError("VIETMAP không tìm được tuyến đường phù hợp.");
    }
    const path = paths[0];
    const geometry = decodePolyline(path.points);
    const snapped = decodePolyline(path.snapped_waypoints);

    if (snapped.length !== bins.length) {
        throw new RoutingError("VIETMAP trả thiếu điểm dừng trên đường.");
    }

    const viaHints = [];
    const instructions = path.instructions || [];
    if (!Array.isArray(instructions)) {
        throw new RoutingError("Thiếu hướng dẫn tuyến VIETMAP.");
    }

    for (const instruction of instructions) {
        if (!instruction || typeof instruction !== "object") {
            throw new RoutingError("Hướng dẫn tuyến VIETMAP không hợp lệ.");
        }
        if (instruction.sign === 5) {
            const interval = instruction.interval;
            if (!Array.isArray(interval) || interval.length !== 2) {
                throw new RoutingError("Thiếu chỉ số điểm dừng VIETMAP.");
            }
            if (typeof interval[0] !== "number" || !Number.isInteger(interval[0])) {
                throw new RoutingError("Chỉ số điểm dừng VIETMAP không hợp lệ.");
            }
            viaHints.push(interval[0]);
        }
    }

    if (viaHints.length !== bins.length - 2) {
        throw new RoutingError("Thiếu hướng dẫn ghé điểm trung gian; chưa thể xác định điểm thu gom.");
    }

    const indices = [0];
    let previous = 0;
    for (let i = 0; i < viaHints.length; i++) {
        const location = snapped[i + 1];
        const hint = viaHints[i];
        let bestIndex = Math.max(previous, hint);
        let bestDist = Infinity;

        for (let candidate = bestIndex; candidate < geometry.length; candidate++) {
            const d = distance(location, geometry[candidate]);
            if (d < bestDist) {
                bestDist = d;
                bestIndex = candidate;
            }
        }
        indices.push(bestIndex);
        previous = bestIndex;
    }
    indices.push(geometry.length - 1);

    if (indices.length !== bins.length) {
        throw new RoutingError("Thiếu hướng dẫn ghé điểm trung gian; chưa thể xác định điểm thu gom.");
    }

    const stops = [];
    let prevIndex = -1;
    for (let i = 0; i < bins.length; i++) {
        const item = bins[i];
        const location = snapped[i];
        const index = indices[i];

        if (typeof index !== "number" || index < prevIndex || index >= geometry.length) {
            throw new RoutingError("Thứ tự điểm dừng VIETMAP không hợp lệ.");
        }
        if (distance(location, geometry[index]) > 2) {
            throw new RoutingError("Điểm dừng không khớp hình học tuyến VIETMAP.");
        }
        const snapDist = distance([item.latitude, item.longitude], location);
        if (snapDist > MAX_SNAP_METERS) {
            throw new RoutingError(`Điểm ${item.id} cách đường ô tô hơn 300 m; cần kiểm tra tọa độ mẫu.`);
        }
        stops.push({
            bin_id: item.id,
            route_index: index,
            snap_distance: Math.round(snapDist * 10) / 10
        });
        prevIndex = index;
    }

    return {
        geometry,
        stops,
        source: "VIETMAP Route v4",
        profile: vehicle,
        fetched_at: new Date().toISOString()
    };
}

async function fetchWithThrottle(url, timeoutMs = 15000) {
    const now = performance.now();
    const delay = 250 - (now - lastRequestTime);
    if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    lastRequestTime = performance.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, {
            headers: { "User-Agent": "BinGo/2.0", Accept: "application/json" },
            signal: controller.signal
        });

        if (!res.ok) {
            if ([401, 403, 423].includes(res.status)) {
                throw new RoutingError("Kiểm tra Services key, quyền Route v4 và hạn mức VIETMAP.");
            }
            if (res.status === 429) {
                throw new RoutingError("VIETMAP đang giới hạn lượt gọi. Hãy thử lại sau.");
            }
            throw new RoutingError("VIETMAP chưa xử lý được yêu cầu tìm đường.");
        }

        const payload = await res.json();
        if (!payload || payload.code !== "OK") {
            const messages = {
                OVER_DAILY_LIMIT: "Đã hết hạn mức Route v4 của VIETMAP.",
                MAX_POINTS_EXCEED: "Tuyến vượt số điểm của gói VIETMAP. Cần điều chỉnh gói hoặc chia tuyến.",
                ZERO_RESULTS: "VIETMAP không tìm được đường nối các điểm này."
            };
            throw new RoutingError(messages[payload?.code] || "VIETMAP từ chối tuyến; hãy kiểm tra cấu hình và điểm thu gom.");
        }
        return payload;
    } catch (err) {
        if (err instanceof RoutingError) throw err;
        throw new RoutingError("Không kết nối được VIETMAP. Hãy thử tải lại tuyến.");
    } finally {
        clearTimeout(timer);
    }
}

export async function roadRoute(bins, settings) {
    if (!settings?.servicesKey) {
        throw new RoutingError("Chưa cấu hình VIETMAP Services key trên máy chủ.");
    }
    const vehicle = settings.vehicle || "car";
    if (!["car", "truck"].includes(vehicle)) {
        throw new RoutingError("Cấu hình VIETMAP_VEHICLE phải là car hoặc truck.");
    }

    const params = new URLSearchParams();
    params.set("apikey", settings.servicesKey);
    params.set("vehicle", vehicle);
    params.set("points_encoded", "true");
    params.set("optimize", "false");
    params.set("alternative", "false");

    if (vehicle === "truck") {
        if (!/^\d+$/.test(settings.capacity) || parseInt(settings.capacity, 10) <= 0) {
            throw new RoutingError("Chế độ xe tải cần khối lượng toàn bộ xe (kg) trong cấu hình VIETMAP.");
        }
        params.set("capacity", settings.capacity);
    }

    const requested = bins.length > 1 ? bins : [bins[0], bins[0]];
    for (const item of requested) {
        params.append("point", `${item.latitude.toFixed(6)},${item.longitude.toFixed(6)}`);
    }

    const url = `https://maps.vietmap.vn/api/route/v4?${params.toString()}`;
    const payload = await fetchWithThrottle(url);
    const result = convert(payload, requested, vehicle);

    if (bins.length === 1) {
        result.geometry = result.geometry.slice(0, 1);
        result.stops = result.stops.slice(0, 1);
    }
    return result;
}
