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
