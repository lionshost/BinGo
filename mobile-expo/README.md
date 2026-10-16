# BinGo · App mobile (React Native + Expo)

App Android/iOS native cho nhân viên thu gom, dùng chung backend Express với bản web.
**Expo SDK 57 · React Native 0.86 · expo-router · MapLibre + VIETMAP.**

| Tab | Chức năng |
| --- | --- |
| **Bản đồ** | 350 điểm thu gom vẽ bằng GPU (MapLibre), tìm kiếm không dấu, lọc theo trạng thái, định vị GPS, bottom sheet kéo-để-đóng: chỉ đường + dẫn đường ngay trong app (VIETMAP Route v4: banner từng bước rẽ, camera bám GPS, tự tìm lại đường khi lệch tuyến, báo tới nơi), chụp kiểm tra, đánh dấu đã thu |
| **Tuyến** | Lập tuyến từ vị trí hiện tại qua 3–20 điểm đầy/tràn gần nhất (ưu tiên điểm tràn), đường bộ VIETMAP Route v4, tích đã thu, badge số điểm còn lại trên tab |
| **Chụp ảnh** | Camera / thư viện → thu nhỏ ≤1280px → backend nhận diện bằng computer vision (YOLOv8 ONNX, Gemini dự phòng) đánh giá mức đầy, loại rác; cập nhật trạng thái điểm |
| **Phân loại** | 4 nhóm rác, dùng chung `frontend/src/js/config/waste-taxonomy.js` (qua `metro.config.js`) |

Thành phần native: thanh tab native (`NativeTabs` — Material 3 trên Android, UITabBar trên iOS),
MapLibre GL native, `@gorhom/bottom-sheet`, haptics, quyền camera/vị trí xin đúng lúc,
font Be Vietnam Pro nhúng sẵn, lưu offline bằng AsyncStorage.

## Cấu trúc

```
src/
├── app/                 Màn hình (expo-router)
│   ├── _layout.tsx      Thanh tab native + provider
│   ├── index.tsx        Bản đồ
│   ├── route.tsx        Tuyến
│   ├── scan.tsx         Chụp ảnh AI
│   └── guide.tsx        Phân loại
├── components/          bin-sheet (bottom sheet), ui (Text, Button, Pill, Toast)
└── lib/                 api, store (React context), bins (logic thuần), theme, taxonomy
tests/                   Unit test cho lib/bins.ts
```

## Chạy khi phát triển

Bản đồ đầy đủ nhất dùng MapLibre native — cần *development build*. Trong **Expo Go** app vẫn hiện
bản đồ (VIETMAP GL JS trong WebView, `src/components/web-map.tsx`) với cùng nền, điểm và tuyến.
Cần Node ≥ 22, Android Studio (JDK 21, SDK 36).

```bash
cd mobile-expo
npm install
cp .env.example .env          # EXPO_PUBLIC_API_URL=https://<backend>.onrender.com
npx expo run:android          # build dev client, cài lên máy ảo/điện thoại, bật Metro (sửa code là thấy ngay)
```

iOS cần máy Mac + Xcode: `npx expo run:ios`.

Trỏ về backend local: Android emulator dùng `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`
(cần bật cleartext cho bản debug), điện thoại thật dùng IP LAN của máy tính.

## Build bản cài đặt

**Cách 1 — EAS Build (đám mây, khuyên dùng để phát hành):**

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview      # APK để cài thử
npx eas-cli@latest build -p android --profile production   # AAB cho Google Play
npx eas-cli@latest build -p ios                            # cần tài khoản Apple Developer
```

**Cách 2 — build tại máy (Android):**

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease     # → android/app/build/outputs/apk/release/app-release.apk
```

Bản release tại máy đang ký bằng debug keystore — chỉ để cài thử. Lên Google Play phải ký bằng
keystore riêng (EAS tự quản lý giúp). Thư mục `android/`, `ios/` là sinh tự động (CNG), không sửa tay;
cấu hình native qua `app.json`.

## Kiểm tra

```bash
npx tsc --noEmit && npx expo lint && npm test && npx expo-doctor
```

## Lưu ý

- **Bản đồ:** dùng style vector VIETMAP với Tilemap key lấy từ `/api/map-config`. Nếu key bị từ chối
  (giới hạn domain/hạn mức), app tự chuyển sang nền OpenStreetMap.
- **Đã thu / trạng thái từ ảnh** hiện chỉ lưu trên máy (backend chưa có API ghi). Muốn đồng bộ cho
  cả đội cần thêm endpoint ghi + đăng nhập ở backend.
- **Phân tích ảnh** cần `GEMINI_API_KEY` trên backend.
- Không cần thêm origin vào `CORS_ORIGINS`: app native không bị CORS.
