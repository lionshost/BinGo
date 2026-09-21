// ============================================================
// UI DIALOGS, NAVIGATION & SIDEBAR CONTROLS
// ============================================================

import { state, dom } from "../state/store.js";
import { fitMapToHanoi } from "../map/map-instance.js";
import { initializeVietmap } from "../map/vietmap.js";
import { readyMessage, setRouteControls } from "./stats.js";
import { pauseSimulation } from "../simulation/engine.js";

export function setSidebarCollapsed(collapsed, map) {
    if (!dom.sidebarDock) return;
    dom.sidebarDock.classList.toggle("collapsed", collapsed);
    if (dom.floatingSidebarTrigger) {
        dom.floatingSidebarTrigger.hidden = !collapsed;
    }
    setTimeout(() => { if (map) map.invalidateSize(); }, 120);
    setTimeout(() => { if (map) map.invalidateSize(); }, 360);
}

export function setupDialogsAndNavigation(map, callbacks = {}) {
    // Setup modal
    const setupDialog = dom.setupDialog;
    if (setupDialog) {
        ["helpBtn", "connectMapBtn"].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener("click", () => setupDialog.showModal());
        });

        if (dom.closeSetupBtn) {
            dom.closeSetupBtn.addEventListener("click", () => setupDialog.close());
        }

        setupDialog.addEventListener("click", event => {
            if (event.target === setupDialog) {
                const bounds = setupDialog.getBoundingClientRect();
                if (
                    event.clientX < bounds.left ||
                    event.clientX > bounds.right ||
                    event.clientY < bounds.top ||
                    event.clientY > bounds.bottom
                ) {
                    setupDialog.close();
                }
            }
        });
    }

    // Tabs navigation
    const fleetTab = document.getElementById("fleetTab");
    if (fleetTab) {
        fleetTab.addEventListener("click", () => {
            const panel = document.getElementById("fleetPanel");
            if (panel) {
                panel.scrollIntoView({ behavior: "smooth", block: "start" });
                panel.focus({ preventScroll: true });
            }
        });
    }

    const mapTab = document.getElementById("mapTab");
    if (mapTab) {
        mapTab.addEventListener("click", () => {
            const mapCard = document.querySelector(".map-card");
            if (mapCard) mapCard.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    // Center map
    const centerMapBtn = document.getElementById("centerMapBtn");
    if (centerMapBtn) {
        centerMapBtn.addEventListener("click", fitMapToHanoi);
    }

    // Layers toggle panel
    const layerBtn = document.getElementById("layerBtn");
    const layerPanel = document.getElementById("layerPanel");
    if (layerBtn && layerPanel) {
        layerBtn.addEventListener("click", event => {
            layerPanel.hidden = !layerPanel.hidden;
            event.currentTarget.setAttribute("aria-expanded", String(!layerPanel.hidden));
        });
    }

    // Map style selector
    const mapStyleSelect = document.getElementById("mapStyle");
    if (mapStyleSelect) {
        mapStyleSelect.addEventListener("change", async event => {
            if (!state.providerConfig.tilemapKey || state.routesLoading) return;
            pauseSimulation(callbacks);
            setRouteControls(true);
            await initializeVietmap(map, event.target.value, setRouteControls);
            setRouteControls(false);
            if (dom.simulationStatus) dom.simulationStatus.textContent = readyMessage();
        });
    }

    // Layer checkboxes
    if (dom.showRoutes) {
        dom.showRoutes.addEventListener("change", () => {
            if (callbacks.onRouteVisibilityRefresh) callbacks.onRouteVisibilityRefresh();
        });
    }

    if (dom.showTrucks) {
        dom.showTrucks.addEventListener("change", () => {
            if (callbacks.onTruckVisibilityRefresh) callbacks.onTruckVisibilityRefresh();
        });
    }

    // Truck list accordion
    let truckListCollapsed = false;
    if (dom.toggleTruckList && dom.truckList) {
        dom.toggleTruckList.addEventListener("click", () => {
            truckListCollapsed = !truckListCollapsed;
            dom.truckList.hidden = truckListCollapsed;
            dom.toggleTruckList.textContent = truckListCollapsed ? "Mở rộng" : "Thu gọn";
            dom.toggleTruckList.setAttribute("aria-expanded", String(!truckListCollapsed));
        });
    }

    // Sidebar dock collapse
    if (dom.toggleSidebarBtn) {
        dom.toggleSidebarBtn.addEventListener("click", () => {
            const isCollapsed = dom.sidebarDock && dom.sidebarDock.classList.contains("collapsed");
            setSidebarCollapsed(!isCollapsed, map);
        });
    }

    if (dom.floatingSidebarTrigger) {
        dom.floatingSidebarTrigger.addEventListener("click", () => {
            setSidebarCollapsed(false, map);
        });
    }
}
