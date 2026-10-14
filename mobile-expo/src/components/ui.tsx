import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Pressable, StyleSheet, Text as RNText,
  type PressableProps, type StyleProp, type TextProps, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { STATUS, TONE, type BinStatus } from '@/lib/bins';
import { C, F, shadow } from '@/lib/theme';

export const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
export const success = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
export const warn = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

export function Text({ weight = 'regular', style, ...rest }: TextProps & { weight?: Weight }) {
  return <RNText {...rest} style={[styles.text, { fontFamily: F[weight] }, style]} />;
}

export function Eyebrow({ children, color = C.muted }: { children: ReactNode; color?: string }) {
  return <Text weight="semibold" style={[styles.eyebrow, { color }]}>{children}</Text>;
}

export function StatusPill({ status }: { status: BinStatus }) {
  const s = STATUS[status] ?? STATUS.active;
  return <Pill bg={TONE[s.tone].bg} fg={TONE[s.tone].fg}>{s.label}</Pill>;
}

export function Pill({ children, bg, fg }: { children: ReactNode; bg: string; fg: string }) {
  return (
    <Text weight="bold" style={[styles.pill, { backgroundColor: bg, color: fg }]}>{children}</Text>
  );
}

type ButtonProps = Omit<PressableProps, 'style'> & {
  title: string;
  icon?: ReactNode;
  variant?: 'primary' | 'tonal' | 'ghost';
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, icon, variant = 'primary', busy, style, disabled, onPress, ...rest }: ButtonProps) {
  const fg = variant === 'primary' ? '#fff' : C.deep;
  return (
    <Pressable
      {...rest}
      disabled={disabled || busy}
      onPress={e => { tap(); onPress?.(e); }}
      android_ripple={{ color: variant === 'primary' ? '#ffffff33' : '#17876022', borderless: false }}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && styles.btnPrimary,
        variant === 'tonal' && styles.btnTonal,
        (disabled || busy) && { opacity: 0.55 },
        pressed && { transform: [{ scale: 0.97 }] },
        style,
      ]}>
      {busy ? <ActivityIndicator color={fg} size="small" /> : icon}
      <Text weight="semibold" style={{ color: fg, fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Animated.View style={[styles.card, style]}>{children}</Animated.View>;
}

// ---------- Toast ----------
type Tone = 'info' | 'ok' | 'danger';
const ToastCtx = createContext<(msg: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<{ text: string; tone: Tone } | null>(null);
  const [anim] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((text: string, tone: Tone = 'info') => {
    setMsg({ text, tone });
    clearTimeout(timer.current);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null));
    }, 2800);
  }, [anim]);

  const bg = msg?.tone === 'ok' ? C.deep : msg?.tone === 'danger' ? '#8b2018' : C.ink;
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            { top: insets.top + 12, backgroundColor: bg },
            { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] },
          ]}>
          <Text weight="medium" style={{ color: '#fff', fontSize: 14 }}>{msg.text}</Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

const styles = StyleSheet.create({
  text: { color: C.ink, fontSize: 15 },
  eyebrow: { fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  pill: { alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, fontSize: 12.5 },
  btn: {
    minHeight: 50,
    borderRadius: 999,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  btnPrimary: { backgroundColor: C.green },
  btnTonal: { backgroundColor: C.greenSoft },
  card: { backgroundColor: C.surface, borderRadius: 18, padding: 16, ...shadow },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    ...shadow,
    elevation: 6,
  },
});
