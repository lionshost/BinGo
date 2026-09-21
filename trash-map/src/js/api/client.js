// ============================================================
// API CLIENT
// ============================================================

export async function fetchMapConfig() {
    try {
        const res = await fetch("/api/map-config");
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.warn("Could not fetch /api/map-config", e);
    }
    return null;
}

export async function fetchTrashBins() {
    const res = await fetch("/api/trash-bins");
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
    const res = await fetch("/api/road-route", {
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
