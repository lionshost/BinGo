// ============================================================
// PHÁT VỊ TRÍ XE LÊN MÁY CHỦ
// Bảng điều phối mô phỏng đẩy vị trí xe mỗi giây để web/mobile của người dân
// biết xe nào đang ở gần. Chỉ phát khi mô phỏng đang chạy.
// ============================================================

import { state } from "../state/store.js";
import { publishFleetPositions } from "../api/client.js";

const PUBLISH_MS = 1000;
let timer = null;
let inFlight = false;

function snapshot() {
    return state.truckMarkers
        .filter(marker => marker && marker.truck)
        .map(marker => {
            const { lat, lng } = marker.getLatLng();
            const { id, name, color } = marker.truck;
            return { id, name, color, lat, lon: lng };
        });
}

async function publishOnce() {
    if (inFlight || !state.running) return;
    const trucks = snapshot();
    if (!trucks.length) return;
    inFlight = true;
    try {
        await publishFleetPositions(trucks);
    } catch {
        // Mất mạng/máy chủ ngủ: bỏ lượt này, lượt sau gửi lại vị trí mới nhất.
    } finally {
        inFlight = false;
    }
}

export function startFleetPublisher() {
    if (!timer) timer = setInterval(publishOnce, PUBLISH_MS);
}
