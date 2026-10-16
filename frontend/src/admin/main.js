import { clearSession, fetchAdmin, refreshSession } from "../js/api/auth.js";

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

const deny = () => location.replace("login.html?next=%2Fadmin.html");

async function load() {
    $("notice").hidden = true;
    try {
        const [stats, { users }] = await Promise.all([fetchAdmin("stats"), fetchAdmin("users")]);
        renderKpis(stats);
        renderBars($("statusBars"), stats.bins.byStatus, { labels: STATUS });
        renderBars($("typeBars"), stats.bins.byType);
        renderBars($("districtBars"), stats.bins.byDistrict);
        renderSystem(stats.system);
        renderUsers(users);
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
