// ============================================================
// Tạo tài khoản admin đăng nhập bằng email + mật khẩu (cần DATABASE_URL).
// Email/mật khẩu đọc từ biến môi trường để không lưu vào lịch sử lệnh của shell:
//   ADMIN_EMAIL=email@example.com ADMIN_PASSWORD=... npm run create-admin
// Chưa có tài khoản → tạo mới với role admin.
// Đã có tài khoản  → chỉ cấp quyền admin, KHÔNG đổi mật khẩu cũ.
// ============================================================

import { env } from '../src/config/env.js';
import { closePool } from '../src/db/pool.js';
import { createUser, findUserByEmail, setUserRole } from '../src/repositories/users.js';
import { hashPassword, normalizeEmail, validateCredentials } from '../src/services/auth.js';

const email = normalizeEmail(process.env.ADMIN_EMAIL);
const password = process.env.ADMIN_PASSWORD ?? '';
const name = String(process.env.ADMIN_NAME ?? '').trim().slice(0, 80);

try {
    if (!env.databaseUrl) throw new Error('Chưa đặt DATABASE_URL: không có database để lưu tài khoản admin.');
    if (!email) throw new Error('Cách dùng: ADMIN_EMAIL=email@example.com ADMIN_PASSWORD=... npm run create-admin');

    const existing = await findUserByEmail(email);
    if (existing) {
        if (existing.role !== 'admin') await setUserRole(existing.id, 'admin');
        console.log(`✔ ${email} đã có tài khoản, hiện có role "admin" (mật khẩu giữ nguyên).`);
    } else {
        validateCredentials(email, password);
        const user = await createUser({ email, passwordHash: await hashPassword(password), name, role: 'admin' });
        if (!user) throw new Error(`Không tạo được ${email} (có thể vừa được đăng ký song song), hãy chạy lại.`);
        console.log(`✔ Đã tạo tài khoản admin ${email}. Đăng nhập tại /login rồi vào /admin.`);
    }
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    await closePool();
}
