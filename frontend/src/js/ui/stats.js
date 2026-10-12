// ============================================================
// UI STATS, KPI METRICS & ROUTE CONTROLS
// ============================================================

import { state, dom } from "../state/store.js";

export function readyMessage() {
    if (!state.mapReady || !state.providerConfig.routingConfigured) {
        return "Kết nối VIETMAP để tải tuyến cho đội xe.";
    }
    const ready = state.trucks.filter(t => t.routeStatus === "ready").length;
    if (!ready && !state.trucks.some(t => t.routeStatus === "error")) {
        return "Bản đồ đã sẵn sàng. Nhấn “Tải tuyến VIETMAP” để bắt đầu.";
    }
    const failed = state.trucks.filter(t => t.routeStatus === "error").length;
    return failed
        ? `⚠️ ${ready} tuyến sẵn sàng; ${failed} tuyến lỗi, các xe này chưa thể chạy. Nhấn “Tải lại tuyến lỗi”.`
        : `Sẵn sàng: ${ready} tuyến chạy theo đường ô tô.`;
}

export function setRouteControls(loading) {
    state.routesLoading = loading;
    const ready = state.trucks.some(t => t.routeStatus === "ready");

    if (dom.startBtn) dom.startBtn.disabled = loading || !ready || !state.mapReady;
    if (dom.pauseBtn) dom.pauseBtn.disabled = loading || !ready || !state.mapReady;
    if (dom.resetBtn) dom.resetBtn.disabled = loading || !ready;

    if (dom.retryRoutesBtn) {
        dom.retryRoutesBtn.disabled = loading || !state.mapReady || !state.providerConfig.routingConfigured;
        dom.retryRoutesBtn.hidden = !state.trucks.some(t => t.routeStatus === "error");
    }

    if (dom.loadRoutesBtn) {
        dom.loadRoutesBtn.disabled = loading || !state.mapReady || !state.providerConfig.routingConfigured;
        dom.loadRoutesBtn.hidden = ready || state.trucks.some(t => t.routeStatus === "error");
    }
}

export function updateStats() {
    const done = state.bins.filter(b => b.demoCollected).length;
    const serviceable = state.bins.filter(b => b.status !== "broken").length;
    const percent = serviceable ? Math.round((done / serviceable) * 100) : 0;

    if (dom.missionPercent) dom.missionPercent.innerHTML = `${percent}<small>%</small>`;
    if (dom.missionRing) dom.missionRing.style.setProperty("--progress", `${percent}%`);
    if (dom.missionText) {
        dom.missionText.textContent = done
            ? `${done} điểm sạch hơn nhờ đội xe của bạn`
            : "Sẵn sàng cho hành trình mới";
    }
    if (dom.completionLabel) dom.completionLabel.textContent = `${percent}% hành trình hoàn thành`;
    if (dom.fleetSummary) dom.fleetSummary.textContent = `${state.trucks.length} xe được phân công`;

    const total = state.bins.length;
    const collected = done;
    const broken = state.bins.filter(b => b.status === "broken").length;
    const waiting = total - collected - broken;

    if (dom.totalCount) dom.totalCount.textContent = total;
    if (dom.collectedCount) dom.collectedCount.textContent = collected;
    if (dom.waitingCount) dom.waitingCount.textContent = Math.max(0, waiting);
    if (dom.truckCount) {
        dom.truckCount.textContent = state.trucks.filter(truck => truck.routeStatus === "ready").length;
    }
}
