// ============================================================
// EXPRESS APP — chỉ phục vụ API; frontend được host riêng (Vercel).
// ============================================================

import express from 'express';
import cors from 'cors';
import { env, publicConfig } from './config/env.js';
import { getPool } from './db/pool.js';
import { listBins, findBinsByIds } from './repositories/bins.js';
import { directions, roadRoute, RoutingError, MAX_STOPS } from './services/routing.js';
import { updatePositions, nearbyTrucks, FleetError, DEFAULT_RADIUS_M } from './services/fleet.js';
import {
    AuthError, hashPassword, normalizeEmail, signToken,
    validateCredentials, verifyGoogleIdToken, verifyPassword, verifyToken
} from './services/auth.js';
import {
    createUser, findUserByEmail, findUserByGoogleId, findUserById, linkGoogle, publicUser, setUserRole
} from './repositories/users.js';
import { createAdminRouter } from './routes/admin.js';
import { createRateLimiter, securityHeaders } from './services/security.js';
import { parseImageDataUrl, VisionError } from './services/waste-vision.js';
import { analyzeWaste } from './services/waste-analysis.js';

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

export function createApp() {
    const app = express();
    app.disable('x-powered-by');
    // Render/Vercel đặt app sau proxy; cần để req.ip đúng.
    app.set('trust proxy', 1);

    if (env.nodeEnv === 'production' && !env.corsOrigins.length) {
        console.warn('[bảo mật] CORS_ORIGINS đang trống ở production: mọi website đều gọi được API và lấy được Tilemap key.');
    }

    app.use(securityHeaders);

    app.use(cors({
        // CORS_ORIGINS trống → cho phép mọi origin (chỉ nên dùng khi phát triển).
        origin: env.corsOrigins.length ? env.corsOrigins : true,
        methods: ['GET', 'POST']
    }));

    // Giới hạn chung cho mọi API; các route tốn tài nguyên/tiền có giới hạn riêng chặt hơn bên dưới.
    app.use('/api', createRateLimiter({ windowMs: 60_000, max: 300 }));
    const costlyLimiter = createRateLimiter({
        windowMs: 60_000, max: 20, message: 'Bạn gọi chức năng này quá nhanh, vui lòng đợi một phút.'
    });
    const fleetWriteLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });

    // Body mặc định chỉ 100 KB; riêng route phân tích ảnh cần tới 10 MB.
    const smallJson = express.json({ limit: '100kb' });
    const imageJson = express.json({ limit: '10mb' });
    app.use((req, res, next) => (req.path === '/api/analyze-waste-image' ? imageJson : smallJson)(req, res, next));

    app.get('/api/health', asyncRoute(async (req, res) => {
        const pool = getPool();
        if (pool) await pool.query('SELECT 1');
        res.json({ status: 'ok', database: pool ? 'postgres' : 'json-file' });
    }));

    // ---------- Tài khoản: đăng ký / đăng nhập email, đăng nhập Google ----------
    const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 30, message: 'Thử quá nhiều lần, vui lòng đợi ít phút.' });
    // Chống dò mật khẩu một tài khoản từ nhiều IP: giới hạn riêng theo email.
    const loginEmailLimiter = createRateLimiter({
        windowMs: 15 * 60_000,
        max: 10,
        keyFn: req => normalizeEmail(req.body?.email).slice(0, 254),
        message: 'Tài khoản bị thử đăng nhập quá nhiều lần, vui lòng đợi ít phút.'
    });
    app.use('/api/auth', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    const session = user => ({ token: signToken(user.id, env.authSecret, env.tokenTtlSeconds), user: publicUser(user) });
    // Đọc Bearer token → user hiện tại (null nếu token sai/hết hạn/user đã bị xoá).
    const authenticate = async req => {
        const match = /^Bearer (.+)$/.exec(req.get('authorization') || '');
        const payload = match && verifyToken(match[1], env.authSecret);
        return payload ? findUserById(payload.sub) : null;
    };
    const authRoute = handler => asyncRoute(async (req, res) => {
        try {
            await handler(req, res);
        } catch (err) {
            if (err instanceof AuthError) return res.status(err.status).json({ error: err.message });
            throw err;
        }
    });

    app.get('/api/auth/config', (req, res) => {
        res.json({ googleClientId: env.googleClientId || null });
    });

    app.post('/api/auth/register', authLimiter, authRoute(async (req, res) => {
        const email = normalizeEmail(req.body?.email);
        const password = req.body?.password;
        const name = String(req.body?.name ?? '').trim().slice(0, 80);
        validateCredentials(email, password);
        if (await findUserByEmail(email)) throw new AuthError('Email này đã được đăng ký.', 409);
        const user = await createUser({ email, passwordHash: await hashPassword(password), name });
        if (!user) throw new AuthError('Email này đã được đăng ký.', 409);
        res.status(201).json(session(user));
    }));

    app.post('/api/auth/login', authLimiter, loginEmailLimiter, authRoute(async (req, res) => {
        const email = normalizeEmail(req.body?.email);
        const password = req.body?.password;
        const user = typeof password === 'string' ? await findUserByEmail(email) : null;
        // Cùng một thông báo cho "sai email" và "sai mật khẩu" để không lộ email nào đã đăng ký.
        const ok = user?.passwordHash && await verifyPassword(password, user.passwordHash);
        if (!ok) {
            if (user && !user.passwordHash) {
                throw new AuthError('Tài khoản này đăng ký bằng Google, hãy chọn "Tiếp tục với Google".', 401);
            }
            throw new AuthError('Email hoặc mật khẩu không đúng.', 401);
        }
        res.json(session(user));
    }));

    app.post('/api/auth/google', authLimiter, authRoute(async (req, res) => {
        const profile = await verifyGoogleIdToken(req.body?.credential, env.googleClientId);
        let user = await findUserByGoogleId(profile.googleId);
        if (!user) {
            // Email Google đã xác minh → an toàn để gộp vào tài khoản email có sẵn.
            const existing = await findUserByEmail(profile.email);
            user = existing
                ? await linkGoogle(existing.id, profile.googleId, profile.name)
                : await createUser({ email: profile.email, googleId: profile.googleId, name: profile.name });
            if (!user) throw new AuthError('Không thể tạo tài khoản, hãy thử lại.', 409);
        }
        // Email Google đã được Google xác minh nên mới đủ tin cậy để cấp admin theo ADMIN_EMAILS.
        if (user.role !== 'admin' && env.adminEmails.includes(user.email)) {
            user = await setUserRole(user.id, 'admin');
        }
        res.json(session(user));
    }));

    app.get('/api/auth/me', authRoute(async (req, res) => {
        const user = await authenticate(req);
        if (!user) throw new AuthError('Phiên đăng nhập đã hết hạn.', 401);
        res.set('Cache-Control', 'no-store');
        res.json({ user: publicUser(user) });
    }));

    app.use('/api/admin', createAdminRouter({ authenticate, asyncRoute }));

    app.get('/api/map-config', (req, res) => {
        // Tilemap key buộc phải ra trình duyệt; ít nhất không trao cho origin lạ.
        // (Origin do client tự khai nên chỉ chặn được scraping thông thường —
        // lớp bảo vệ thật là khoá key theo domain trong dashboard VietMap.)
        const origin = req.get('origin');
        if (env.corsOrigins.length && origin && !env.corsOrigins.includes(origin)) {
            return res.status(403).json({ error: 'Origin không được phép.' });
        }
        res.set('Cache-Control', 'private, max-age=3600');
        res.json(publicConfig());
    });

    app.get('/api/trash-bins', asyncRoute(async (req, res) => {
        res.json(await listBins());
    }));

    app.post('/api/road-route', costlyLimiter, asyncRoute(async (req, res) => {
        const ids = req.body?.bin_ids;
        if (
            !Array.isArray(ids) ||
            ids.length < 1 ||
            ids.length > MAX_STOPS ||
            ids.some(v => typeof v !== 'string') ||
            new Set(ids).size !== ids.length
        ) {
            return res.status(400).json({ error: `Cần từ 1 đến ${MAX_STOPS} mã điểm thu gom khác nhau.` });
        }

        const lookup = new Map((await findBinsByIds(ids)).map(item => [item.id, item]));
        const selected = [];
        for (const binId of ids) {
            const item = lookup.get(binId);
            if (!item || item.status === 'broken') {
                return res.status(400).json({ error: 'Điểm thu gom không tồn tại hoặc đang hỏng.' });
            }
            const lat = Number(item.latitude);
            const lon = Number(item.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                return res.status(400).json({ error: 'Tọa độ điểm thu gom không hợp lệ.' });
            }
            selected.push({ ...item, latitude: lat, longitude: lon });
        }

        try {
            return res.json(await roadRoute(selected, env));
        } catch (err) {
            if (err instanceof RoutingError) return res.status(503).json({ error: err.message });
            throw err;
        }
    }));

    // Chỉ đường từ vị trí hiện tại tới một điểm thu gom (app mobile).
    app.post('/api/directions', costlyLimiter, asyncRoute(async (req, res) => {
        const from = req.body?.from;
        const binId = req.body?.to_bin_id;
        const lat = Number(from?.lat);
        const lon = Number(from?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            return res.status(400).json({ error: 'Vị trí xuất phát không hợp lệ.' });
        }
        if (typeof binId !== 'string' || !binId) {
            return res.status(400).json({ error: 'Thiếu mã điểm thu gom.' });
        }
        const [item] = await findBinsByIds([binId]);
        const toLat = Number(item?.latitude);
        const toLon = Number(item?.longitude);
        if (!item || !Number.isFinite(toLat) || !Number.isFinite(toLon)) {
            return res.status(400).json({ error: 'Điểm thu gom không tồn tại.' });
        }

        try {
            return res.json(await directions({ latitude: lat, longitude: lon }, { latitude: toLat, longitude: toLon }, env));
        } catch (err) {
            if (err instanceof RoutingError) return res.status(503).json({ error: err.message });
            throw err;
        }
    }));

    // Vị trí xe thu gom theo thời gian thực: bảng điều phối phát, web/mobile hỏi xe gần mình.
    app.post('/api/fleet/positions', fleetWriteLimiter, (req, res) => {
        try {
            res.json({ accepted: updatePositions(req.body?.trucks) });
        } catch (err) {
            if (err instanceof FleetError) return res.status(400).json({ error: err.message });
            throw err;
        }
    });

    app.get('/api/fleet/nearby', (req, res) => {
        try {
            const radius = req.query.radius === undefined ? DEFAULT_RADIUS_M : Number(req.query.radius);
            const trucks = nearbyTrucks(Number(req.query.lat), Number(req.query.lon), radius);
            res.set('Cache-Control', 'no-store');
            res.json({ radius, trucks, at: Date.now() });
        } catch (err) {
            if (err instanceof FleetError) return res.status(400).json({ error: err.message });
            throw err;
        }
    });

    app.post('/api/analyze-waste-image', costlyLimiter, asyncRoute(async (req, res) => {
        try {
            const { image, bin_id } = req.body || {};
            const result = await analyzeWaste(parseImageDataUrl(image), env);
            return res.json({ ...result, bin_id: bin_id || null });
        } catch (err) {
            if (err instanceof VisionError) return res.status(err.status).json({ error: err.message });
            throw err;
        }
    }));

    app.use('/api', (req, res) => {
        res.status(404).json({ error: 'Không tìm thấy API.' });
    });

    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err.type === 'entity.too.large') {
            return res.status(413).json({ error: 'Dữ liệu gửi lên quá lớn.' });
        }
        if (err.type === 'entity.parse.failed') {
            return res.status(400).json({ error: 'JSON không hợp lệ.' });
        }
        console.error(err);
        res.status(500).json({ error: 'Lỗi máy chủ.' });
    });

    return app;
}
