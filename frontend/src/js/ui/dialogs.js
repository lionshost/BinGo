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

function setupLegendToggle() {
    const toggle = document.getElementById("legendToggle");
    const legend = document.getElementById("mapLegend");
    if (!toggle || !legend) return;

    toggle.addEventListener("click", () => {
        const open = legend.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
    });
}

/**
 * Vuốt xuống để đóng bottom sheet (kiểu app iOS).
 * - `grab`: vùng luôn kéo được (thanh gạt, tiêu đề).
 * - `scroller`: vùng nội dung cuộn; chỉ kéo sheet xuống khi nội dung đã ở đầu, còn lại là cuộn bình thường.
 * Sheet bám theo ngón tay, thả ra quá 80px (hoặc vuốt nhanh) thì đóng, không thì bật lại.
 */
function makeSwipeDismissible(sheet, { grab, scroller, onDismiss }) {
    if (!sheet) return;
    const DISMISS_PX = 80;
    const FLICK_PX_PER_MS = 0.5;
    let startY = 0;
    let startAt = 0;
    let dy = 0;
    let mode = "idle"; // idle → pending (chờ biết là cuộn hay kéo) → dragging | scrolling

    const canDrag = target => {
        if (!MOBILE_QUERY.matches) return false;
        if (grab && grab.contains(target)) return true;
        return scroller && scroller.contains(target) && scroller.scrollTop <= 0;
    };

    sheet.addEventListener("touchstart", event => {
        if (event.touches.length !== 1 || !canDrag(event.target)) {
            mode = "scrolling";
            return;
        }
        mode = "pending";
        startY = event.touches[0].clientY;
        startAt = Date.now();
        dy = 0;
    }, { passive: true });

    sheet.addEventListener("touchmove", event => {
        if (mode === "idle" || mode === "scrolling") return;
        const delta = event.touches[0].clientY - startY;
        if (mode === "pending") {
            if (delta < -4) { mode = "scrolling"; return; } // vuốt lên = cuộn nội dung
            if (delta < 6) return;
            mode = "dragging";
            sheet.style.transition = "none";
        }
        dy = Math.max(0, delta);
        sheet.style.transform = `translateY(${dy}px)`;
        event.preventDefault(); // chặn trang/iOS cuộn theo khi đang kéo sheet
    }, { passive: false });

    const finish = () => {
        const wasDragging = mode === "dragging";
        mode = "idle";
        if (!wasDragging) return;
        const velocity = dy / Math.max(1, Date.now() - startAt);
        sheet.style.transition = "";
        sheet.style.transform = "";
        if (dy > DISMISS_PX || (dy > 30 && velocity > FLICK_PX_PER_MS)) onDismiss();
    };
    sheet.addEventListener("touchend", finish);
    sheet.addEventListener("touchcancel", finish);
}

function setupSheetGestures(map) {
    // Bảng điều khiển: kéo thanh gạt hoặc kéo xuống khi đang ở đầu danh sách
    makeSwipeDismissible(dom.sidebarDock, {
        grab: document.getElementById("sheetHandle"),
        scroller: dom.sidebarDock,
        onDismiss: () => setSidebarCollapsed(true, map)
    });

    // Lộ trình xe: kéo tiêu đề hoặc kéo xuống khi danh sách trạm ở đầu
    makeSwipeDismissible(dom.timelineDrawer, {
        grab: dom.timelineDrawer?.querySelector(".timeline-drawer-header"),
        scroller: dom.timelineDrawer?.querySelector(".timeline-stops-container"),
        onDismiss: () => dom.closeDrawerBtn?.click()
    });

    // Nút "Mở bảng điều khiển": vuốt lên để mở bảng
    const trigger = dom.floatingSidebarTrigger;
    if (trigger) {
        let startY = null;
        trigger.addEventListener("touchstart", e => { startY = e.touches[0].clientY; }, { passive: true });
        trigger.addEventListener("touchend", e => {
            if (startY !== null && startY - e.changedTouches[0].clientY > 24) {
                e.preventDefault(); // không kích hoạt thêm click
                setSidebarCollapsed(false, map);
            }
            startY = null;
        });
    }
}

export function setupDialogsAndNavigation(map, callbacks = {}) {
    // On phones the sidebar is a bottom sheet over the map, so start it closed
    if (MOBILE_QUERY.matches) {
        setSidebarCollapsed(true, map);
    }
    setupLegendToggle();
    setupSheetGestures(map);

    const sheetHandle = document.getElementById("sheetHandle");
    if (sheetHandle) {
        sheetHandle.addEventListener("click", () => setSidebarCollapsed(true, map));
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
