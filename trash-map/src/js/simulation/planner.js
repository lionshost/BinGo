// ============================================================
// ROUTE PLANNING & VIETMAP ROUTING FETCH
// ============================================================

import { state, dom } from "../state/store.js";
import { THANH_XUAN_TRUCK_COUNT, GENERAL_TRUCK_COUNT } from "../config/constants.js";
import { distanceMeters } from "../utils/dom.js";
import { requestRoadRoute } from "../api/client.js";
import RoadRouting from "../road-routing.js";
import { createRoutes } from "../map/routes.js";
import { createTruckMarkers } from "../map/trucks.js";

export function generateTruckRoutes() {
    const validBins = state.bins.filter(
        item => item.status !== "broken" && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
    );

    if (validBins.length === 0) {
        throw new Error("Không có điểm rác hợp lệ để tạo tuyến.");
    }

    const thanhXuanBins = validBins.filter(item => item.district === "Thanh Xuân");
    const generalBins = validBins.filter(item => item.district !== "Thanh Xuân");

    const sortedThanhXuanBins = [...thanhXuanBins].sort((a, b) => a.longitude - b.longitude);
    const sortedGeneralBins = [...generalBins].sort((a, b) => a.longitude - b.longitude);

    const thanhXuanGroups = Array.from({ length: THANH_XUAN_TRUCK_COUNT }, () => []);
    const generalGroups = Array.from({ length: GENERAL_TRUCK_COUNT }, () => []);

    sortedThanhXuanBins.forEach((bin, index) => {
        const groupIndex = Math.min(
            thanhXuanGroups.length - 1,
            Math.floor((index * thanhXuanGroups.length) / sortedThanhXuanBins.length)
        );
        thanhXuanGroups[groupIndex].push(bin);
    });

    sortedGeneralBins.forEach((bin, index) => {
        const groupIndex = Math.min(
            generalGroups.length - 1,
            Math.floor((index * generalGroups.length) / sortedGeneralBins.length)
        );
        generalGroups[groupIndex].push(bin);
    });

    state.trucks.forEach((truck, index) => {
        truck.assignedBins =
            index < THANH_XUAN_TRUCK_COUNT
                ? thanhXuanGroups[index]
                : generalGroups[index - THANH_XUAN_TRUCK_COUNT];

        truck.orderedBins = buildNearestRoute(truck.assignedBins);
        truck.route = [];
        truck.routeStatus = truck.orderedBins.length ? "pending" : "empty";
        truck.segment = 0;
        truck.progress = 0;
        truck.collected = 0;
    });
}

export function buildNearestRoute(group) {
    if (!group || group.length === 0) return [];

    const remaining = [...group];
    remaining.sort((a, b) => {
        const scoreA = a.longitude + a.latitude * 0.15;
        const scoreB = b.longitude + b.latitude * 0.15;
        return scoreA - scoreB;
    });

    let current = remaining.shift();
    const ordered = [current];

    while (remaining.length > 0) {
        let nearestIndex = 0;
        let nearestDistance = Infinity;

        for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i];
            const distance = distanceMeters(
                current.latitude,
                current.longitude,
                candidate.latitude,
                candidate.longitude
            );

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = i;
            }
        }

        current = remaining.splice(nearestIndex, 1)[0];
        ordered.push(current);
    }

    return ordered;
}

export async function loadRoadRoutes(map, onlyFailed = false, callbacks = {}) {
    if (!state.mapReady || !state.providerConfig.routingConfigured || state.running) return;

    if (callbacks.onControlChange) callbacks.onControlChange(true);

    const pending = state.trucks.filter(
        t => t.orderedBins.length && (!onlyFailed || t.routeStatus === "error")
    );

    for (const [index, truck] of pending.entries()) {
        if (!state.mapReady) {
            pending.slice(index).forEach(t => {
                t.routeStatus = "error";
                t.routeError = "Kết nối bản đồ bị gián đoạn. Hãy tải lại tuyến.";
            });
            break;
        }

        if (dom.simulationStatus) {
            dom.simulationStatus.textContent = `Đang tải tuyến VIETMAP ${index + 1}/${pending.length} · ${truck.id}`;
        }
        truck.routeStatus = "loading";

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);

        try {
            const data = await requestRoadRoute(truck.orderedBins.map(b => b.id), controller.signal);
            RoadRouting.prepare(truck, data);

            if (dom.routeUpdated) {
                dom.routeUpdated.textContent = `Tuyến cập nhật ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
            }
            truck.routeStatus = "ready";
            truck.routeError = "";
        } catch (error) {
            truck.route = [];
            truck.stops = [];
            truck.routeStatus = "error";
            truck.routeError =
                error.name === "AbortError"
                    ? "Tìm đường quá lâu. Hãy thử tải lại tuyến."
                    : error.message;
            console.warn(`Route ${truck.id} unavailable:`, error);
        } finally {
            clearTimeout(timeout);
        }

        if (callbacks.onTruckListRender) callbacks.onTruckListRender();
    }

    createRoutes(map);
    createTruckMarkers(map, callbacks.onTruckSelect);

    if (callbacks.onControlChange) callbacks.onControlChange(false);
    if (callbacks.onReady) callbacks.onReady();
    if (callbacks.onTruckListRender) callbacks.onTruckListRender();
}
