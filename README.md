# BinGo · Mỗi chuyến xe, thêm một góc xanh

Bảng điều phối mô phỏng thu gom rác tại Hà Nội: Vite + Leaflet + VIETMAP ở frontend,
Express + PostgreSQL ở backend, phân tích ảnh thùng rác bằng computer vision (YOLOv8 ONNX, Gemini chỉ dự phòng),
app mobile React Native (Expo) cho nhân viên thu gom.

```
BinGo/
├── frontend/          Vite · host trên Vercel
│   ├── index.html     Landing page            → /
│   ├── map.html       Bản đồ điều phối        → /map
│   ├── login.html     Đăng nhập / đăng ký     → /login
│   ├── admin.html     Trang quản trị          → /admin
│   ├── src/landing/, src/auth/, src/admin/   JS/CSS từng trang
│   ├── src/js, src/styles   ứng dụng bản đồ
│   └── vercel.json
├── mobile-expo/       App Android/iOS (Expo SDK 57) — xem mobile-expo/README.md
├── backend/           Express API · host trên Render
│   ├── src/app.js     Định nghĩa route /api/*
│   ├── src/routes/    Router con (admin)
│   ├── src/config/    Đọc biến môi trường
│   ├── src/db/        Kết nối PostgreSQL
│   ├── src/repositories/   Truy vấn dữ liệu (điểm thu gom, người dùng)
│   ├── src/services/  VIETMAP Route v4, CV (ONNX) + Gemini, đăng nhập, vị trí xe, rate limit
│   ├── models/trashscan8s.onnx   Mô hình YOLOv8 (~44 MB, commit thẳng vào repo)
│   ├── db/schema.sql  Lược đồ bảng (trash_bins, users)
│   ├── scripts/       db-setup.js (tạo bảng + seed), make-admin.js
│   └── data/*.json    Dữ liệu mẫu (seed)
├── trash-map/         Bản cũ (Flask + Vite), chỉ để tham khảo, không còn được triển khai
└── render.yaml        Blueprint cho Render
```

## Chạy tại máy

Cần Node.js ≥ 20. Mở hai terminal:

```bash
cd backend
cp .env.example .env      # điền khóa VIETMAP (Gemini / Google tùy chọn)
npm install
npm run dev               # http://localhost:3000
```

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173  (proxy /api → :3000)
```

Không đặt `DATABASE_URL` thì backend đọc thẳng `backend/data/*.json`, không cần cài Postgres.
Khi đó tài khoản người dùng chỉ lưu trong bộ nhớ và **mất khi restart server**; không đặt
`AUTH_SECRET` ở dev thì token cũng mất hiệu lực sau mỗi lần restart.

App mobile: xem [mobile-expo/README.md](mobile-expo/README.md).

## Triển khai

### 1. Database — PostgreSQL (Neon / Supabase / Render Postgres)

1. Tạo database, lấy chuỗi kết nối dạng `postgres://user:pass@host/db?sslmode=require`.
2. Tại máy, đặt `DATABASE_URL` trong `backend/.env` rồi chạy một lần:

   ```bash
   cd backend
   npm run db:setup
   ```

   Lệnh tạo bảng `trash_bins`, `users` và upsert 350 điểm mẫu; chạy lại nhiều lần vẫn an toàn.
3. Cấp quyền admin cho một tài khoản đã đăng ký: `npm run make-admin -- email@x.com`
   (hoặc đặt `ADMIN_EMAILS` và đăng nhập bằng Google).

### 2. Backend — Render

- **New → Blueprint** và chọn repo (dùng `render.yaml`, Render tự sinh `AUTH_SECRET`), hoặc
  **New → Web Service** với Root Directory `backend`, Build `npm ci`, Start `npm start`,
  Health check `/api/health`.
- Khai báo biến môi trường:

| Biến | Ý nghĩa |
| --- | --- |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL |
| `DATABASE_SSL` | `true` cho DB trên cloud (mặc định), `false` cho Postgres local |
| `CORS_ORIGINS` | Domain frontend, cách nhau dấu phẩy, vd `https://bingo.vercel.app` (app mobile gọi qua HTTP native nên không cần thêm) |
| `VIETMAP_TILEMAP_KEY` | Khóa Tilemap (công khai, giới hạn theo domain) |
| `VIETMAP_SERVICES_KEY` | Khóa Services có quyền Route v4 (bí mật) |
| `VIETMAP_VEHICLE` | `car` (mặc định) hoặc `truck` |
| `VIETMAP_TRUCK_WEIGHT_KG` | Bắt buộc khi `truck` |
| `AUTH_SECRET` | **Bắt buộc ở production** — thiếu thì server không khởi động. Chuỗi ngẫu nhiên dài để ký token |
| `AUTH_TOKEN_DAYS` | Thời hạn phiên đăng nhập (ngày, mặc định 7) |
| `GOOGLE_CLIENT_ID` | OAuth client ID (Web) cho nút đăng nhập Google; để trống = ẩn nút |
| `ADMIN_EMAILS` | Email Google được cấp quyền admin, cách nhau dấu phẩy |
| `CV_MODEL_PATH` | Đường dẫn mô hình ONNX khác (mặc định `models/trashscan8s.onnx`) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Dự phòng khi CV lỗi / không đủ tin cậy; để trống = tắt |

Kiểm tra: `https://<tên-service>.onrender.com/api/health` → `{"status":"ok","database":"postgres"}`.
Gói free của Render ngủ sau 15 phút không dùng; lần gọi đầu tiên có thể mất ~50 giây, và lần
phân tích ảnh đầu tiên sau khi thức dậy mất thêm vài giây để nạp mô hình ONNX.

### 3. Frontend — Vercel

- **Add New → Project**, chọn repo, **Root Directory = `frontend`** (Vercel tự nhận Vite).
- Environment Variable: `VITE_API_URL=https://<tên-service>.onrender.com` (không có `/` cuối).
  Biến này được gắn vào lúc build: đổi giá trị thì phải **Redeploy**.
  `SITE_URL` (tùy chọn) đặt domain tuyệt đối cho thẻ `og:image`; trên Vercel tự lấy domain production.
- Sau khi có domain Vercel, thêm domain đó vào `CORS_ORIGINS` trên Render, vào danh sách
  domain được phép của **Tilemap key** trong tài khoản VIETMAP, và vào *Authorized JavaScript
  origins* của Google OAuth client (nếu dùng đăng nhập Google).

## API

| Method | Path | Mô tả |
| --- | --- | --- |
| GET | `/api/health` | Trạng thái server + DB |
| GET | `/api/map-config` | Tilemap key, cờ sẵn sàng tìm đường / CV / Gemini (không lộ Services key) |
| GET | `/api/trash-bins` | Danh sách điểm thu gom |
| POST | `/api/road-route` | `{"bin_ids":["HN-0001",…]}` (1–100 ID) → tuyến VIETMAP Route v4 |
| POST | `/api/directions` | `{"from":{"lat","lon"},"to_bin_id":"HN-0001"}` → chỉ đường từng bước (app mobile) |
| POST | `/api/analyze-waste-image` | `{"image":"data:image/jpeg;base64,…","bin_id":"HN-0001"}` → kết quả CV (Gemini dự phòng) |
| POST | `/api/fleet/positions` | `{"trucks":[{"id","name","color","lat","lon"}]}` — bảng điều phối phát vị trí xe |
| GET | `/api/fleet/nearby?lat=&lon=&radius=` | Xe trong bán kính 50–5000 m |
| GET | `/api/auth/config` | Google client ID (nếu có) |
| POST | `/api/auth/register` | `{"email","password","name"}` → `{token,user}` |
| POST | `/api/auth/login` | `{"email","password"}` → `{token,user}` |
| POST | `/api/auth/google` | `{"credential":"<Google ID token>"}` → `{token,user}` |
| GET | `/api/auth/me` | `Authorization: Bearer <token>` → người dùng hiện tại |
| GET | `/api/admin/stats`, `/api/admin/users` | Chỉ admin: thống kê hệ thống, danh sách người dùng |

Lỗi dữ liệu vào trả HTTP 400; sai/hết phiên 401; thiếu quyền 403; gọi quá nhanh 429;
lỗi nhà cung cấp/cấu hình trả 503.

## Kiểm tra

```bash
cd backend && npm test
cd frontend && npm test
cd mobile-expo && npm test
```

Test chạy mô hình ONNX thật tự bỏ qua nếu thiếu file `backend/models/trashscan8s.onnx`.

## Bảo mật

- Không commit `.env`. Services key, Gemini key và `AUTH_SECRET` chỉ nằm trên backend.
- Tilemap key **luôn** hiện ở trình duyệt; hãy giới hạn domain trong tài khoản VIETMAP.
- Mật khẩu băm bằng scrypt; token phiên ký HMAC, quyền admin đọc lại từ DB ở mỗi request.
- Có rate limit theo IP (chung 300/phút, `/api/road-route` · `/api/directions` ·
  `/api/analyze-waste-image` 20/phút, đăng nhập 30/15 phút và 10/15 phút theo email).
  Rate limit lưu trong bộ nhớ một tiến trình.
- Các API bản đồ, chỉ đường, phân tích ảnh và **phát vị trí xe** vẫn chưa yêu cầu đăng nhập.
  Trước khi công khai rộng, nên bắt buộc token cho `/api/fleet/positions` (ai cũng có thể gửi xe giả)
  và cho hai endpoint tốn hạn mức trả phí.

## Dữ liệu

`backend/data/*.json` là **dữ liệu mẫu**: vị trí, trạng thái và đội xe không phải GPS thật.
Xe chạy 30 km/h theo thời gian mô phỏng; tuyến đường lấy từ VIETMAP Route v4.

## Thông báo "xe thu gom gần bạn"

- Bảng điều phối web (đang chạy mô phỏng) gửi vị trí xe mỗi giây tới `POST /api/fleet/positions`
  (tối đa 100 xe mỗi lần).
- Web (`/map`, thẻ **Xe gần bạn**) và app mobile (nút chuông) gọi
  `GET /api/fleet/nearby` mỗi 3 giây, báo khi có xe vừa vào bán kính.
- Vị trí xe chỉ lưu trong bộ nhớ một tiến trình, tự xóa sau 30 giây không cập nhật; chạy nhiều
  worker cần Redis/DB.
- Thời gian dự kiến tính theo tốc độ giả định 30 km/h theo đường chim bay. Thông báo chỉ hiện khi
  trang/app đang mở (chưa có push nền).

## Ghi chú cho repo

- `.gitattributes` chuẩn hóa xuống dòng LF và đánh dấu file nhị phân (`*.onnx`, ảnh, font).
  Sau khi thêm lần đầu, chạy `git add --renormalize .` một lần để đồng bộ index.
- `backend/models/trashscan8s.onnx` (~44 MB) được commit như file nhị phân thường (dưới giới hạn
  100 MB của GitHub) để Render có sẵn mô hình khi build mà không cần Git LFS. Khi thay mô hình,
  hãy cân nhắc tải từ URL lúc build thay vì commit thêm bản mới (mỗi bản làm repo nặng thêm ~44 MB).
