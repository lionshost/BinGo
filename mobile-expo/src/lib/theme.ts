import { Platform } from 'react-native';

export const C = {
  ink: '#193d34',
  muted: '#6b8279',
  green: '#178760',
  deep: '#116347',
  greenSoft: '#e3f3ea',
  line: '#e2ebe5',
  surface: '#ffffff',
  canvas: '#f6f8f4',
  blue: '#2f7fc1',
  sky: '#eaf1fb',
  mint: '#eaf6f0',
  peach: '#fdf1eb',
  hot: '#e0672b',
  danger: '#c9352b',
  grey: '#8a979a',
};

// expo-font nhúng font lúc build: Android gọi theo tên file, iOS theo PostScript name.
const font = (android: string, ios: string) => Platform.select({ ios, default: android });
export const F = {
  regular: font('BeVietnamPro_400Regular', 'BeVietnamPro-Regular'),
  medium: font('BeVietnamPro_500Medium', 'BeVietnamPro-Medium'),
  semibold: font('BeVietnamPro_600SemiBold', 'BeVietnamPro-SemiBold'),
  bold: font('BeVietnamPro_700Bold', 'BeVietnamPro-Bold'),
};

export const shadow = Platform.select({
  ios: { shadowColor: '#193d34', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  default: { elevation: 2 },
});
