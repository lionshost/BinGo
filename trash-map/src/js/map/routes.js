// ============================================================
// ROUTE POLYLINES & HIGHLIGHTING
// ============================================================

import { state, dom } from "../state/store.js";

export function createRoutes(map) {
    state.routeLayers.forEach(layer => {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });
    state.routeLayers.length = 0;

    state.trucks.forEach(truck => {
        if (truck.route.length < 2) return;

        const line = L.polyline(truck.route, {
            color: truck.color,
            weight: 4,
            opacity: 0.80,
            smoothFactor: 0,
            dashArray: "10 7",
            lineCap: "round",
            lineJoin: "round"
        });

        line.truck = truck;
        line.addTo(map);
        state.routeLayers.push(line);
    });

    updateRouteVisibility(map);
}

export function updateRouteVisibility(map) {
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

    state.routeLayers.forEach(line => {
        const matchesFilter = line.truck.assignedBins.some(item => visibleIds.has(item.id));

        if (!dom.showRoutes?.checked || !matchesFilter) {
            if (map.hasLayer(line)) line.remove();
            return;
        }

        if (state.selectedTruckId) {
            if (line.truck.id === state.selectedTruckId) {
                if (!map.hasLayer(line)) line.addTo(map);
                if (typeof line.setStyle === "function") {
                    line.setStyle({
                        color: line.truck.color,
                        weight: 6,
                        opacity: 1.0,
                        dashArray: null
                    });
                }
                if (typeof line.bringToFront === "function") line.bringToFront();
            } else {
                if (state.focusOnlyMode) {
                    if (map.hasLayer(line)) line.remove();
                } else {
                    if (!map.hasLayer(line)) line.addTo(map);
                    if (typeof line.setStyle === "function") {
                        line.setStyle({
                            color: line.truck.color,
                            weight: 2,
                            opacity: 0.12,
                            dashArray: "6 6"
                        });
                    }
                }
            }
        } else {
            if (!map.hasLayer(line)) line.addTo(map);
            if (typeof line.setStyle === "function") {
                line.setStyle({
                    color: line.truck.color,
                    weight: 4,
                    opacity: 0.75,
                    dashArray: "10 7"
                });
            }
        }
    });
}
