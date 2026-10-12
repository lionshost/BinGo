// ============================================================
// SIMULATION MOVEMENT & COLLECTION MODULE
// ============================================================

import { state } from "../state/store.js";
import { TRUCK_SPEED_KMH } from "../config/constants.js";
import RoadRouting from "./road-routing.js";
import { updateBinMarker } from "../map/markers.js";
import { updateTruckMarkerVisual } from "../map/trucks.js";
import { playCollectSound } from "../ui/audio.js";

/**
 * Mark a trash bin as collected and update UI/marker
 */
export function markBinCollected(item, truck) {
    if (!item || item.demoCollected || item.status === "broken") {
        return;
    }

    item.demoCollected = true;
    item.collectedBy = truck.id;
    truck.collected++;

    updateBinMarker(item);
    playCollectSound(item.priority || "medium");
}

/**
 * Advance a truck along its calculated road geometry
 */
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
    if (!movement) return;

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

/**
 * Check if a specific truck has finished its assigned route
 */
export function truckFinished(truck) {
    return (
        truck.routeStatus !== "ready" ||
        (truck.distanceTravelled >= truck.totalDistance && truck.nextStop >= truck.stops.length)
    );
}

/**
 * Check if all active trucks have finished their routes
 */
export function allTrucksFinished() {
    return state.trucks.every(truck => truckFinished(truck));
}
