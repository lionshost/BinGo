// ============================================================
// UI FLEET LIST (SIDEBAR TRUCK CARDS)
// ============================================================

import { state, dom } from "../state/store.js";
import { TRUCK_SPEED_KMH } from "../config/constants.js";
import { escapeHtml } from "../utils/dom.js";
import { truckFinished } from "../simulation/engine.js";

export function renderTruckList(map, onTruckSelect) {
    if (!dom.truckList) return;

    state.trucks.forEach(truck => {
        let routeProgress =
            truck.totalDistance > 0
                ? truck.distanceTravelled / truck.totalDistance
                : truck.routeStatus === "ready" && truckFinished(truck)
                ? 1
                : 0;

        routeProgress = Math.min(1, Math.max(0, routeProgress));
        const percent = Math.round(routeProgress * 100);
        const finished = truckFinished(truck);

        let status = "SẴN SÀNG";
        if (truck.routeStatus === "error") {
            status = "LỖI TUYẾN";
        } else if (truck.routeStatus === "empty") {
            status = "KHÔNG CÓ ĐIỂM";
        } else if (truck.routeStatus !== "ready") {
            status = truck.routeStatus === "loading" ? "ĐANG TẢI" : "CHỜ TUYẾN";
        } else if (finished) {
            status = "HOÀN TẤT";
        } else if (state.running) {
            status = "ĐANG CHẠY";
        }

        const displaySpeed = state.running && !finished ? TRUCK_SPEED_KMH : 0;
        const assigned = truck.assignedBins.length;

        let item = state.truckCards.get(truck.id);
        if (!item) {
            item = document.createElement("div");
            state.truckCards.set(truck.id, item);
            item.className = `truck-item ${truck.id === state.selectedTruckId ? "selected" : ""}`;
            item.tabIndex = 0;
            item.setAttribute("role", "button");
            item.setAttribute("aria-label", `Xem ${truck.name} trên bản đồ`);

            const focusTruck = () => {
                if (!state.mapReady || !truck.route.length) {
                    if (dom.simulationStatus) {
                        dom.simulationStatus.textContent = `${truck.name}: chưa có tuyến để xem.`;
                    }
                    return;
                }
                if (onTruckSelect) onTruckSelect(truck, true);

                const marker = state.truckMarkers[state.trucks.indexOf(truck)];
                if (marker && typeof marker.openPopup === "function") marker.openPopup();

                const mapCard = document.querySelector(".map-card");
                if (mapCard && typeof mapCard.scrollIntoView === "function") {
                    mapCard.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            };

            item.addEventListener("click", focusTruck);
            item.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    focusTruck();
                }
            });

            dom.truckList.appendChild(item);
        } else {
            item.classList.toggle("selected", truck.id === state.selectedTruckId);
        }

        item.innerHTML = `
            <div class="truck-head">
                <span>🚛 ${escapeHtml(truck.name)}</span>
                <span style="color:${truck.color}">● ${status}</span>
            </div>
            <div class="truck-meta">
                <span>Đã thu: ${truck.collected} / ${assigned}</span>
                <span>${displaySpeed} km/h</span>
            </div>
            <div class="truck-meta">
                <span>Tiến độ: ${percent}%</span>
                <span>${escapeHtml(truck.id)}</span>
            </div>
            ${truck.routeError ? `<div class="sim-status">${escapeHtml(truck.routeError)}</div>` : ""}
            <div class="progress">
                <div style="width:${percent}%;background:${truck.color}"></div>
            </div>
        `;
    });
}
