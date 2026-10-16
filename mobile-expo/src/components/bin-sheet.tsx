// Bottom sheet chi tiết điểm thu gom — kéo xuống để đóng, không chặn bản đồ (như Google Maps).
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { forwardRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pill, StatusPill, Text, success, tap, useToast } from '@/components/ui';
import { binPoint, distanceM, formatDistance } from '@/lib/bins';
import { useBinGo } from '@/lib/store';
import { C } from '@/lib/theme';

export const BinSheet = forwardRef<BottomSheet>(function BinSheet(_props, ref) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { selectedId, setSelectedId, byId, collected, toggleCollected, position, route, setScanBinId, startDirections } = useBinGo();
  const [routing, setRouting] = useState(false);
  const bin = selectedId ? byId.get(selectedId) : undefined;
  const done = bin ? Boolean(collected[bin.id]) : false;
  const routeIdx = bin && route ? route.binIds.indexOf(bin.id) : -1;
  const bottomPadding = (Platform.OS === 'ios' ? Math.max(insets.bottom, 12) : 16) + 84;

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      enableDynamicSizing
      enablePanDownToClose
      onClose={() => setSelectedId(null)}
      backgroundStyle={styles.bg}
      handleIndicatorStyle={{ backgroundColor: '#cdd9d3', width: 40 }}>
      <BottomSheetView
        style={[styles.body, { paddingBottom: bottomPadding }]}>
        {bin && (
          <>
            <View style={styles.pills}>
              <StatusPill status={bin.status} />
              {done && <Pill bg={C.sky} fg="#1f5d93">Đã thu hôm nay</Pill>}
              {routeIdx >= 0 && <Pill bg={C.ink} fg="#fff">Điểm #{routeIdx + 1} trong tuyến</Pill>}
            </View>
            <View>
              <Text weight="bold" style={styles.title} accessibilityRole="header">{bin.name}</Text>
              <Text style={{ color: C.muted }}>
                {bin.address}
                {position ? <Text weight="semibold" style={{ color: C.ink }}> · {formatDistance(distanceM(position, binPoint(bin)))}</Text> : null}
              </Text>
            </View>

            <View style={styles.facts}>
              <Fact label="Mã điểm" value={bin.id} />
              <Fact label="Loại" value={bin.type} border />
              <Fact label="Tái chế" value={bin.recyclable ? 'Có' : 'Không'} border />
            </View>
            <Text style={styles.tiny}>
              {bin.inspectedAt
                ? `Kiểm tra bằng ảnh lúc ${new Date(bin.inspectedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                : `Cập nhật ${bin.updated || '—'}`}
            </Text>

            <View style={styles.actions}>
              <Action
                icon="directions"
                label="Chỉ đường"
                primary
                busy={routing}
                onPress={async () => {
                  setRouting(true);
                  try {
                    const note = await startDirections(bin.id);
                    if (note) toast(note);
                  } catch (err: any) {
                    toast(err.message, 'danger');
                  } finally {
                    setRouting(false);
                  }
                }}
              />
              <Action
                icon="photo-camera"
                label="Chụp kiểm tra"
                onPress={() => {
                  setScanBinId(bin.id);
                  router.navigate('/scan');
                }}
              />
              <Action
                icon="check"
                label={done ? 'Bỏ đánh dấu' : 'Đã thu gom'}
                on={done}
                disabled={bin.status === 'broken'}
                onPress={() => {
                  const now = toggleCollected(bin.id);
                  if (now) success();
                  toast(now ? `Đã ghi nhận thu gom ${bin.id}` : `Đã bỏ đánh dấu ${bin.id}`, now ? 'ok' : 'info');
                }}
              />
            </View>
          </>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
});

function Fact({ label, value, border }: { label: string; value: string; border?: boolean }) {
  return (
    <View style={[styles.fact, border && { borderLeftWidth: 1, borderLeftColor: C.line }]}>
      <Text style={{ fontSize: 11.5, color: C.muted }}>{label}</Text>
      <Text weight="semibold" style={{ fontSize: 13.5, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function Action({ icon, label, onPress, primary, on, disabled, busy }: {
  icon: keyof typeof MaterialIcons.glyphMap; label: string; onPress: () => void; primary?: boolean; on?: boolean; disabled?: boolean; busy?: boolean;
}) {
  const bg = primary ? C.green : on ? C.blue : C.greenSoft;
  const fg = primary || on ? '#fff' : C.deep;
  return (
    <Pressable
      style={({ pressed }) => [styles.action, disabled && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.94 }] }]}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => { tap(); onPress(); }}>
      <View style={[styles.actionIcon, { backgroundColor: bg }]}>
        {busy ? <ActivityIndicator color={fg} /> : <MaterialIcons name={icon} size={24} color={fg} />}
      </View>
      <Text weight="semibold" style={{ fontSize: 12.5, color: C.deep, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bg: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  body: { paddingHorizontal: 20, gap: 14 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 21, lineHeight: 27, marginBottom: 2 },
  facts: { flexDirection: 'row', borderWidth: 1, borderColor: C.line, borderRadius: 14, overflow: 'hidden' },
  fact: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  tiny: { fontSize: 12.5, color: C.muted, marginTop: -4 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 6 },
  actionIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
});
