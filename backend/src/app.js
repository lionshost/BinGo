// ============================================================
// EXPRESS APP — chỉ phục vụ API; frontend được host riêng (Vercel).
// ============================================================

import express from 'express';
import cors from 'cors';
import { env, publicConfig } from './config/env.js';
import { getPool } from './db/pool.js';
import { listBins, findBinsByIds } from './repositories/bins.js';
import { roadRoute, RoutingError, MAX_STOPS } from './services/routing.js';
import { analyzeWasteImage, parseImageDataUrl, VisionError } from './services/waste-vision.js';

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

export function createApp() {
    const app = express();
    app.disable('x-powered-by');
    // Render/Vercel đặt app sau proxy; cần để req.ip đúng.
    app.set('trust proxy', 1);

    app.use(cors({
        // CORS_ORIGINS trống → cho phép mọi origin (chỉ nên dùng khi phát triển).
        origin: env.corsOrigins.length ? env.corsOrigins : true,
        methods: ['GET', 'POST']
    }));
    app.use(express.json({ limit: '10mb' }));

    app.get('/api/health', asyncRoute(async (req, res) => {
        const pool = getPool();
        if (pool) await pool.query('SELECT 1');
        res.json({ status: 'ok', database: pool ? 'postgres' : 'json-file' });
    }));

    app.get('/api/map-config', (req, res) => {
        res.json(publicConfig());
    });

    app.get('/api/trash-bins', asyncRoute(async (req, res) => {
        res.json(await listBins());
    }));

    app.post('/api/road-route', asyncRoute(async (req, res) => {
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

    app.post('/api/analyze-waste-image', asyncRoute(async (req, res) => {
        try {
            const { image, bin_id } = req.body || {};
            const result = await analyzeWasteImage(parseImageDataUrl(image), env);
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
