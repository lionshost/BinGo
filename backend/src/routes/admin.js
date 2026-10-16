// ============================================================
// ADMIN API — chỉ tài khoản role=admin. Quyền được đọc lại từ DB ở mỗi request
// (không nhét vào token), nên thu hồi quyền có hiệu lực ngay.
// ============================================================

import { Router } from 'express';
import { env, publicConfig } from '../config/env.js';
import { getPool } from '../db/pool.js';
import { listBins } from '../repositories/bins.js';
import { listUsers, userStats } from '../repositories/users.js';
import { activeTruckCount } from '../services/fleet.js';
import { AuthError } from '../services/auth.js';

const tally = (items, keyFn) => {
    const counts = {};
    for (const item of items) {
        const key = keyFn(item) || 'Khác';
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
};

export function createAdminRouter({ authenticate, asyncRoute }) {
    const router = Router();

    router.use(asyncRoute(async (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        const user = await authenticate(req);
        if (!user) return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn.' });
        if (user.role !== 'admin') return res.status(403).json({ error: 'Bạn không có quyền truy cập khu vực quản trị.' });
        req.admin = user;
        next();
    }));

    router.get('/stats', asyncRoute(async (req, res) => {
        const bins = await listBins();
        const config = publicConfig();
        res.json({
            bins: {
                total: bins.length,
                recyclable: bins.filter(b => b.recyclable).length,
                byStatus: tally(bins, b => b.status),
                byDistrict: tally(bins, b => b.district),
                byType: tally(bins, b => b.type)
            },
            fleet: { activeTrucks: activeTruckCount() },
            users: await userStats(),
            system: {
                database: getPool() ? 'postgres' : 'json-file',
                routing: config.routingConfigured,
                cv: config.cvEnabled,
                vision: config.geminiConfigured,
                googleLogin: Boolean(env.googleClientId),
                uptimeSeconds: Math.round(process.uptime()),
                nodeEnv: env.nodeEnv
            },
            generatedAt: new Date().toISOString()
        });
    }));

    router.get('/users', asyncRoute(async (req, res) => {
        const users = await listUsers(100);
        res.json({
            users: users.map(u => ({
                id: u.id,
                email: u.email,
                name: u.name,
                role: u.role,
                method: [u.passwordHash && 'email', u.googleId && 'google'].filter(Boolean),
                createdAt: u.createdAt
            }))
        });
    }));

    // eslint-disable-next-line no-unused-vars
    router.use((err, req, res, next) => {
        if (err instanceof AuthError) return res.status(err.status).json({ error: err.message });
        next(err);
    });

    return router;
}
