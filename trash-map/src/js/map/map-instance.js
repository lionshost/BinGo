// ============================================================
// MAP INSTANCE & BOUNDS
// ============================================================

import { HANOI_CENTER, HANOI_BOUNDS_COORDS } from "../config/constants.js";

let mapInstance = null;
let hanoiBounds = null;

export function getMapInstance() {
    if (!mapInstance) {
        hanoiBounds = L.latLngBounds(HANOI_BOUNDS_COORDS[0], HANOI_BOUNDS_COORDS[1]);

        mapInstance = L.map("map", {
            center: HANOI_CENTER,
            zoom: 13,
            minZoom: 12,
            maxZoom: 19,
            maxBounds: hanoiBounds,
            maxBoundsViscosity: 1.0
        });
    }
    return mapInstance;
}

export function fitMapToHanoi() {
    if (mapInstance) {
        mapInstance.setView(HANOI_CENTER, 13);
    }
}
