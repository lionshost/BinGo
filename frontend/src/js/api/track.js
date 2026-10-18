// ============================================================
// ĐẾM LƯỢT XEM TRANG — chỉ gửi tên trang, không gửi thông tin người xem.
// keepalive để request vẫn đi khi người dùng chuyển trang ngay.
// ============================================================

import { API_BASE_URL } from "./client.js";

export function trackPageView(page) {
    try {
        fetch(`${API_BASE_URL}/api/track`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ page }),
            keepalive: true
        }).catch(() => {});
    } catch { /* trình duyệt chặn: bỏ qua */ }
}
