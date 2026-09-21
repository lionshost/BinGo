// ============================================================
// CENTRAL APPLICATION STATE STORE
// ============================================================

import { createInitialTrucks } from "../config/constants.js";

export const state = {
    bins: [],
    trucks: createInitialTrucks(),
    binMarkers: new Map(),
    truckMarkers: [],
    routeLayers: [],
    truckCards: new Map(),
    providerConfig: {
        provider: "vietmap",
        tilemapKey: "",
        routingConfigured: false,
        vehicle: "car"
    },
    mapReady: false,
    running: false,
    routesLoading: true,
    timer: null,
    simulationSeconds: 0,
    speedMultiplier: 1,
    selectedTruckId: null,
    followSelectedTruck: false,
    focusOnlyMode: true,
    statusFilter: "all"
};

// Cached DOM element accessors
export const dom = {
    get map() { return document.getElementById("map"); },
    get mapPlaceholder() { return document.getElementById("mapPlaceholder"); },
    get mapStateText() { return document.getElementById("mapStateText"); },
    get providerStatus() { return document.getElementById("providerStatus"); },
    get mapCaption() { return document.getElementById("mapCaption"); },
    get startBtn() { return document.getElementById("startBtn"); },
    get pauseBtn() { return document.getElementById("pauseBtn"); },
    get resetBtn() { return document.getElementById("resetBtn"); },
    get simulationStatus() { return document.getElementById("simulationStatus"); },
    get mapTime() { return document.getElementById("mapTime"); },
    get totalCount() { return document.getElementById("totalCount"); },
    get collectedCount() { return document.getElementById("collectedCount"); },
    get waitingCount() { return document.getElementById("waitingCount"); },
    get truckCount() { return document.getElementById("truckCount"); },
    get searchInput() { return document.getElementById("searchInput"); },
    get districtFilter() { return document.getElementById("districtFilter"); },
    get typeFilter() { return document.getElementById("typeFilter"); },
    get showRoutes() { return document.getElementById("showRoutes"); },
    get showTrucks() { return document.getElementById("showTrucks"); },
    get truckList() { return document.getElementById("truckList"); },
    get toggleTruckList() { return document.getElementById("toggleTruckList"); },
    get loadRoutesBtn() { return document.getElementById("loadRoutesBtn"); },
    get retryRoutesBtn() { return document.getElementById("retryRoutesBtn"); },
    get routeFocusBar() { return document.getElementById("routeFocusBar"); },
    get focusBadge() { return document.getElementById("focusBadge"); },
    get focusTruckTitle() { return document.getElementById("focusTruckTitle"); },
    get focusTruckSub() { return document.getElementById("focusTruckSub"); },
    get toggleTimelineBtn() { return document.getElementById("toggleTimelineBtn"); },
    get followTruckBtn() { return document.getElementById("followTruckBtn"); },
    get exitFocusBtn() { return document.getElementById("exitFocusBtn"); },
    get timelineDrawer() { return document.getElementById("timelineDrawer"); },
    get drawerBadge() { return document.getElementById("drawerBadge"); },
    get drawerTruckTitle() { return document.getElementById("drawerTruckTitle"); },
    get drawerProgressText() { return document.getElementById("drawerProgressText"); },
    get drawerProgressBar() { return document.getElementById("drawerProgressBar"); },
    get timelineStopsList() { return document.getElementById("timelineStopsList"); },
    get closeDrawerBtn() { return document.getElementById("closeDrawerBtn"); },
    get focusOnlyModeCheckbox() { return document.getElementById("focusOnlyMode"); },
    get visibleCount() { return document.getElementById("visibleCount"); },
    get setupDialog() { return document.getElementById("setupDialog"); },
    get closeSetupBtn() { return document.getElementById("closeSetupBtn"); },
    get toggleSidebarBtn() { return document.getElementById("toggleSidebarBtn"); },
    get floatingSidebarTrigger() { return document.getElementById("floatingSidebarTrigger"); },
    get sidebarDock() { return document.getElementById("sidebarDock"); },
    get missionPercent() { return document.getElementById("missionPercent"); },
    get missionRing() { return document.getElementById("missionRing"); },
    get missionText() { return document.getElementById("missionText"); },
    get completionLabel() { return document.getElementById("completionLabel"); },
    get fleetSummary() { return document.getElementById("fleetSummary"); },
    get routeUpdated() { return document.getElementById("routeUpdated"); }
};
