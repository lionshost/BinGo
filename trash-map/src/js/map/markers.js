// ============================================================
// TRASH BIN MARKERS, POPUPS & VISIBILITY
// ============================================================

import { state, dom } from "../state/store.js";
import { escapeHtml } from "../utils/dom.js";

export function getBinStatus(item) {
    if (item.demoCollected) return { key: "collected", label: "Đã thu gom", icon: "✓" };

    const statuses = {
        active: { key: "available", label: "Còn chỗ", icon: "🗑" },
        full: { key: "full", label: "Đầy", icon: "🗑" },
        overloaded: { key: "overloaded", label: "Quá tải", icon: "🗑" },
        broken: { key: "broken", label: "Hỏng", icon: "!" }
    };

    return statuses[item.status] || statuses.active;
}

export function createBinIcon(item) {
    if (state.selectedTruckId) {
        const selTruck = state.trucks.find(t => t.id === state.selectedTruckId);
        if (selTruck) {
            const stopIdx = selTruck.orderedBins.findIndex(b => b.id === item.id);
            if (stopIdx !== -1) {
                const isCollected = Boolean(item.demoCollected);
                const isDwelling = Boolean(selTruck.dwellRemaining > 0 && selTruck.nextStop - 1 === stopIdx);
                return L.divIcon({
                    className: "",
                    html: `<div class="bin-stop-marker ${isCollected ? 'collected' : ''} ${isDwelling ? 'dwelling' : ''}" style="${!isCollected ? 'background:' + selTruck.color : ''}">`
                        + `<span>${isCollected ? '✓' : (stopIdx + 1)}</span>`
                        + `</div>`,
                    iconSize: [26, 26],
                    iconAnchor: [13, 13]
                });
            }
        }
    }

    const status = getBinStatus(item);

    return L.divIcon({
        className: "",
        html: `<div class="bin-icon ${status.key}" title="${escapeHtml(status.label)}">`
            + `<span class="bin-glyph">${status.icon}</span>`
            + `</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

export function popupContent(item) {
    const status = getBinStatus(item);
    const collector = item.collectedBy
        ? `<div>🚛 Xe thu gom: <strong>${escapeHtml(item.collectedBy)}</strong></div>`
        : "";

    return `
        <div style="min-width:220px">
            <strong>${escapeHtml(item.name)}</strong>
            <hr style="border:0;border-top:1px solid #ddd;">
            <div>📍 ${escapeHtml(item.address)}</div>
            <div>🏙️ ${escapeHtml(item.district)}</div>
            <div>🗑️ ${escapeHtml(item.type)}</div>
            <div>${item.recyclable ? "♻️ Có phân loại rác" : "🗑️ Rác thông thường"}</div>
            ${collector}
            <div style="margin-top:7px;font-weight:700;">
                ${status.icon} Hiện trạng: ${escapeHtml(status.label)}
            </div>
        </div>
    `;
}

export function createBinMarkers(map) {
    state.bins.forEach(item => {
        if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) {
            console.warn("Invalid bin coordinate:", item);
            return;
        }

        const marker = L.marker([item.latitude, item.longitude], {
            icon: createBinIcon(item)
        });

        marker.bindPopup(popupContent(item));
        marker.addTo(map);
        state.binMarkers.set(item.id, marker);
    });
}

export function updateBinMarker(item) {
    const marker = state.binMarkers.get(item.id);
    if (!marker) return;

    marker.setIcon(createBinIcon(item));
    marker.setPopupContent(popupContent(item));
}

export function refreshBinVisibility(map, updateRoutesFn, updateTrucksFn) {
    if (state.selectedTruckId && state.focusOnlyMode) {
        const selTruck = state.trucks.find(t => t.id === state.selectedTruckId);
        const assignedSet = new Set((selTruck?.orderedBins || []).map(b => b.id));
        state.bins.forEach(item => {
            const marker = state.binMarkers.get(item.id);
            if (!marker) return;
            if (assignedSet.has(item.id)) {
                if (!map.hasLayer(marker)) marker.addTo(map);
                marker.setIcon(createBinIcon(item));
            } else {
                if (map.hasLayer(marker)) marker.remove();
            }
        });
        if (dom.visibleCount) dom.visibleCount.textContent = assignedSet.size;
        if (updateRoutesFn) updateRoutesFn(map);
        if (updateTrucksFn) updateTrucksFn(map);
        return;
    }

    const keyword = dom.searchInput?.value?.trim()?.toLowerCase() || "";
    const district = dom.districtFilter?.value || "";
    const type = dom.typeFilter?.value || "";

    const visibleItems = state.bins.filter(item => {
        const text = [item.name || "", item.address || "", item.district || "", item.type || ""]
            .join(" ")
            .toLowerCase();

        const keywordMatch = !keyword || text.includes(keyword);
        const districtMatch = !district || item.district === district;
        const typeMatch = !type || item.type === type;

        const statusMatch = state.statusFilter === "all"
            || (state.statusFilter === "collected" && item.demoCollected)
            || (state.statusFilter === "priority" && !item.demoCollected && ["full", "overloaded"].includes(item.status))
            || (state.statusFilter === "broken" && item.status === "broken");

        return statusMatch && keywordMatch && districtMatch && typeMatch;
    });

    const visibleIds = new Set(visibleItems.map(item => item.id));

    state.bins.forEach(item => {
        const marker = state.binMarkers.get(item.id);
        if (!marker) return;

        if (visibleIds.has(item.id)) {
            if (!map.hasLayer(marker)) marker.addTo(map);
            marker.setIcon(createBinIcon(item));
        } else {
            if (map.hasLayer(marker)) marker.remove();
        }
    });

    if (dom.visibleCount) dom.visibleCount.textContent = visibleIds.size;
    if (updateRoutesFn) updateRoutesFn(map);
    if (updateTrucksFn) updateTrucksFn(map);
}

export function randomizeDemoStatuses() {
    const availableBins = state.bins.filter(bin => bin.status === "active");

    for (let index = availableBins.length - 1; index > 0; index--) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [availableBins[index], availableBins[randomIndex]] = [availableBins[randomIndex], availableBins[index]];
    }

    const fullCount = Math.max(1, Math.floor(availableBins.length * 0.12));
    const overloadedCount = Math.max(1, Math.floor(availableBins.length * 0.08));

    availableBins.slice(0, fullCount).forEach(bin => {
        bin.status = "full";
    });

    availableBins.slice(fullCount, fullCount + overloadedCount).forEach(bin => {
        bin.status = "overloaded";
    });
}
