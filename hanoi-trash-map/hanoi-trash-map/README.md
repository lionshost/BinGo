# BinGo · Mỗi chuyến xe, thêm một góc xanh

Bảng điều phối mô phỏng thu gom rác tại Hà Nội: Flask, Leaflet và VIETMAP.
Nền bản đồ lấy từ **VIETMAP Tilemap**; đường ô tô lấy từ **VIETMAP Route v4**.
Không dùng Google Maps, OSRM hay nền OpenStreetMap/Esri dự phòng.

## Chạy tại máy

Từ thư mục chứa `app.py`:

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Linux/macOS dùng `source venv/bin/activate`. Mở http://127.0.0.1:5000.
Không cần khóa để xem giao diện, tìm kiếm, bộ lọc và dữ liệu mẫu.
Nếu thiếu khóa, bản đồ hiện hướng dẫn kết nối, các nút tải tuyến/chạy bị khóa.

## Kết nối VIETMAP

1. Tạo tài khoản tại [VIETMAP Maps](https://maps.vietmap.vn/console-v2/register).
2. Trong tài khoản, lấy **hai khóa đúng loại**:
   - **Tilemap key** để tải nền vector ở trình duyệt. Giới hạn tên miền được phép,
     bao gồm tên miền phát triển của bạn và tên miền triển khai thực tế.
   - **Services key** có quyền Route v4, chỉ đặt trên máy chủ.
3. Sao chép `config.example.json` thành `config.local.json`, cùng thư mục `app.py`,
   rồi điền khóa tại máy của bạn. File riêng này đã được bỏ qua bởi Git.
   Không gửi khóa bí mật trong chat, ảnh chụp, commit hoặc pull request.
4. Tải lại trang. Khi bản đồ kết nối thành công, bấm **Tải tuyến VIETMAP**, sau đó
   **Bắt đầu**. Mỗi lần tải tuyến có thể tiêu thụ hạn mức dịch vụ.

Có thể dùng biến môi trường thay file; biến môi trường được ưu tiên:

| Cấu hình | Ý nghĩa |
| --- | --- |
| `VIETMAP_TILEMAP_KEY` | Khóa Tilemap công khai có giới hạn tên miền |
| `VIETMAP_SERVICES_KEY` | Khóa Services bí mật trên máy chủ |
| `VIETMAP_VEHICLE` | `car` (mặc định) hoặc `truck` |
| `VIETMAP_TRUCK_WEIGHT_KG` | Khối lượng toàn bộ xe, đơn vị kg, bắt buộc với `truck` |

Ứng dụng không tự đọc file `.env`. Sau khi đổi biến môi trường, khởi động lại
máy chủ; với `config.local.json`, tải lại trang để nhận cấu hình trình duyệt mới.
Trình duyệt cần WebGL, Internet và truy cập được CDN Leaflet/VIETMAP.
Bốn kiểu nền: sáng, đường phố, vệ tinh có nhãn và tối.

**Xe tải:** hiện chưa có tải trọng thực tế của đội xe, vì vậy mặc định là
đường ô tô `car`. Chỉ dùng `truck` khi đã nhập đúng khối lượng toàn bộ xe.
Cấu hình này áp dụng cho cả đội xe, chưa hỗ trợ thông số riêng từng xe.
Không coi mô phỏng là hướng dẫn vận hành thực địa: cần kiểm tra biển báo,
giờ cấm, kích thước xe và điều kiện đường thực tế.

## Luồng tải bản đồ và tuyến

- Flask đưa Tilemap key và trạng thái cấu hình (không đưa Services key) vào trang.
- Trình duyệt dùng SDK VIETMAP GL và cầu nối Leaflet để tải vector style trực tiếp
  từ `maps.vietmap.vn/maps/styles/{lm|tm|hm|dm}/style.json`.
- Chỉ khi người dùng bấm tải tuyến, trình duyệt gửi ID các điểm được phân công
  đến `POST /api/road-route`. Máy chủ kiểm tra ID/tọa độ, dùng Services key gọi
  `https://maps.vietmap.vn/api/route/v4`, với từng `point=latitude,longitude`.
- Máy chủ giải mã polyline5; dùng chỉ số hướng dẫn ghé điểm trung gian để xác định
  đúng điểm dừng cả trên tuyến vòng/đường tự cắt. Tuyến trả về được dùng chung
  cho đường vẽ và chuyển động xe, không nội suy đường thẳng giữa thùng rác.
- Điểm nằm cách đường ô tô hơn 300 m, lỗi khóa, hạn mức, mạng hoặc dữ liệu tuyến
  không hợp lệ được báo theo từng xe; không có đường thẳng thay thế.
  **Tải lại tuyến lỗi** giữ tiến độ xe đã có tuyến hợp lệ.
- Yêu cầu gửi tuần tự, cách nhau tối thiểu 250 ms ở một tiến trình máy chủ.
  Mở trang không tự gọi Route API. Reset dùng lại tuyến đang giữ trong trình duyệt,
  không lưu cache tuyến lâu dài. 53 xe có thể tạo tới 53 yêu cầu cho một lượt tải;
  số điểm mỗi yêu cầu còn phụ thuộc gói VIETMAP.

## API nội bộ

- `GET /api/trash-bins`: dữ liệu điểm thu gom.
- `GET /api/map-config`: provider, Tilemap key, loại xe và cờ sẵn sàng tìm đường.
- `POST /api/road-route`: JSON `{"bin_ids":["HN-0001","HN-0002"]}`,
  nhận 1–100 ID khác nhau trong dữ liệu dự án (không gồm điểm hỏng).
  Trả `geometry` (latitude/longitude), `stops` (ID, chỉ số trên tuyến, khoảng
  cách tới đường), `source`, `profile`, `fetched_at`.
  Dữ liệu đầu vào lỗi: HTTP 400; nhà cung cấp/cấu hình lỗi: HTTP 503.

## Bảo mật và triển khai

Services key không xuất hiện trong HTML, cấu hình công khai hay lỗi API trả
về. Tilemap key **phải** được trình duyệt nhìn thấy; giới hạn tên miền/quyền/hạn
mức bằng tài khoản VIETMAP, không coi nó như khóa backend.
Các tọa độ mẫu được gửi tới VIETMAP để tìm đường; không thêm dữ liệu cá nhân
hoặc vị trí nhạy cảm khi chưa được phép.

Đây vẫn là ứng dụng chạy nội bộ, **chưa có đăng nhập hay giới hạn theo người dùng**.
Trước khi mở ra Internet: thêm xác thực/ủy quyền cho API tính phí, giới hạn lượt
gọi theo người dùng, bảo vệ CSRF nếu dùng cookie, đặt ngân sách/cảnh báo hạn mức,
tắt Flask debug và dùng máy chủ production. Khóa/throttle nội bộ không thay thế
rate limiting cho triển khai nhiều worker. Không log URL upstream chứa khóa.

## Giao diện và dữ liệu

Thẻ tổng quan màu pastel, vòng tiến độ, bộ lọc nhanh (ưu tiên/đã thu gom/hỏng),
tìm kiếm theo điểm/địa chỉ, chọn khu vực, lớp bản đồ và thẻ xe có thể chọn bằng
chuột hoặc bàn phím. Bố cục co giãn cho máy tính/điện thoại; hỗ trợ giảm chuyển động.
Trạng thái chưa kết nối và hộp hướng dẫn không giả lập nền bản đồ đã tải.

`data/trash_bins.json` và `data/thanh_xuan_bins.json` vẫn là **dữ liệu mẫu**;
xe, trạng thái thu gom và vị trí không phải GPS trực tiếp. Tên quận trong dữ
liệu mẫu chưa phải dữ liệu địa giới hành chính đã được xác minh.
Nền/tuyến dùng dữ liệu mới nhất khả dụng do VIETMAP cung cấp, không bảo đảm
mọi thay đổi ngoài thực địa đã cập nhật ngay. Đổi nền bản đồ không xác minh
hoặc thay thế dữ liệu thùng rác.

Xe chạy 30 km/h theo thời gian mô phỏng. Mỗi nhịp 100 ms tương ứng 1 giây
mô phỏng ở 1×; 2×/5×/10× tăng tương ứng. Tiến độ dựa trên quãng đường.

## Kiểm tra

```powershell
python -m unittest discover -s tests -v
node --test tests/app.test.js tests/road-routing.test.js
```

Kiểm tra offline dùng dữ liệu phản hồi giả lập: polyline, góc rẽ, điểm trùng,
tuyến vòng, điểm xa đường, thiếu/không hợp lệ key, tải trọng, lỗi/hạn mức nhà
cung cấp, không lộ Services key, retry, reset và không gọi tuyến khi chưa
kết nối. Cần kiểm tra thêm bản đồ/tuyến thật với tài khoản VIETMAP có quyền
phù hợp trước khi dùng thực tế; chưa có khóa trong lần phát triển này.

Tài liệu chính thức:
[Tilemap](https://maps.vietmap.vn/docs/map-api/tilemap/),
[Leaflet](https://maps.vietmap.vn/docs/map-api/tilemap-leaflet/),
[Route v4](https://maps.vietmap.vn/docs/map-api/route-version/route-v4/),
[quản lý khóa](https://maps.vietmap.vn/docs/map-api/console/register-api-key/).
