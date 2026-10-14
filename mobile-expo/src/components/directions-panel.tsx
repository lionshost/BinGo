// Chỉ đường trong app: thẻ tóm tắt ở cuối màn bản đồ + banner hướng dẫn rẽ khi đang dẫn đường.
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, tap } from '@/components/ui';
import { formatDistance, type Bin } from '@/lib/bins';
import type { NavProgress } from '@/lib/nav';
import type { Directions } from '@/lib/store';
import { C, shadow } from '@/lib/theme';

// Mã rẽ GraphHopper (VIETMAP Route v4) → icon.
const SIGN_ICON: Record<number, keyof typeof MaterialIcons.glyphMap> = {
  [-98]: 'u-turn-left',
  [-8]: 'u-turn-left',
  [-7]: 'fork-left',
  [-3]: 'turn-sharp-left',
  [-2]: 'turn-left',
  [-1]: 'turn-slight-left',
  0: 'straight',
  1: 'turn-slight-right',
  2: 'turn-right',
  3: 'turn-sharp-right',
  4: 'flag',
  5: 'flag',
  6: 'roundabout-right',
  7: 'fork-right',
  8: 'u-turn-left',
};

const formatTime = (s: number) => {
  const min = Math.max(1, Math.round(s / 60));
  return min < 60 ? `${min} phút` : `${Math.floor(min / 60)} giờ ${min % 60} phút`;
};

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Banner trên cùng khi đang dẫn đường: bước rẽ sắp tới và khoảng cách tới đó. */
export function NavBanner({ progress, bin }: { progress: NavProgress; bin: Bin }) {
  const insets = useSafeAreaInsets();
  const step = progress.nextStep;
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 12 }]} accessibilityLiveRegion="polite">
      <MaterialIcons name={step ? (SIGN_ICON[step.sign] ?? 'straight') : 'flag'} size={40} color="#fff" />
      <View style={{ flex: 1 }}>
        <Text weight="bold" style={styles.bannerDist}>{formatDistance(progress.toNextM)}</Text>
        <Text weight="semibold" style={styles.bannerText} numberOfLines={2}>
          {step ? capitalize(step.text) : `Đến ${bin.name}`}
        </Text>
      </View>
    </View>
  );
}

export function DirectionsPanel({ directions, bin, navigating, progress, starting, onStart, onStop, onClose, onLayout }: {
  directions: Directions;
  bin: Bin;
  navigating: boolean;
  progress: NavProgress | null;
  starting?: boolean;
  onStart: () => void;
  onStop: () => void;
  onClose: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const { steps, estimate } = directions;

  // Đang dẫn đường: chỉ hiện quãng đường/thời gian còn lại + nút kết thúc.
  if (navigating) {
    const left = progress?.remainingM ?? directions.distance;
    const timeLeft = directions.time != null && directions.distance > 0 ? (directions.time * left) / directions.distance : null;
    return (
      <View style={[styles.card, styles.navCard, { paddingBottom: insets.bottom + 14 }]} onLayout={onLayout}>
        <View style={{ flex: 1 }}>
          <Text weight="bold" style={styles.summary}>
            {timeLeft != null ? `${formatTime(timeLeft)} · ` : ''}{formatDistance(left)}
          </Text>
          <Text style={styles.dest} numberOfLines={1}>
            {estimate ? 'Đang tìm đường bộ… · ' : ''}Đến {bin.name}
          </Text>
        </View>
        <Pressable style={[styles.btn, styles.btnStop]} onPress={() => { tap(); onStop(); }} accessibilityRole="button">
          <Text weight="semibold" style={{ color: '#fff' }}>Kết thúc</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.card, { paddingBottom: insets.bottom + 14 }]} onLayout={onLayout}>
      <View style={styles.head}>
        <View style={styles.headIcon}>
          <MaterialIcons name="directions" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text weight="bold" style={styles.summary}>
            {directions.time != null ? `${formatTime(directions.time)} · ` : ''}
            {formatDistance(directions.distance)}
          </Text>
          <Text style={styles.dest} numberOfLines={1}>Đến {bin.name}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Đóng chỉ đường" style={styles.close}>
          <MaterialIcons name="close" size={22} color={C.muted} />
        </Pressable>
      </View>

      <Text style={[styles.note, estimate && { color: C.hot }]}>
        {estimate ? 'Ước tính theo đường chim bay — đang tìm đường bộ…' : 'Đường bộ VIETMAP · xe ô tô'}
      </Text>

      {open && steps.length > 0 && (
        <ScrollView style={styles.steps} contentContainerStyle={{ paddingVertical: 4 }}>
          {steps.map((s, i) => (
            <View key={i} style={styles.step}>
              <MaterialIcons name={SIGN_ICON[s.sign] ?? 'straight'} size={22} color={C.deep} />
              <View style={{ flex: 1 }}>
                <Text weight="medium" style={{ fontSize: 14, color: C.ink }}>
                  {capitalize(s.text)}
                </Text>
                {s.distance > 0 && <Text style={{ fontSize: 12, color: C.muted }}>{formatDistance(s.distance)}</Text>}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.actions}>
        {steps.length > 0 && (
          <Pressable
            style={[styles.btn, styles.btnSoft]}
            onPress={() => { tap(); setOpen(o => !o); }}
            accessibilityRole="button">
            <MaterialIcons name={open ? 'expand-more' : 'format-list-bulleted'} size={20} color={C.deep} />
            <Text weight="semibold" style={{ color: C.deep }}>{open ? 'Thu gọn' : `${steps.length} bước`}</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.btn, styles.btnPrimary]}
          disabled={starting}
          onPress={() => { tap(); onStart(); }}
          accessibilityRole="button">
          {starting ? <ActivityIndicator color="#fff" /> : <MaterialIcons name="navigation" size={20} color="#fff" />}
          <Text weight="semibold" style={{ color: '#fff' }}>Bắt đầu</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
    gap: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: C.surface,
    ...shadow,
    elevation: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  summary: { fontSize: 19, color: C.ink },
  dest: { fontSize: 13.5, color: C.muted },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.canvas, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 12.5, color: C.muted },
  steps: { maxHeight: 240, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: 23, paddingHorizontal: 16 },
  btnSoft: { backgroundColor: C.greenSoft },
  btnPrimary: { flex: 1, backgroundColor: C.green },
  btnStop: { backgroundColor: C.danger },
  navCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingBottom: 16,
    backgroundColor: C.deep,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    ...shadow,
    elevation: 8,
  },
  bannerDist: { fontSize: 24, color: '#fff' },
  bannerText: { fontSize: 16, color: '#e3f3ea' },
});
