// ============================================================
// API CLIENT
// VITE_API_URL = địa chỉ backend khi host riêng (vd: https://bingo-api.onrender.com).
// Để trống khi chạy local: Vite proxy /api sang http://localhost:3000.
// ============================================================

export const API_BASE_URL = (import.meta.env?.VITE_API_URL || "").replace(/\/+$/, "");

const apiUrl = path => `${API_BASE_URL}${path}`;

// map-config hầu như không đổi → lưu localStorage để reload không phải gọi lại API.
const MAP_CONFIG_CACHE_KEY = "bingo.mapConfig";
const MAP_CONFIG_TTL_MS = 60 * 60 * 1000;

function readCachedMapConfig() {
    try {
        return JSON.parse(localStorage.getItem(MAP_CONFIG_CACHE_KEY) || "null");
    } catch {
        return null;
    }
}

export async function fetchMapConfig() {
    const cached = readCachedMapConfig();
    if (cached?.data?.tilemapKey && Date.now() - cached.at < MAP_CONFIG_TTL_MS) {
        return cached.data;
    }
    try {
        const res = await fetch(apiUrl("/api/map-config"));
        if (res.ok) {
            const data = await res.json();
            if (data?.tilemapKey) {
                try {
                    localStorage.setItem(MAP_CONFIG_CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
                } catch { /* localStorage đầy/bị chặn: bỏ qua */ }
            }
            return data;
        }
    } catch (e) {
        console.warn("Could not fetch /api/map-config", e);
    }
    // Server lỗi/offline: dùng bản cũ còn hơn không có bản đồ.
    return cached?.data ?? null;
}

export async function fetchTrashBins() {
    const res = await fetch(apiUrl("/api/trash-bins"));
    if (!res.ok) {
        throw new Error("Không thể tải /api/trash-bins");
    }
    const data = await res.json();
    return data.map(bin => ({
        ...bin,
        latitude: Number(bin.latitude),
        longitude: Number(bin.longitude),
        demoCollected: false,
        collectedBy: null
    }));
}

export async function requestRoadRoute(binIds, signal) {
    const res = await fetch(apiUrl("/api/road-route"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bin_ids: binIds }),
        signal
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Không tải được tuyến đường.");
    }
    return data;
}

export async function analyzeWasteImageApi(dataUrl, binId, signal) {
    const res = await fetch(apiUrl("/api/analyze-waste-image"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, bin_id: binId || null }),
        signal
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Lỗi khi phân tích ảnh.");
    }
    return data;
}


// ---- Xe thu gom gần bạn (thời gian thực) ----

export async function publishFleetPositions(trucks, signal) {
    const res = await fetch(apiUrl("/api/fleet/positions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trucks }),
        signal
    });
    if (!res.ok) throw new Error("Không gửi được vị trí xe.");
}

export async function fetchNearbyTrucks(lat, lon, radius, signal) {
    const query = new URLSearchParams({ lat, lon, radius });
    const res = await fetch(apiUrl(`/api/fleet/nearby?${query}`), { signal, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Không tải được danh sách xe gần bạn.");
    return data.trucks;
}
