// ============================================================
// AUTH API + phiên đăng nhập (localStorage)
// ============================================================

import { API_BASE_URL } from "./client.js";

const SESSION_KEY = "bingo.session";

export function getSession() {
    try {
        const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
        return session?.token && session?.user ? session : null;
    } catch {
        return null;
    }
}

export function saveSession(session) {
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ token: session.token, user: session.user }));
    } catch { /* localStorage bị chặn: phiên chỉ có hiệu lực ở trang hiện tại */ }
}

export function clearSession() {
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch { /* bỏ qua */ }
}

async function request(path, { method = "POST", body, token } = {}) {
    let res;
    try {
        res = await fetch(`${API_BASE_URL}${path}`, {
            method,
            headers: {
                ...(body ? { "Content-Type": "application/json" } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: body ? JSON.stringify(body) : undefined
        });
    } catch {
        throw new Error("Không kết nối được máy chủ, hãy thử lại sau ít giây.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Có lỗi xảy ra, hãy thử lại.");
    return data;
}

export const register = (email, password, name) => request("/api/auth/register", { body: { email, password, name } });
export const login = (email, password) => request("/api/auth/login", { body: { email, password } });
export const loginWithGoogle = credential => request("/api/auth/google", { body: { credential } });
export const fetchAuthConfig = () => request("/api/auth/config", { method: "GET" });

// Xác nhận token còn hiệu lực; hết hạn thì xoá phiên.
export async function refreshSession() {
    const session = getSession();
    if (!session) return null;
    try {
        const { user } = await request("/api/auth/me", { method: "GET", token: session.token });
        saveSession({ token: session.token, user });
        return { token: session.token, user };
    } catch (err) {
        if (/hết hạn/.test(err.message)) clearSession();
        return getSession();
    }
}

export async function fetchAdmin(path) {
    const session = getSession();
    if (!session) throw Object.assign(new Error("Chưa đăng nhập."), { status: 401 });
    let res;
    try {
        res = await fetch(`${API_BASE_URL}/api/admin/${path}`, {
            headers: { Authorization: `Bearer ${session.token}` },
            cache: "no-store"
        });
    } catch {
        throw new Error("Không kết nối được máy chủ.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "Có lỗi xảy ra."), { status: res.status });
    return data;
}
