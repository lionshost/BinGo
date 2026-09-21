// ============================================================
// SIMULATION ENGINE (TICK LOOP, MOVEMENT & COLLECTION)
// ============================================================

import { state, dom } from "../state/store.js";
import { TRUCK_SPEED_KMH } from "../config/constants.js";
import RoadRouting from "../road-routing.js";
import { updateBinMarker } from "../map/markers.js";
import { updateTruckMarkerVisual } from "../map/trucks.js";

export function markBinCollected(item, truck) {
    if (!item || item.demoCollected || item.status === "broken") {
        return;
    }

    item.demoCollected = true;
    item.collectedBy = truck.id;
    truck.collected++;

    updateBinMarker(item);
}

export function moveTruck(
    truck,
    marker,
    map,
    meters = (TRUCK_SPEED_KMH / 3.6) * state.speedMultiplier,
    callbacks = {}
) {
    if (!marker || truck.routeStatus !== "ready") return;

    if (truck.dwellRemaining > 0 && meters > 0) {
        truck.dwellRemaining = Math.max(0, truck.dwellRemaining - 0.1 * state.speedMultiplier);
        updateTruckMarkerVisual(truck, marker, map);
        if (state.selectedTruckId === truck.id && callbacks.onTimelineUpdate) {
            callbacks.onTimelineUpdate();
        }
        return;
    }

    const movement = RoadRouting.advance(truck, meters);
    if (movement.position) marker.setLatLng(movement.position);
    updateTruckMarkerVisual(truck, marker, map);

    if (movement.reached && movement.reached.length > 0) {
        movement.reached.forEach(item => markBinCollected(item, truck));
        if (meters > 0 && state.speedMultiplier < 10) {
            truck.dwellRemaining = 1.5;
        }
        if (state.selectedTruckId === truck.id) {
            if (callbacks.onBinVisibilityRefresh) callbacks.onBinVisibilityRefresh();
            if (callbacks.onTimelineUpdate) callbacks.onTimelineUpdate();
        }
    }
}

export function truckFinished(truck) {
    return (
        truck.routeStatus !== "ready" ||
        (truck.distanceTravelled >= truck.totalDistance && truck.nextStop >= truck.stops.length)
    );
}

export function allTrucksFinished() {
    return state.trucks.every(truck => truckFinished(truck));
}

export function updateClock() {
    const totalSeconds = Math.floor(state.simulationSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (dom.mapTime) {
        dom.mapTime.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
}

export function simulationTick(map, callbacks = {}) {
    if (!state.running) return;

    state.trucks.forEach((truck, index) => {
        const marker = state.truckMarkers[index];
        if (!marker || truckFinished(truck)) return;

        moveTruck(truck, marker, map, (TRUCK_SPEED_KMH / 3.6) * state.speedMultiplier, callbacks);
    });

    state.simulationSeconds += state.speedMultiplier;

    if (callbacks.onStatsUpdate) callbacks.onStatsUpdate();
    if (callbacks.onTruckListRender) callbacks.onTruckListRender();
    updateClock();

    if (state.statusFilter !== "all" && callbacks.onBinVisibilityRefresh) {
        callbacks.onBinVisibilityRefresh();
    }

    if (allTrucksFinished()) {
        finishSimulation(callbacks);
    }
}

export function startSimulation(map, callbacks = {}) {
    if (
        state.running ||
        state.routesLoading ||
        !state.mapReady ||
        !state.trucks.some(t => t.routeStatus === "ready")
    ) {
        return;
    }

    // Collect stops at starting point
    state.trucks.forEach((truck, index) => moveTruck(truck, state.truckMarkers[index], map, 0, callbacks));
    if (callbacks.onStatsUpdate) callbacks.onStatsUpdate();

    if (allTrucksFinished()) {
        if (dom.simulationStatus) {
            dom.simulationStatus.textContent = "✅ Các tuyến khả dụng đã hoàn thành. Nhấn Reset để chạy lại.";
        }
        if (callbacks.onTruckListRender) callbacks.onTruckListRender();
        return;
    }

    state.running = true;
    if (dom.simulationStatus) {
        dom.simulationStatus.textContent = `🟢 Đang thu gom - tốc độ ${state.speedMultiplier}×`;
    }
    if (callbacks.onTruckListRender) callbacks.onTruckListRender();

    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(() => simulationTick(map, callbacks), 100);
}

export function pauseSimulation(callbacks = {}) {
    if (state.routesLoading) return;

    state.running = false;
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }

    if (dom.simulationStatus) {
        dom.simulationStatus.textContent = "⏸ Đã tạm dừng";
    }
    if (callbacks.onTruckListRender) callbacks.onTruckListRender();
}

export function finishSimulation(callbacks = {}) {
    state.running = false;
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }

    if (dom.simulationStatus) {
        dom.simulationStatus.textContent = state.trucks.some(t => t.routeStatus === "error")
            ? "⚠️ Đã chạy xong các tuyến khả dụng. Còn tuyến lỗi cần tải lại."
            : "✅ Hoàn thành các tuyến thu gom";
    }

    if (callbacks.onStatsUpdate) callbacks.onStatsUpdate();
    if (callbacks.onTruckListRender) callbacks.onTruckListRender();
}

export function resetSimulation(map, callbacks = {}) {
    if (state.routesLoading) return;

    state.running = false;
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }

    state.simulationSeconds = 0;

    state.bins.forEach(item => {
        item.demoCollected = false;
        item.collectedBy = null;
        updateBinMarker(item);
    });

    state.trucks.forEach(truck => {
        RoadRouting.reset(truck);
        truck.segment = 0;
        truck.progress = 0;
        truck.collected = 0;
        truck.dwellRemaining = 0;
    });

    state.trucks.forEach((truck, index) => {
        const marker = state.truckMarkers[index];
        if (marker && truck.route.length > 0) {
            marker.setLatLng(truck.route[0]);
            updateTruckMarkerVisual(truck, marker, map);
        }
    });

    if (callbacks.onReadyMessage) callbacks.onReadyMessage();
    if (callbacks.onStatsUpdate) callbacks.onStatsUpdate();
    if (callbacks.onTruckListRender) callbacks.onTruckListRender();
    updateClock();
    if (callbacks.onBinVisibilityRefresh) callbacks.onBinVisibilityRefresh();
}
