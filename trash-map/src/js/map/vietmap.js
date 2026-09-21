// ============================================================
// VIETMAP VECTOR TILEMAP INTEGRATION
// ============================================================

import { state, dom } from "../state/store.js";
import { fetchMapConfig } from "../api/client.js";

let vietmapLayer = null;

export function showMapState(message) {
    if (dom.map) dom.map.inert = true;
    if (dom.mapPlaceholder) dom.mapPlaceholder.hidden = false;
    if (dom.mapStateText) dom.mapStateText.textContent = message;
    if (dom.providerStatus) dom.providerStatus.textContent = "VIETMAP · Chưa kết nối";
    if (dom.mapCaption) dom.mapCaption.textContent = "Chưa kết nối nguồn bản đồ";
}

export async function ensureProviderConfig() {
    const mapConfigEl = document.getElementById("mapConfig");
    if (mapConfigEl && mapConfigEl.textContent.trim()) {
        try {
            state.providerConfig = JSON.parse(mapConfigEl.textContent);
        } catch (e) {
            console.warn("Failed to parse inline mapConfig, will fetch from /api/map-config", e);
        }
    }

    if (!state.providerConfig.tilemapKey) {
        const data = await fetchMapConfig();
        if (data) {
            state.providerConfig = { ...state.providerConfig, ...data };
        }
    }

    if (state.providerConfig.tilemapKey && typeof window !== "undefined") {
        if (!window.vietmapgl) {
            await new Promise(resolve => {
                const s = document.createElement("script");
                s.src = "https://unpkg.com/@vietmap/vietmap-gl-js@6/dist/vietmap-gl.js";
                s.onload = resolve;
                s.onerror = resolve;
                document.head.appendChild(s);
            });
        }
        if (window.L && !window.L.vietmapGL) {
            await new Promise(resolve => {
                const s = document.createElement("script");
                s.src = "https://unpkg.com/@vietmap/vietmap-gl-leaflet/leaflet-vietmap-gl.js";
                s.onload = resolve;
                s.onerror = resolve;
                document.head.appendChild(s);
            });
        }
    }
}

export async function initializeVietmap(map, style = "lm", onRouteControlsUpdate) {
    state.mapReady = false;
    if (!state.providerConfig.tilemapKey) {
        showMapState("Kết nối tài khoản VIETMAP để mở bản đồ và tìm tuyến đường cho đội xe của bạn.");
        return false;
    }
    if (!L.vietmapGL) {
        showMapState("Chưa tải được thư viện bản đồ VIETMAP. Kiểm tra kết nối mạng rồi tải lại trang.");
        return false;
    }

    if (vietmapLayer && map.hasLayer(vietmapLayer)) {
        map.removeLayer(vietmapLayer);
    }

    try {
        const styleUrl = `https://maps.vietmap.vn/maps/styles/${style}/style.json?apikey=${encodeURIComponent(state.providerConfig.tilemapKey)}`;
        vietmapLayer = L.vietmapGL({
            style: styleUrl,
            tileSize: 512,
            attribution: "© VIETMAP"
        });
        vietmapLayer.addTo(map);

        return await new Promise(resolve => {
            let settled = false;
            const finish = ok => {
                if (settled) return;
                settled = true;
                resolve(ok);
            };

            const gl = vietmapLayer.getVietmapGL();
            if (!gl) {
                showMapState("Không thể khởi tạo WebGL VIETMAP.");
                return finish(false);
            }

            gl.once("load", () => {
                state.mapReady = true;
                if (dom.map) dom.map.inert = false;
                if (dom.mapPlaceholder) dom.mapPlaceholder.hidden = true;
                if (dom.providerStatus) dom.providerStatus.textContent = "VIETMAP · Đã kết nối";
                if (dom.mapCaption) dom.mapCaption.textContent = "Bản đồ VIETMAP";
                finish(true);
            });

            gl.on("error", event => {
                if (!settled || [401, 403, 423].includes(event.error?.status)) {
                    state.mapReady = false;
                    state.running = false;
                    showMapState("Không tải được VIETMAP. Kiểm tra Tilemap key, quyền truy cập và hạn mức.");
                    if (onRouteControlsUpdate) onRouteControlsUpdate(false);
                    finish(false);
                }
            });
        });
    } catch {
        showMapState("Trình duyệt chưa mở được bản đồ VIETMAP. Kiểm tra WebGL và kết nối mạng.");
        return false;
    }
}
