// ============================================================
// UI FILTERS (SEARCH, DISTRICT, TYPE, STATUS & SPEED)
// ============================================================

import { state, dom } from "../state/store.js";
import { fillSelect, uniqueValues } from "../utils/dom.js";

export function initializeFilters() {
    fillSelect(dom.districtFilter, uniqueValues(state.bins, "district"));
    fillSelect(dom.typeFilter, uniqueValues(state.bins, "type"));
}

export function setupFilterEvents(onFilterChange) {
    if (dom.searchInput) {
        dom.searchInput.addEventListener("input", onFilterChange);
    }

    if (dom.districtFilter) {
        dom.districtFilter.addEventListener("change", onFilterChange);
    }

    if (dom.typeFilter) {
        dom.typeFilter.addEventListener("change", onFilterChange);
    }

    document.querySelectorAll("[data-filter]").forEach(button => {
        button.addEventListener("click", () => {
            state.statusFilter = button.dataset.filter;
            document.querySelectorAll("[data-filter]").forEach(chip => {
                const active = chip === button;
                chip.classList.toggle("active", active);
                chip.setAttribute("aria-pressed", String(active));
            });
            onFilterChange();
        });
    });
}

export function setupSpeedButtons() {
    document.querySelectorAll(".speed-btn").forEach(button => {
        button.addEventListener("click", () => {
            if (state.routesLoading) return;

            document.querySelectorAll(".speed-btn").forEach(btn => {
                btn.classList.remove("active");
                btn.setAttribute("aria-pressed", "false");
            });

            button.classList.add("active");
            button.setAttribute("aria-pressed", "true");

            state.speedMultiplier = Number(button.dataset.speed);

            if (dom.simulationStatus) {
                dom.simulationStatus.textContent = state.running
                    ? `🟢 Đang thu gom - tốc độ ${state.speedMultiplier}×`
                    : `Tốc độ mô phỏng: ${state.speedMultiplier}×`;
            }
        });
    });
}
