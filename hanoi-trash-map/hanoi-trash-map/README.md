# BinGo thu gom rác thông minh

Website bản đồ các điểm thùng rác công cộng tại Hà Nội.

## Công nghệ

- Python
- Flask
- HTML/CSS/JavaScript
- Leaflet.js
- OpenStreetMap
- JSON

## 1. Tạo môi trường ảo

Windows:

```bash
python -m venv venv
venv\Scripts\activate
```

Linux/macOS:

```bash
python3 -m venv venv
source venv/bin/activate
```

## 2. Cài thư viện

```bash
pip install -r requirements.txt
```

## 3. Chạy project

```bash
python app.py
```

Mở trình duyệt:

```text
http://127.0.0.1:5000
```

## 4. Thêm dữ liệu

Chỉnh sửa:

```text
data/trash_bins.json
```

Mỗi điểm có:

- id
- name
- latitude
- longitude
- district
- type
- status
- recyclable
- address
- updated

## Lưu ý dữ liệu

Các tọa độ trong project là dữ liệu mẫu phục vụ phát triển giao diện.
Không nên xem chúng là vị trí thùng rác thực tế nếu chưa được xác minh.

## API

Project có endpoint:

```text
GET /api/trash-bins
```

Endpoint trả về toàn bộ dữ liệu thùng rác dưới dạng JSON.

## Tuyến xe theo đường thực tế

Xe lấy tuyến ô tô từ OSRM trên mạng đường OpenStreetMap. Thứ tự ghé các
thùng rác vẫn được chia theo khu vực và sắp xếp gần nhất; thuật toán này
chỉ chọn thứ tự điểm dừng, không dùng các đoạn thẳng nối điểm làm đường xe.
Hình học đầy đủ của từng chặng vừa được vẽ trên Leaflet vừa dùng để di chuyển xe.
Xe thu gom đúng các điểm được phân công khi đi tới điểm dừng trên tuyến.

```text
POST /api/road-route
Content-Type: application/json

{"bin_ids": ["HN-0001", "HN-0002"]}
```

API nhận 1–100 ID khác nhau từ dữ liệu của dự án, trả về `geometry`
(các cặp latitude/longitude), `stops` (ID thùng, chỉ số điểm trên tuyến,
khoảng cách từ thùng đến đường), `source` và `profile`.
Tọa độ thùng không bị thay đổi; xe ghé điểm trên đường cách thùng tối đa 300 m.
Điểm mẫu quá xa đường, tuyến không kết nối được hoặc mất mạng sẽ báo lỗi cho
xe tương ứng. Không vẽ đường thẳng thay thế. Các tuyến hợp lệ vẫn chạy được;
nút **Tải lại tuyến lỗi** thử lại những tuyến lỗi, giữ tiến độ các xe khác
và để mô phỏng tạm dừng đến khi nhấn **Bắt đầu**.

Mặc định máy chủ dùng `https://router.project-osrm.org`, không cần API key.
Tọa độ các điểm được gửi tới dịch vụ này để tìm đường. Cần kết nối Internet.
Các yêu cầu được gửi tuần tự, cách nhau ít nhất 1,1 giây và lưu cache trong
bộ nhớ 1 giờ (tối đa 256 tuyến). Lần đầu tải 53 tuyến mất khoảng một phút
hoặc lâu hơn tùy mạng; nút chạy được khóa trong lúc tải.
Khi dùng lâu dài/nhiều người, cấu hình máy chủ OSRM riêng có dữ liệu Hà Nội:

```powershell
$env:OSRM_BASE_URL = "http://localhost:5001"
python app.py
```

Profile `driving` tính đường ô tô theo dữ liệu OSM, bao gồm hướng lưu thông
mà dữ liệu/profile hỗ trợ; **không bảo đảm hạn chế riêng của xe tải** như
tải trọng, chiều cao, giờ cấm hoặc tình trạng giao thông hiện tại. Bản đồ nền
Esri có thể khác thời điểm cập nhật so với OSM. Vị trí thùng rác, xe và trạng
thái thu gom vẫn là mô phỏng, không phải GPS thực tế.

Xe chạy ở 30 km/h theo thời gian mô phỏng. Mỗi nhịp 100 ms tương ứng 1 giây
mô phỏng ở 1×; 2×/5×/10× tăng thời gian mô phỏng tương ứng. Tiến độ tính theo
quãng đường, không theo số đỉnh hình học, nên đoạn đường ngắn và khúc cua
không làm sai tốc độ. Reset dùng lại tuyến đã tải.

## Kiểm tra

Từ thư mục chứa `app.py` (Python đã cài requirements và Node.js có sẵn):

```bash
python -m unittest discover -s tests -v
node --test tests/*.test.js
```

Các kiểm tra bao gồm tuyến rẽ, vượt nhiều đoạn ngắn ở tốc độ cao, điểm
dừng trùng nhau, reset, dữ liệu không hợp lệ, cache, mất kết nối và không
sử dụng đường nối thẳng khi dịch vụ lỗi.

Tham khảo: [OSRM HTTP API](https://project-osrm.org/docs/v5.24.0/api/).
