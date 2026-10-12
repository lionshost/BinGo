// ============================================================
// API CLIENT
// VITE_API_URL = địa chỉ backend khi host riêng (vd: https://bingo-api.onrender.com).
// Để trống khi chạy local: Vite proxy /api sang http://localhost:3000.
// ============================================================

export const API_BASE_URL = (import.meta.env?.VITE_API_URL || "").replace(/\/+$/, "");

const apiUrl = path => `${API_BASE_URL}${path}`;

export async function fetchMapConfig() {
    try {
        const res = await fetch(apiUrl("/api/map-config"));
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.warn("Could not fetch /api/map-config", e);
    }
    return null;
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

