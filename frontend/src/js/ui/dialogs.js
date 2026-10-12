// ============================================================
// UI DIALOGS, NAVIGATION & SIDEBAR CONTROLS
// ============================================================

import { state, dom } from "../state/store.js";
import { fitMapToHanoi } from "../map/map-instance.js";
import { initializeVietmap } from "../map/vietmap-layer.js";
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

const MOBILE_QUERY = window.matchMedia("(max-width: 768px)");

// On phones the district filter lives in the layer panel so the search bar has room
function setupMobileDistrictFilter() {
    const select = document.getElementById("districtFilter");
    const layerPanel = document.getElementById("layerPanel");
    if (!select || !layerPanel) return;

    const homeParent = select.parentElement;
    const homeNext = select.nextElementSibling;
    const label = document.createElement("label");
    label.htmlFor = "districtFilter";
    label.textContent = "Khu vực";

    const place = (isMobile) => {
        if (isMobile) {
            const anchor = layerPanel.querySelector('label[for="typeFilter"]');
            layerPanel.insertBefore(label, anchor);
            layerPanel.insertBefore(select, anchor);
        } else {
            label.remove();
            homeParent.insertBefore(select, homeNext);
        }
    };

    place(MOBILE_QUERY.matches);
    MOBILE_QUERY.addEventListener("change", (e) => place(e.matches));
}

function setupLegendToggle() {
    const toggle = document.getElementById("legendToggle");
    const legend = document.getElementById("mapLegend");
    if (!toggle || !legend) return;

    toggle.addEventListener("click", () => {
        const open = legend.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
    });
}

export function setupDialogsAndNavigation(map, callbacks = {}) {
    // On phones the sidebar is a bottom sheet over the map, so start it closed
    if (MOBILE_QUERY.matches) {
        setSidebarCollapsed(true, map);
    }
    setupMobileDistrictFilter();
    setupLegendToggle();

    const sheetHandle = document.getElementById("sheetHandle");
    if (sheetHandle) {
        sheetHandle.addEventListener("click", () => setSidebarCollapsed(true, map));
    }

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
