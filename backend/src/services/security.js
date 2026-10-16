// ============================================================
// SECURITY MIDDLEWARE — header bảo mật + giới hạn tần suất theo IP.
// Bộ đếm nằm trong bộ nhớ một tiến trình (đủ cho 1 instance; nhiều instance cần Redis).
// ============================================================

export function securityHeaders(req, res, next) {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        // API chỉ trả JSON: cấm mọi nội dung chủ động nếu ai đó mở trực tiếp.
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
    });
    if (req.secure || req.get('x-forwarded-proto') === 'https') {
        res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
}

/**
 * Giới hạn `max` request mỗi `windowMs` cho mỗi khoá (mặc định: IP).
 * `keyFn` cho phép giới hạn theo khoá khác (vd email đăng nhập).
 */
export function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 20, keyFn = req => req.ip, message } = {}) {
    const hits = new Map();
    let lastSweep = Date.now();

    return (req, res, next) => {
        const now = Date.now();
        // Dọn khoá hết hạn định kỳ để Map không phình ra khi bị quét nhiều IP.
        if (now - lastSweep > windowMs) {
            for (const [key, entry] of hits) if (entry.reset < now) hits.delete(key);
            lastSweep = now;
        }

        const key = keyFn(req);
        let entry = hits.get(key);
        if (!entry || entry.reset < now) {
            // Chặn cứng kích thước Map: quá 50k khoá thì bỏ khoá cũ nhất.
            if (hits.size >= 50_000) hits.delete(hits.keys().next().value);
            entry = { count: 0, reset: now + windowMs };
            hits.set(key, entry);
        }

        if (++entry.count > max) {
            res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
            return res.status(429).json({ error: message || 'Quá nhiều yêu cầu, vui lòng đợi một lát.' });
        }
        next();
    };
}
