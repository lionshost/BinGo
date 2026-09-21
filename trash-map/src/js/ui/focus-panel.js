// ============================================================
// UI TRUCK FOCUS & TIMELINE DRAWER
// ============================================================

import { state, dom } from "../state/store.js";
import { escapeHtml } from "../utils/dom.js";

export function selectTruck(truck, map, userInitiated = true, callbacks = {}) {
    state.selectedTruckId = truck ? truck.id : null;

    state.truckCards.forEach((item, id) => {
        item.classList.toggle("selected", id === state.selectedTruckId);
    });

    if (truck) {
        if (dom.routeFocusBar) {
            dom.routeFocusBar.hidden = false;
            if (dom.focusBadge) {
                dom.focusBadge.textContent = truck.id;
                dom.focusBadge.style.background = truck.color;
            }
            if (dom.focusTruckTitle) dom.focusTruckTitle.textContent = truck.name;
            if (dom.focusTruckSub) {
                const districtStr = truck.district ? `${truck.district} · ` : "";
                dom.focusTruckSub.textContent = `${districtStr}${truck.assignedBins.length} trạm thu gom`;
            }
        }
        if (dom.timelineDrawer) {
            dom.timelineDrawer.hidden = false;
            if (dom.drawerBadge) {
                dom.drawerBadge.textContent = truck.id;
                dom.drawerBadge.style.background = truck.color;
            }
            if (dom.drawerTruckTitle) dom.drawerTruckTitle.textContent = truck.name;
        }
        updateTimelineUI(map);

        if (userInitiated && truck.route && truck.route.length >= 2 && map && typeof map.fitBounds === "function") {
            try {
                map.fitBounds(L.polyline(truck.route).getBounds(), { padding: [60, 60], maxZoom: 16 });
            } catch (err) {
                console.warn(err);
            }
        }
    } else {
        if (dom.routeFocusBar) dom.routeFocusBar.hidden = true;
        if (dom.timelineDrawer) dom.timelineDrawer.hidden = true;
        state.followSelectedTruck = false;
        if (dom.followTruckBtn) dom.followTruckBtn.classList.remove("active");
    }

    if (callbacks.onBinVisibilityRefresh) callbacks.onBinVisibilityRefresh();
    if (callbacks.onRouteVisibilityRefresh) callbacks.onRouteVisibilityRefresh();
    if (callbacks.onTruckVisibilityRefresh) callbacks.onTruckVisibilityRefresh();
}

export function updateTimelineUI(map) {
    if (!state.selectedTruckId || !dom.timelineDrawer || dom.timelineDrawer.hidden) return;
    const truck = state.trucks.find(t => t.id === state.selectedTruckId);
    if (!truck) return;

    const total = truck.orderedBins.length;
    const collected = truck.collected;
    const percent = total > 0 ? Math.round((collected / total) * 100) : 0;

    if (dom.drawerProgressText) {
        let statusText = `Tiến độ: ${collected}/${total} trạm (${percent}%)`;
        if (truck.dwellRemaining > 0) {
            statusText += ` · 🛑 Đang dừng gom rác`;
        }
        dom.drawerProgressText.textContent = statusText;
    }
    if (dom.drawerProgressBar) {
        dom.drawerProgressBar.style.width = `${percent}%`;
        dom.drawerProgressBar.style.background = truck.color;
    }

    if (!dom.timelineStopsList) return;
    dom.timelineStopsList.innerHTML = "";

    truck.orderedBins.forEach((bin, idx) => {
        const isDone = Boolean(bin.demoCollected);
        const isCurrent = truck.nextStop === idx || (truck.dwellRemaining > 0 && truck.nextStop - 1 === idx);

        const row = document.createElement("div");
        row.className = `timeline-stop-row ${isDone ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`;

        let pillClass = isDone ? "done" : isCurrent ? "active" : "waiting";
        let pillText = isDone ? "Đã thu gom" : isCurrent ? "Xe đang tới" : "Chưa tới";
        if (isCurrent && truck.dwellRemaining > 0) {
            pillText = "Đang gom rác";
        }

        row.innerHTML = `
            <div class="stop-num" style="${isDone ? "" : isCurrent ? "background:" + truck.color : ""}">
                ${isDone ? "✓" : idx + 1}
            </div>
            <div class="stop-details">
                <div class="stop-name">${escapeHtml(bin.name || "Điểm " + bin.id)}</div>
                <div class="stop-sub">📍 ${escapeHtml(bin.address || bin.district || "")}</div>
            </div>
            <span class="stop-status-pill ${pillClass}">${pillText}</span>
        `;

        row.addEventListener("click", () => {
            if (bin.latitude && bin.longitude && map && typeof map.setView === "function") {
                map.setView([bin.latitude, bin.longitude], 17);
                const marker = state.binMarkers.get(bin.id);
                if (marker && typeof marker.openPopup === "function") marker.openPopup();
            }
        });

        dom.timelineStopsList.appendChild(row);
    });
}

export function setupFocusPanelEvents(map, callbacks = {}) {
    if (dom.exitFocusBtn) {
        dom.exitFocusBtn.addEventListener("click", () => selectTruck(null, map, false, callbacks));
    }

    if (dom.toggleTimelineBtn) {
        dom.toggleTimelineBtn.addEventListener("click", () => {
            if (dom.timelineDrawer) dom.timelineDrawer.hidden = !dom.timelineDrawer.hidden;
        });
    }

    if (dom.closeDrawerBtn) {
        dom.closeDrawerBtn.addEventListener("click", () => {
            if (dom.timelineDrawer) dom.timelineDrawer.hidden = true;
        });
    }

    if (dom.followTruckBtn) {
        dom.followTruckBtn.addEventListener("click", () => {
            state.followSelectedTruck = !state.followSelectedTruck;
            dom.followTruckBtn.classList.toggle("active", state.followSelectedTruck);
        });
    }

    if (dom.focusOnlyModeCheckbox) {
        dom.focusOnlyModeCheckbox.addEventListener("change", () => {
            state.focusOnlyMode = dom.focusOnlyModeCheckbox.checked;
            if (callbacks.onBinVisibilityRefresh) callbacks.onBinVisibilityRefresh();
            if (callbacks.onRouteVisibilityRefresh) callbacks.onRouteVisibilityRefresh();
        });
    }
}
