import { clearSession, fetchAdmin, refreshSession } from "../js/api/auth.js";
import { trackPageView } from "../js/api/track.js";

trackPageView("admin");

const $ = id => document.getElementById(id);

// Mọi dữ liệu người dùng (email, tên…) chỉ được chèn bằng textContent → không có XSS.
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

const STATUS = {
    active: { label: "Hoạt động", cls: "" },
    full: { label: "Đầy", cls: "warn" },
    broken: { label: "Hỏng", cls: "danger" }
};

const fmt = new Intl.NumberFormat("vi-VN");
const formatDate = iso => new Date(iso).toLocaleDateString("vi-VN");
const formatUptime = s => (s >= 3600
    ? `${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút`
    : `${Math.floor(s / 60)} phút`);

function renderBars(container, counts, { labels = {}, top = 10 } = {}) {
    container.replaceChildren();
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, top);
    if (!rows.length) return container.append(el("p", "empty", "Chưa có dữ liệu."));
    const max = Math.max(...rows.map(([, n]) => n));
    for (const [key, count] of rows) {
        const label = labels[key]?.label || key;
        const row = el("div", "bar");
        const name = el("span", "bar-label", label);
        name.title = label;
        const fill = el("div", `bar-fill ${labels[key]?.cls || ""}`);
        fill.style.width = `${Math.max(2, (count / max) * 100)}%`;
        const track = el("div", "bar-track");
        track.append(fill);
        row.append(name, track, el("span", "bar-count", fmt.format(count)));
        container.append(row);
    }
}

function renderKpis(stats) {
    const items = [
        ["Điểm thu gom", stats.bins.total, `${fmt.format(stats.bins.recyclable)} điểm tái chế`],
        ["Đang đầy", stats.bins.byStatus.full || 0, "cần thu gom"],
        ["Đang hỏng", stats.bins.byStatus.broken || 0, "cần sửa chữa"],
        ["Xe đang chạy", stats.fleet.activeTrucks, "báo vị trí trong 30 giây qua"],
        ["Người dùng", stats.users.total, `+${fmt.format(stats.users.newThisWeek)} tuần này`],
        ["Quản trị viên", stats.users.admins, `${fmt.format(stats.users.google)} tài khoản dùng Google`]
    ];
    $("kpis").replaceChildren(...items.map(([label, value, hint]) => {
        const box = el("div", "kpi");
        box.append(el("span", "", label), el("strong", "", fmt.format(value)), el("small", "", hint));
        return box;
    }));
}

function renderSystem(system) {
    const rows = [
        ["Cơ sở dữ liệu", system.database === "postgres" ? "PostgreSQL" : "File JSON mẫu", system.database === "postgres"],
        ["Chỉ đường VietMap", system.routing ? "Đã cấu hình" : "Chưa cấu hình", system.routing],
        ["Mô hình CV (YOLOv8 ONNX)", system.cv ? "Đã nạp file mô hình" : "Thiếu file mô hình", system.cv],
        ["Gemini dự phòng", system.vision ? "Đã cấu hình" : "Tắt", system.vision],
        ["Đăng nhập Google", system.googleLogin ? "Đã cấu hình" : "Chưa cấu hình", system.googleLogin],
        ["Môi trường", system.nodeEnv, true],
        ["Máy chủ đã chạy", formatUptime(system.uptimeSeconds), true]
    ];
    $("system").replaceChildren(...rows.map(([label, value, ok]) => {
        const li = el("li");
        li.append(el("span", "", label), el("span", `pill${ok ? "" : " off"}`, value));
        return li;
    }));
}

function renderUsers(users) {
    const body = $("users");
    body.replaceChildren();
    if (!users.length) {
        const tr = el("tr");
        const td = el("td", "empty", "Chưa có người dùng.");
        td.colSpan = 5;
        tr.append(td);
        return body.append(tr);
    }
    for (const u of users) {
        const tr = el("tr");
        const role = el("td");
        role.append(u.role === "admin" ? el("span", "pill", "Admin") : el("span", "pill plain", "User"));
        const methods = u.method.map(m => (m === "google" ? "Google" : "Email")).join(" + ");
        tr.append(el("td", "", u.email), el("td", "", u.name || "—"), role, el("td", "", methods), el("td", "", formatDate(u.createdAt)));
        body.append(tr);
    }
}

// ---------- Lượt sử dụng (theo ngày) ----------

const sumMetrics = (metrics, names, len) => {
    const out = new Array(len).fill(0);
    for (const name of names) (metrics[name] || []).forEach((n, i) => { out[i] += n; });
    return out;
};
const total = series => series.reduce((a, b) => a + b, 0);
const PAGE_LABELS = {
    "page.landing": { label: "Trang chủ" },
    "page.map": { label: "Bản đồ điều phối" },
    "page.login": { label: "Đăng nhập" },
    "page.admin": { label: "Quản trị" },
    "page.mobile": { label: "Mở app mobile" }
};
const PAGE_METRICS = Object.keys(PAGE_LABELS);
const VIETMAP_CALLS = ["vietmap.route", "vietmap.directions"];
const VISION_CALLS = ["vision.cv", "vision.gemini"];
const LOGIN_OK = ["auth.email.ok", "auth.google.ok"];

// Mỗi tab là MỘT chuỗi số liệu theo ngày → một màu, tiêu đề tab gọi tên chuỗi.
const USAGE_VIEWS = {
    vietmap: { label: "Gọi VIETMAP Route", names: VIETMAP_CALLS },
    pages: { label: "Lượt xem trang", names: PAGE_METRICS },
    vision: { label: "Phân tích ảnh AI", names: VISION_CALLS },
    logins: { label: "Đăng nhập thành công", names: LOGIN_OK },
    api: { label: "Lượt gọi API", names: ["api.requests"] }
};

let usageData = null;
let usageView = "vietmap";

function renderUsageTiles({ metrics, totals, days }) {
    const today = name => (metrics[name] || [])[days.length - 1] || 0;
    const todayOf = names => names.reduce((sum, n) => sum + today(n), 0);
    const sumOf = names => names.reduce((sum, n) => sum + (totals[n] || 0), 0);
    const items = [
        ["Gọi VIETMAP Route", sumOf(VIETMAP_CALLS),
            `${fmt.format(totals["vietmap.route"] || 0)} lập tuyến · ${fmt.format(totals["vietmap.directions"] || 0)} chỉ đường · ${fmt.format(totals["vietmap.error"] || 0)} lỗi`],
        ["Tải bản đồ VIETMAP", totals["vietmap.tilemap_config"] || 0, "số lần lấy Tilemap key"],
        ["Lượt xem trang", sumOf(PAGE_METRICS), `hôm nay ${fmt.format(todayOf(PAGE_METRICS))}`],
        ["Phân tích ảnh AI", sumOf(VISION_CALLS),
            `${fmt.format(totals["vision.cv"] || 0)} CV · ${fmt.format(totals["vision.gemini"] || 0)} Gemini · ${fmt.format(totals["vision.error"] || 0)} lỗi`],
        ["Đăng nhập", sumOf(LOGIN_OK),
            `${fmt.format(totals["auth.email.fail"] || 0)} lần sai mật khẩu · ${fmt.format(totals["auth.register.ok"] || 0)} đăng ký`],
        ["Lượt gọi API", totals["api.requests"] || 0, `hôm nay ${fmt.format(today("api.requests"))}`]
    ];
    $("usageKpis").replaceChildren(...items.map(([label, value, hint]) => {
        const box = el("div", "kpi");
        box.append(el("span", "", label), el("strong", "", fmt.format(value)), el("small", "", hint));
        return box;
    }));
}

function renderUsageTabs() {
    $("usageTabs").replaceChildren(...Object.entries(USAGE_VIEWS).map(([key, view]) => {
        const btn = el("button", "tab", view.label);
        btn.type = "button";
        btn.setAttribute("role", "tab");
        btn.setAttribute("aria-selected", String(key === usageView));
        btn.addEventListener("click", () => {
            usageView = key;
            renderUsageTabs();
            renderUsageChart();
        });
        return btn;
    }));
}

const shortDay = day => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

function renderUsageChart() {
    const chart = $("usageChart");
    const tip = $("usageTip");
    chart.replaceChildren();
    tip.hidden = true;
    if (!usageData) return;
    const { days, metrics } = usageData;
    const view = USAGE_VIEWS[usageView];
    const series = sumMetrics(metrics, view.names, days.length);
    const max = Math.max(...series, 0);
    $("usageCaption").textContent = `${view.label} mỗi ngày · ${days.length} ngày gần nhất · tổng ${fmt.format(total(series))}`;
    if (!max) {
        chart.append(el("p", "empty", "Chưa có lượt nào trong khoảng này."));
        return;
    }
    // Trục y gọn: 0 và mức cao nhất (làm tròn lên).
    const step = 10 ** Math.max(0, Math.floor(Math.log10(max)));
    const top = Math.ceil(max / step) * step;
    const plot = el("div", "cols");
    plot.setAttribute("role", "img");
    plot.setAttribute("aria-label", `${view.label}: ${days.map((d, i) => `${shortDay(d)} ${series[i]}`).join(", ")}`);
    const axis = el("div", "cols-axis");
    axis.append(el("span", "", fmt.format(top)), el("span", "", "0"));
    days.forEach((day, i) => {
        const col = el("div", "col");
        const bar = el("div", "col-bar");
        bar.style.height = series[i] ? `${Math.max(2, (series[i] / top) * 100)}%` : "0";
        col.append(bar);
        const label = el("span", "col-day", shortDay(day));
        // Thưa nhãn ngày khi có nhiều cột để khỏi chồng chữ.
        if (days.length > 10 && i % 2 !== (days.length - 1) % 2) label.classList.add("faint");
        col.append(label);
        const show = () => {
            tip.replaceChildren(el("strong", "", fmt.format(series[i])), el("span", "", ` ${view.label.toLowerCase()} · ${new Date(`${day}T00:00:00`).toLocaleDateString("vi-VN")}`));
            tip.hidden = false;
            // Đặt tooltip ngay trên đầu cột (toạ độ theo card chứa biểu đồ).
            const box = bar.getBoundingClientRect();
            const host = chart.closest(".card").getBoundingClientRect();
            const half = tip.offsetWidth / 2 + 8;
            tip.style.left = `${Math.min(Math.max(box.left - host.left + box.width / 2, half), host.width - half)}px`;
            tip.style.top = `${box.top - host.top - 38}px`;
            col.classList.add("on");
        };
        const hide = () => { tip.hidden = true; col.classList.remove("on"); };
        col.tabIndex = 0;
        col.addEventListener("mouseenter", show);
        col.addEventListener("focus", show);
        col.addEventListener("mouseleave", hide);
        col.addEventListener("blur", hide);
        plot.append(col);
    });
    const frame = el("div", "cols-frame");
    frame.append(axis, plot);
    chart.append(frame);
}

function renderPageBars({ totals }) {
    const counts = Object.fromEntries(PAGE_METRICS.map(name => [name, totals[name] || 0]).filter(([, n]) => n));
    renderBars($("pageBars"), counts, { labels: PAGE_LABELS });
}

// ---------- Lịch sử đăng nhập ----------

const METHOD_LABELS = { email: "Email", google: "Google", register: "Đăng ký" };

// Rút gọn user-agent thành "Trình duyệt · Hệ điều hành" dễ đọc.
function describeAgent(ua) {
    if (!ua) return "—";
    const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /CocCoc/.test(ua) ? "Cốc Cốc"
        : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari"
            : /okhttp|Expo|ReactNative/i.test(ua) ? "App mobile" : ua.split(/[ /]/)[0];
    const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS"
        : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
    return os ? `${browser} · ${os}` : browser;
}

function renderLogins(events) {
    const body = $("logins");
    body.replaceChildren();
    if (!events.length) {
        const tr = el("tr");
        const td = el("td", "empty", "Chưa có lượt đăng nhập nào.");
        td.colSpan = 6;
        tr.append(td);
        return body.append(tr);
    }
    for (const e of events) {
        const tr = el("tr");
        const result = el("td");
        result.append(e.success
            ? el("span", "pill", "✓ Thành công")
            : el("span", "pill off", "✕ Thất bại"));
        const agent = el("td", "", describeAgent(e.userAgent));
        if (e.userAgent) agent.title = e.userAgent;
        tr.append(
            el("td", "", new Date(e.createdAt).toLocaleString("vi-VN")),
            el("td", "", e.email || "—"),
            el("td", "", METHOD_LABELS[e.method] || e.method),
            result,
            el("td", "", e.ip || "—"),
            agent
        );
        body.append(tr);
    }
}

const deny = () => location.replace("login.html?next=%2Fadmin.html");

async function load() {
    $("notice").hidden = true;
    try {
        const [stats, { users }, usage, { events }] = await Promise.all([
            fetchAdmin("stats"), fetchAdmin("users"), fetchAdmin("usage?days=14"), fetchAdmin("logins?limit=50")
        ]);
        renderKpis(stats);
        renderBars($("statusBars"), stats.bins.byStatus, { labels: STATUS });
        renderBars($("typeBars"), stats.bins.byType);
        renderBars($("districtBars"), stats.bins.byDistrict);
        renderSystem(stats.system);
        renderUsers(users);
        usageData = usage;
        renderUsageTiles(usage);
        renderUsageTabs();
        renderUsageChart();
        renderPageBars(usage);
        renderLogins(events);
        $("stamp").textContent = `Cập nhật lúc ${new Date(stats.generatedAt).toLocaleTimeString("vi-VN")}`;
    } catch (err) {
        if (err.status === 401 || err.status === 403) return deny();
        $("notice").textContent = err.message;
        $("notice").hidden = false;
    }
}

async function init() {
    const session = await refreshSession();
    if (!session) return deny();
    if (session.user.role !== "admin") {
        $("loading").textContent = "Tài khoản này không có quyền quản trị. ";
        const back = el("a", "btn-ghost", "Về trang chủ");
        back.href = "index.html";
        $("loading").append(back);
        return;
    }
    $("who").textContent = session.user.name || session.user.email;
    $("loading").hidden = true;
    $("app").hidden = false;
    $("refreshBtn").addEventListener("click", load);
    $("logoutBtn").addEventListener("click", () => {
        clearSession();
        location.replace("index.html");
    });
    await load();
    setInterval(load, 30_000);
}

init();
