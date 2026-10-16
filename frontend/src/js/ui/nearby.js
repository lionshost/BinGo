// ============================================================
// THÔNG BÁO "XE THU GOM GẦN BẠN"
// Người dùng chọn vị trí (GPS hoặc bấm lên bản đồ) và bán kính; trang hỏi máy
// chủ vài giây một lần và báo khi có xe vừa đi vào bán kính.
// ============================================================

import { fetchNearbyTrucks } from "../api/client.js";
import { escapeHtml } from "../utils/dom.js";

const POLL_MS = 3000;
const $ = id => document.getElementById(id);

export function setupNearbyAlerts(map) {
    const toggleBtn = $("nearbyToggleBtn");
    if (!toggleBtn) return;

    const radiusSelect = $("nearbyRadius");
    const locateBtn = $("nearbyLocateBtn");
    const pickBtn = $("nearbyPickBtn");
    const statusEl = $("nearbyStatus");
    const listEl = $("nearbyList");
    const toastBox = $("toastBox");

    let enabled = false;
    let userPos = null;
    let userMarker = null;
    let radiusCircle = null;
    let picking = false;
    let watchId = null;
    let timer = null;
    let inFlight = false;
    let known = new Set(); // xe đã báo, còn trong bán kính

    const radius = () => Number(radiusSelect.value) || 500;
    const fmtDistance = m => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

    function toast(message) {
        const el = document.createElement("div");
        el.className = "toast";
        el.textContent = message;
        toastBox.appendChild(el);
        setTimeout(() => el.classList.add("hide"), 6000);
        setTimeout(() => el.remove(), 6500);
    }

    function announce(truck) {
        const message = `${truck.name} đang cách bạn ${fmtDistance(truck.distance)} (khoảng ${truck.etaMinutes} phút). Hãy chuẩn bị rác!`;
        toast(message);
        if ("Notification" in window && Notification.permission === "granted") {
            try { new Notification("BinGo", { body: message }); } catch { /* bỏ qua */ }
        }
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    }

    function setUserPos(pos, label) {
        userPos = pos;
        if (!userMarker) {
            userMarker = L.circleMarker(pos, {
                radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1
            }).addTo(map).bindTooltip("Vị trí của bạn");
            radiusCircle = L.circle(pos, {
                radius: radius(), color: "#2563eb", weight: 1, fillColor: "#2563eb", fillOpacity: 0.08
            }).addTo(map);
        } else {
            userMarker.setLatLng(pos);
            radiusCircle.setLatLng(pos);
        }
        statusEl.textContent = label;
        known = new Set();
        poll();
    }

    function stopWatching() {
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
    }

    function locate() {
        if (!navigator.geolocation) {
            statusEl.textContent = "Trình duyệt không hỗ trợ định vị. Hãy chọn vị trí trên bản đồ.";
            return;
        }
        statusEl.textContent = "Đang xác định vị trí…";
        stopWatching();
        watchId = navigator.geolocation.watchPosition(
            p => setUserPos([p.coords.latitude, p.coords.longitude], "Đang theo dõi theo GPS của bạn."),
            err => {
                watchId = null;
                statusEl.textContent = err.code === 1
                    ? "Bạn đã từ chối định vị. Hãy chọn vị trí trên bản đồ."
                    : "Không lấy được vị trí. Hãy chọn vị trí trên bản đồ.";
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
    }

    function setPicking(value) {
        picking = value;
        pickBtn.setAttribute("aria-pressed", String(picking));
        map.getContainer().style.cursor = picking ? "crosshair" : "";
        if (picking) statusEl.textContent = "Bấm vào bản đồ để chọn vị trí của bạn.";
    }

    map.on("click", event => {
        if (!picking) return;
        stopWatching();
        setPicking(false);
        setUserPos([event.latlng.lat, event.latlng.lng], "Đang theo dõi theo vị trí bạn đã chọn.");
    });

    function renderList(trucks) {
        if (!trucks.length) {
            listEl.innerHTML = `<p class="muted">Chưa có xe nào trong bán kính ${fmtDistance(radius())}.</p>`;
            return;
        }
        listEl.innerHTML = trucks.slice(0, 5).map(truck =>
            `<div class="nearby-item"><i style="background:${escapeHtml(truck.color || "#178760")}"></i>` +
            `<strong>${escapeHtml(truck.name)}</strong><span>${fmtDistance(truck.distance)} · ~${truck.etaMinutes} phút</span></div>`
        ).join("");
    }

    async function poll() {
        if (!enabled || !userPos || inFlight) return;
        inFlight = true;
        const asked = userPos;
        try {
            const trucks = await fetchNearbyTrucks(asked[0], asked[1], radius());
            if (!enabled || asked !== userPos) return;
            const now = new Set(trucks.map(t => t.id));
            trucks.filter(t => !known.has(t.id)).forEach(announce);
            known = now;
            renderList(trucks);
        } catch (error) {
            statusEl.textContent = error.message;
        } finally {
            inFlight = false;
        }
    }

    function setEnabled(value) {
        enabled = value;
        toggleBtn.setAttribute("aria-pressed", String(value));
        toggleBtn.textContent = value ? "Tắt thông báo" : "Bật thông báo";
        $("nearbyPanel").classList.toggle("on", value);
        clearInterval(timer);
        if (value) {
            if ("Notification" in window && Notification.permission === "default") {
                Notification.requestPermission().catch(() => {});
            }
            if (!userPos) locate();
            timer = setInterval(poll, POLL_MS);
            poll();
        } else {
            stopWatching();
            setPicking(false);
            known = new Set();
            listEl.innerHTML = "";
            statusEl.textContent = "Bật để nhận thông báo khi xe thu gom đến gần.";
        }
    }

    toggleBtn.addEventListener("click", () => setEnabled(!enabled));
    locateBtn.addEventListener("click", locate);
    pickBtn.addEventListener("click", () => setPicking(!picking));
    radiusSelect.addEventListener("change", () => {
        if (radiusCircle) radiusCircle.setRadius(radius());
        known = new Set();
        poll();
    });
}
