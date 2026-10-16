// ============================================================
// Cấp / thu hồi quyền admin theo email (cần DATABASE_URL, user phải đã đăng ký).
//   npm run make-admin -- email@example.com
//   npm run make-admin -- email@example.com --revoke
// ============================================================

import { env } from '../src/config/env.js';
import { closePool } from '../src/db/pool.js';
import { findUserByEmail, setUserRole } from '../src/repositories/users.js';
import { normalizeEmail } from '../src/services/auth.js';

const email = normalizeEmail(process.argv[2]);
const role = process.argv.includes('--revoke') ? 'user' : 'admin';

try {
    if (!env.databaseUrl) throw new Error('Chưa đặt DATABASE_URL: không có database để lưu quyền admin.');
    if (!email) throw new Error('Cách dùng: npm run make-admin -- email@example.com [--revoke]');
    const user = await findUserByEmail(email);
    if (!user) throw new Error(`Chưa có tài khoản ${email}. Hãy đăng ký/đăng nhập trước.`);
    await setUserRole(user.id, role);
    console.log(`✔ ${email} hiện có role "${role}".`);
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    await closePool();
}
