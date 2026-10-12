// ============================================================
// CONFIGURATION & CONSTANTS
// ============================================================

export const HANOI_CENTER = [21.0285, 105.8542];

export const HANOI_BOUNDS_COORDS = [
    [20.94, 105.72],
    [21.18, 105.97]
];

export const THANH_XUAN_TRUCK_COUNT = 3;
export const GENERAL_TRUCK_COUNT = 50;
export const TRUCK_COUNT = THANH_XUAN_TRUCK_COUNT + GENERAL_TRUCK_COUNT;

export const TRUCK_SPEED_KMH = 30;

export const TRUCK_COLORS = [
    "#16a34a",
    "#2563eb",
    "#9333ea",
    "#dc2626",
    "#ea580c",
    "#0891b2",
    "#4f46e5",
    "#be123c",
    "#0f766e",
    "#a16207"
];

export function createInitialTrucks() {
    return Array.from({ length: TRUCK_COUNT }, (_, truckIndex) => {
        const isThanhXuanTruck = truckIndex < THANH_XUAN_TRUCK_COUNT;
        const number = String(
            isThanhXuanTruck
                ? truckIndex + 1
                : truckIndex - THANH_XUAN_TRUCK_COUNT + 1
        ).padStart(2, "0");

        const prefix = isThanhXuanTruck ? "TX" : "HN";

        return {
            id: `${prefix}-${number}`,
            name: isThanhXuanTruck ? `Xe Thanh Xuân ${number}` : `Xe HN-${number}`,
            district: isThanhXuanTruck ? "Thanh Xuân" : null,
            color: TRUCK_COLORS[truckIndex % TRUCK_COLORS.length],
            route: [],
            assignedBins: [],
            orderedBins: [],
            routeStatus: "pending",
            routeError: "",
            stops: [],
            distanceTravelled: 0,
            totalDistance: 0,
            nextStop: 0,
            bearing: 0,
            dwellRemaining: 0,
            segment: 0,
            progress: 0,
            collected: 0
        };
    });
}
