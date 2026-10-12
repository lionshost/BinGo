# BinGo · Mỗi chuyến xe, thêm một góc xanh

Bảng điều phối mô phỏng thu gom rác tại Hà Nội: Vite + Leaflet + VIETMAP ở frontend,
Express + PostgreSQL ở backend, phân tích ảnh thùng rác bằng Gemini Vision.

```
BinGo/
├── frontend/          Vite · host trên Vercel
│   ├── index.html     Landing page            → /
│   ├── map.html       Bản đồ điều phối        → /map
│   ├── src/landing/   JS/CSS của landing
│   ├── src/js, src/styles   ứng dụng bản đồ
│   └── vercel.json
├── backend/           Express API · host trên Render
│   ├── src/app.js     Định nghĩa route /api/*
│   ├── src/config/    Đọc biến môi trường
│   ├── src/db/        Kết nối PostgreSQL
│   ├── src/repositories/   Truy vấn dữ liệu
│   ├── src/services/  VIETMAP Route v4, Gemini Vision
│   ├── db/schema.sql  Lược đồ bảng
│   ├── scripts/db-setup.js  Tạo bảng + nạp dữ liệu mẫu
│   └── data/*.json    Dữ liệu mẫu (seed)
└── render.yaml        Blueprint cho Render
```

## Chạy tại máy

Cần Node.js ≥ 20. Mở hai terminal:

```bash
cd backend
cp .env.example .env      # điền khóa VIETMAP / Gemini
npm install
npm run dev               # http://localhost:3000
```

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173  (proxy /api → :3000)
```

Không đặt `DATABASE_URL` thì backend đọc thẳng `backend/data/*.json`, không cần cài Postgres.

## Triển khai

### 1. Database — PostgreSQL (Neon / Supabase / Render Postgres)

1. Tạo database, lấy chuỗi kết nối dạng `postgres://user:pass@host/db?sslmode=require`.
2. Tại máy, đặt `DATABASE_URL` trong `backend/.env` rồi chạy một lần:

   ```bash
   cd backend
   npm run db:setup
   ```

   Lệnh tạo bảng `trash_bins` và upsert 350 điểm mẫu; chạy lại nhiều lần vẫn an toàn.

### 2. Backend — Render

- **New → Blueprint** và chọn repo (dùng `render.yaml`), hoặc **New → Web Service** với
  Root Directory `backend`, Build `npm ci`, Start `npm start`, Health check `/api/health`.
- Khai báo biến môi trường:

| Biến | Ý nghĩa |
| --- | --- |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL |
| `DATABASE_SSL` | `true` cho DB trên cloud (mặc định), `false` cho Postgres local |
| `CORS_ORIGINS` | Domain frontend, cách nhau dấu phẩy, vd `https://bingo.vercel.app` |
| `VIETMAP_TILEMAP_KEY` | Khóa Tilemap (công khai, giới hạn theo domain) |
| `VIETMAP_SERVICES_KEY` | Khóa Services có quyền Route v4 (bí mật) |
| `VIETMAP_VEHICLE` | `car` (mặc định) hoặc `truck` |
| `VIETMAP_TRUCK_WEIGHT_KG` | Bắt buộc khi `truck` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Phân tích ảnh thùng rác |

Kiểm tra: `https://<tên-service>.onrender.com/api/health` → `{"status":"ok","database":"postgres"}`.
Gói free của Render ngủ sau 15 phút không dùng; lần gọi đầu tiên có thể mất ~50 giây.

### 3. Frontend — Vercel

- **Add New → Project**, chọn repo, **Root Directory = `frontend`** (Vercel tự nhận Vite).
- Environment Variable: `VITE_API_URL=https://<tên-service>.onrender.com` (không có `/` cuối).
  Biến này được gắn vào lúc build: đổi giá trị thì phải **Redeploy**.
- Sau khi có domain Vercel, thêm domain đó vào `CORS_ORIGINS` trên Render, và vào danh sách
  domain được phép của **Tilemap key** trong tài khoản VIETMAP.

## API

| Method | Path | Mô tả |
| --- | --- | --- |
| GET | `/api/health` | Trạng thái server + DB |
| GET | `/api/map-config` | Tilemap key, cờ sẵn sàng tìm đường (không lộ Services key) |
| GET | `/api/trash-bins` | Danh sách điểm thu gom |
| POST | `/api/road-route` | `{"bin_ids":["HN-0001",…]}` (1–100 ID) → tuyến VIETMAP Route v4 |
| POST | `/api/analyze-waste-image` | `{"image":"data:image/jpeg;base64,…","bin_id":"HN-0001"}` → kết quả Gemini |

Lỗi dữ liệu vào trả HTTP 400; lỗi nhà cung cấp/cấu hình trả 503.

## Kiểm tra

```bash
cd backend && npm test
cd frontend && npm test
```

## Bảo mật

- Không commit `.env`. Services key và Gemini key chỉ nằm trên backend.
- Tilemap key **luôn** hiện ở trình duyệt; hãy giới hạn domain trong tài khoản VIETMAP.
- API chưa có đăng nhập hay giới hạn lượt gọi theo người dùng. Trước khi công khai rộng,
  nên thêm xác thực và rate limit cho `/api/road-route` và `/api/analyze-waste-image`
  (hai endpoint này tốn hạn mức trả phí).

## Dữ liệu

`backend/data/*.json` là **dữ liệu mẫu**: vị trí, trạng thái và đội xe không phải GPS thật.
Xe chạy 30 km/h theo thời gian mô phỏng; tuyến đường lấy từ VIETMAP Route v4.
