// ============================================================
// TRUCK MARKERS, ICONS & VISUAL STATE
// ============================================================

import { state, dom } from "../state/store.js";
import { escapeHtml } from "../utils/dom.js";

export function createTruckIcon(truck) {
    const bearing = typeof truck.bearing === "number" ? truck.bearing : 0;
    const isSelected = state.selectedTruckId === truck.id;
    const isDwelling = Boolean(truck.dwellRemaining > 0);

    return L.divIcon({
        className: "",
        html: `
            <div class="truck-marker ${isSelected ? 'selected-truck' : ''} ${isDwelling ? 'dwelling' : ''}" id="marker-${truck.id}">
                <div
                    class="truck-rotator"
                    style="
                        border-color:${truck.color};
                        transform: rotate(${bearing}deg);
                    "
                >
                    <span class="truck-heading-arrow" style="border-bottom-color:${truck.color}"></span>
                    <svg class="icon" aria-hidden="true" style="color:${truck.color}"><use href="#i-truck"/></svg>
                </div>
                <span class="truck-tag" style="background:${truck.color}">${truck.id}</span>
            </div>
        `,
        iconSize: [42, 42],
        iconAnchor: [21, 21]
    });
}

export function updateTruckMarkerVisual(truck, marker, map) {
    if (!marker || typeof marker.getElement !== "function") return;
    const el = marker.getElement();
    if (!el) return;
    const rotator = el.querySelector(".truck-rotator");
    if (rotator) {
        rotator.style.transform = `rotate(${truck.bearing || 0}deg)`;
    }
    const container = el.querySelector(".truck-marker");
    if (container) {
        container.classList.toggle("dwelling", Boolean(truck.dwellRemaining > 0));
        container.classList.toggle("selected-truck", state.selectedTruckId === truck.id);
    }
    if (state.selectedTruckId === truck.id && state.followSelectedTruck && map && typeof map.panTo === "function") {
        map.panTo(marker.getLatLng());
    }
}

export function createTruckMarkers(map, onSelectTruck) {
    state.truckMarkers.forEach(marker => {
        if (map.hasLayer(marker)) map.removeLayer(marker);
    });
    state.truckMarkers.length = 0;

    state.trucks.forEach((truck, index) => {
        if (truck.route.length === 0) return;

        const current = truck.route[truck.segment];
        const next = truck.route[truck.segment + 1] || current;
        const first = current.map((value, axis) => value + (next[axis] - value) * truck.progress);

        const marker = L.marker(first, {
            icon: createTruckIcon(truck),
            zIndexOffset: 1000
        });

        marker.truck = truck;

        marker.on("click", () => {
            if (onSelectTruck) onSelectTruck(truck, true);
        });

        marker.bindPopup(`
            <div style="min-width:190px">
                <strong><svg class="icon" aria-hidden="true"><use href="#i-truck"/></svg> ${escapeHtml(truck.name)}</strong>
                <div>Xe thu gom mô phỏng</div>
                <div>Điểm phụ trách: <strong>${truck.assignedBins.length}</strong></div>
                <div>Mã xe: <strong>${escapeHtml(truck.id)}</strong></div>
            </div>
        `);

        marker.addTo(map);
        state.truckMarkers[index] = marker;
    });

    updateTruckVisibility(map);
}

export function updateTruckVisibility(map) {
    const visibleIds = new Set(
        state.bins
            .filter(item => {
                const keyword = dom.searchInput?.value?.trim()?.toLowerCase() || "";
                const district = dom.districtFilter?.value || "";
                const type = dom.typeFilter?.value || "";
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
            })
            .map(item => item.id)
    );

    state.truckMarkers.forEach(marker => {
        if (!marker) return;
        const truck = marker.truck;
        const matchesFilter = truck.assignedBins.some(item => visibleIds.has(item.id));

        if (dom.showTrucks?.checked && matchesFilter) {
            if (!map.hasLayer(marker)) marker.addTo(map);
        } else {
            if (map.hasLayer(marker)) marker.remove();
        }
    });
}
