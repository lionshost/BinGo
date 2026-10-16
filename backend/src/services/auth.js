// ============================================================
// AUTH — băm mật khẩu (scrypt), token phiên ký HMAC, xác minh Google ID token.
// Không phụ thuộc thư viện ngoài: chỉ dùng node:crypto và fetch.
// ============================================================

import crypto from 'node:crypto';

export class AuthError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'AuthError';
        this.status = status;
    }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

export const normalizeEmail = value => String(value ?? '').trim().toLowerCase();

export function validateCredentials(email, password) {
    if (!EMAIL_RE.test(email) || email.length > 254) throw new AuthError('Email không hợp lệ.');
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
        throw new AuthError(`Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.`);
    }
    if (password.length > MAX_PASSWORD) throw new AuthError('Mật khẩu quá dài.');
}

const scrypt = (password, salt) => new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
});

export async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const key = await scrypt(password, salt);
    return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
    const [scheme, saltB64, keyB64] = String(stored || '').split('$');
    if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
    const expected = Buffer.from(keyB64, 'base64');
    const actual = await scrypt(String(password), Buffer.from(saltB64, 'base64'));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// ---------- token phiên (JWT HS256 rút gọn) ----------

const b64url = input => Buffer.from(input).toString('base64url');
const sign = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

export function signToken(userId, secret, ttlSeconds) {
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify({ sub: userId, iat: now, exp: now + ttlSeconds }));
    return `${head}.${body}.${sign(`${head}.${body}`, secret)}`;
}

export function verifyToken(token, secret) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, secret));
    const given = Buffer.from(parts[2]);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (!payload.sub || payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
}

// ---------- Google ----------

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

// Google tự kiểm tra chữ ký/hạn của ID token; ta kiểm tra thêm audience và email đã xác minh.
export async function verifyGoogleIdToken(idToken, clientId, fetchImpl = fetch) {
    if (!clientId) throw new AuthError('Đăng nhập Google chưa được cấu hình.', 503);
    if (typeof idToken !== 'string' || !idToken) throw new AuthError('Thiếu thông tin đăng nhập Google.');

    let res;
    try {
        res = await fetchImpl(`${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);
    } catch {
        throw new AuthError('Không kết nối được Google, hãy thử lại.', 503);
    }
    if (!res.ok) throw new AuthError('Phiên đăng nhập Google không hợp lệ.', 401);
    const info = await res.json();

    if (info.aud !== clientId) throw new AuthError('Phiên đăng nhập Google không hợp lệ.', 401);
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) {
        throw new AuthError('Phiên đăng nhập Google không hợp lệ.', 401);
    }
    if (String(info.email_verified) !== 'true' || !info.email) {
        throw new AuthError('Email Google chưa được xác minh.', 401);
    }
    return { googleId: String(info.sub), email: normalizeEmail(info.email), name: info.name || '' };
}
