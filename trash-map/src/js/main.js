// ============================================================
// BINGO - THU GOM RÁC THÔNG MINH (MAIN APPLICATION ENTRY POINT)
// ============================================================

import { state, dom } from "./state/store.js";
import { fetchTrashBins } from "./api/client.js";
import { getMapInstance, fitMapToHanoi } from "./map/map-instance.js";
import { ensureProviderConfig, initializeVietmap } from "./map/vietmap.js";
import {
    createBinMarkers,
    randomizeDemoStatuses,
    refreshBinVisibility
} from "./map/markers.js";
import { updateTruckVisibility } from "./map/trucks.js";
import { updateRouteVisibility } from "./map/routes.js";
import { generateTruckRoutes, loadRoadRoutes } from "./simulation/planner.js";
import {
    startSimulation,
    pauseSimulation,
    resetSimulation,
    updateClock
} from "./simulation/engine.js";
import { updateStats, readyMessage, setRouteControls } from "./ui/stats.js";
import { initializeFilters, setupFilterEvents, setupSpeedButtons } from "./ui/filters.js";
import { renderTruckList } from "./ui/fleet-list.js";
import { selectTruck, updateTimelineUI, setupFocusPanelEvents } from "./ui/focus-panel.js";
import { setupDialogsAndNavigation } from "./ui/dialogs.js";

// Initialize Map Instance
const map = getMapInstance();

// Shared callback pipeline
const callbacks = {
    onBinVisibilityRefresh: () =>
        refreshBinVisibility(map, m => updateRouteVisibility(m), m => updateTruckVisibility(m)),
    onRouteVisibilityRefresh: () => updateRouteVisibility(map),
    onTruckVisibilityRefresh: () => updateTruckVisibility(map),
    onTruckListRender: () => renderTruckList(map, handleSelectTruck),
    onStatsUpdate: () => updateStats(),
    onTimelineUpdate: () => updateTimelineUI(map),
    onReadyMessage: () => {
        if (dom.simulationStatus) dom.simulationStatus.textContent = readyMessage();
    },
    onTruckSelect: (truck, userInitiated) => handleSelectTruck(truck, userInitiated),
    onControlChange: loading => setRouteControls(loading),
    onReady: () => {
        if (dom.simulationStatus) dom.simulationStatus.textContent = readyMessage();
        updateStats();
    }
};

function handleSelectTruck(truck, userInitiated = true) {
    selectTruck(truck, map, userInitiated, callbacks);
}

// Setup simulation control buttons
if (dom.startBtn) {
    dom.startBtn.addEventListener("click", () => startSimulation(map, callbacks));
}
if (dom.pauseBtn) {
    dom.pauseBtn.addEventListener("click", () => pauseSimulation(callbacks));
}
if (dom.resetBtn) {
    dom.resetBtn.addEventListener("click", () => resetSimulation(map, callbacks));
}

// Route loading buttons
if (dom.loadRoutesBtn) {
    dom.loadRoutesBtn.addEventListener("click", () => {
        if (!state.routesLoading) loadRoadRoutes(map, false, callbacks);
    });
}
if (dom.retryRoutesBtn) {
    dom.retryRoutesBtn.addEventListener("click", async () => {
        if (state.routesLoading) return;
        pauseSimulation(callbacks);
        await loadRoadRoutes(map, true, callbacks);
    });
}

// Setup filter events, speed controls, focus panel and dialogs
setupFilterEvents(() => callbacks.onBinVisibilityRefresh());
setupSpeedButtons();
setupFocusPanelEvents(map, callbacks);
setupDialogsAndNavigation(map, callbacks);

// Main bootstrap
async function initialize() {
    await ensureProviderConfig();
    setRouteControls(true);

    try {
        if (dom.simulationStatus) {
            dom.simulationStatus.textContent = "⏳ Đang tải dữ liệu...";
        }

        // 1. Fetch & prepare bins
        state.bins = await fetchTrashBins();
        randomizeDemoStatuses();
        console.log(`Loaded ${state.bins.length} trash bins`);

        // 2. Initialize filter dropdowns & markers
        initializeFilters();
        createBinMarkers(map);
        updateStats();

        // 3. Plan truck assignments (offline TSP)
        generateTruckRoutes();
        renderTruckList(map, handleSelectTruck);
        callbacks.onBinVisibilityRefresh();

        // 4. Initialize Vietmap Vector Tilemap layer
        await initializeVietmap(map, "lm", setRouteControls);
        setRouteControls(false);

        // 5. Fit map & refresh layout
        fitMapToHanoi();
        setTimeout(() => map.invalidateSize(true), 300);

        // 6. Update UI
        updateStats();
        renderTruckList(map, handleSelectTruck);
        updateClock();

        if (dom.simulationStatus) {
            dom.simulationStatus.textContent = readyMessage();
        }

        console.log("====================================");
        console.log("BinGo thu gom rác thông minh sẵn sàng");
        console.log(`Trash bins: ${state.bins.length}`);
        console.log("====================================");
    } catch (error) {
        console.error("Initialization error:", error);
        if (dom.simulationStatus) {
            dom.simulationStatus.textContent = "❌ Không thể khởi tạo mô phỏng";
        }
        alert("Không thể khởi tạo BinGo thu gom rác thông minh.\n\n" + error.message);
    }
}

// Start application
initialize();
