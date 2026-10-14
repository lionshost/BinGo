import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Eyebrow, Text, success, tap, useToast } from '@/components/ui';
import { binPoint, distanceM, formatDistance, needsPickup, STATUS, TONE } from '@/lib/bins';
import { useBinGo } from '@/lib/store';
import { C, shadow } from '@/lib/theme';

export default function RouteScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { bins, byId, collected, toggleCollected, route, buildRoute, focusBin } = useBinGo();
  const [stops, setStops] = useState(8);
  const [busy, setBusy] = useState(false);

  const priority = bins.filter(b => needsPickup(b, collected)).length;
  const doneToday = Object.keys(collected).length;
  const items = route ? route.binIds.map(id => byId.get(id)).filter(b => b !== undefined) : [];
  const remaining = items.filter(b => !collected[b.id]).length;

  const onBuild = async () => {
    if (!bins.length) return toast('Chưa tải xong dữ liệu điểm thu gom.');
    setBusy(true);
    try {
      const notes = await buildRoute(stops);
      notes.forEach(n => toast(n));
      success();
      router.navigate('/');
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <View style={{ gap: 12 }}>
      <View style={styles.stats}>
        <Stat value={bins.length ? priority : '–'} label="Cần thu gom" bg={C.mint} />
        <Stat value={doneToday} label="Đã thu hôm nay" bg={C.sky} />
        <Stat value={route ? route.km.toFixed(1) : '–'} label="Km dự kiến" bg={C.peach} />
      </View>
      <Card style={{ gap: 14 }}>
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            <Text weight="semibold" style={{ fontSize: 17 }}>Lập tuyến gần nhất</Text>
            <Text style={{ fontSize: 13, color: C.muted }}>
              {!route
                ? 'Chọn các điểm đầy/tràn gần vị trí của bạn, sắp theo thứ tự đi.'
                : route.source === 'estimate'
                  ? 'Khoảng cách ước tính theo đường chim bay × 1,35.'
                  : `Tuyến theo đường bộ · ${route.source}.`}
            </Text>
          </View>
          <View style={styles.stepper} accessibilityLabel={`Số điểm trong tuyến: ${stops}`}>
            <Pressable hitSlop={6} style={styles.stepBtn} onPress={() => { tap(); setStops(s => Math.max(3, s - 1)); }} accessibilityLabel="Bớt điểm">
              <MaterialIcons name="remove" size={20} color={C.deep} />
            </Pressable>
            <Text weight="bold" style={{ minWidth: 22, textAlign: 'center' }}>{stops}</Text>
            <Pressable hitSlop={6} style={styles.stepBtn} onPress={() => { tap(); setStops(s => Math.min(20, s + 1)); }} accessibilityLabel="Thêm điểm">
              <MaterialIcons name="add" size={20} color={C.deep} />
            </Pressable>
          </View>
        </View>
        <Button
          title={busy ? 'Đang lập tuyến…' : route ? 'Lập lại tuyến' : 'Lập tuyến từ vị trí của tôi'}
          busy={busy}
          icon={<MaterialIcons name="route" size={20} color="#fff" />}
          onPress={onBuild}
        />
      </Card>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.appbar}>
        <Eyebrow>{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' })}</Eyebrow>
        <Text weight="bold" style={styles.h1} accessibilityRole="header">Tuyến của tôi</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={b => b.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: 4 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 44 }}>🗺️</Text>
            <Text style={{ color: C.muted, textAlign: 'center' }}>
              Chưa có tuyến. Nhấn <Text weight="bold">Lập tuyến</Text> để BinGo chọn các điểm cần thu gom gần bạn nhất.
            </Text>
          </View>
        }
        ListFooterComponent={
          route && items.length > 0 && remaining === 0 ? (
            <View style={styles.done}><Text weight="semibold" style={{ color: C.deep }}>🎉 Hoàn thành tuyến! Lập tuyến mới để tiếp tục.</Text></View>
          ) : null
        }
        renderItem={({ item: bin, index }) => {
          const done = Boolean(collected[bin.id]);
          const s = STATUS[bin.status] ?? STATUS.active;
          const prev = index === 0 ? route!.start : binPoint(items[index - 1]);
          return (
            <View style={[styles.stop, done && { opacity: 0.6 }]}>
              <Pressable
                style={styles.stopMain}
                android_ripple={{ color: '#17876018' }}
                onPress={() => { tap(); focusBin(bin.id); router.navigate('/'); }}
                accessibilityHint="Mở trên bản đồ">
                <View style={[styles.num, done && { backgroundColor: C.blue }]}>
                  <Text weight="bold" style={{ color: '#fff', fontSize: 13 }}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text weight="semibold" numberOfLines={1} style={done && { textDecorationLine: 'line-through' }}>{bin.address}</Text>
                  <Text style={{ fontSize: 12.5, color: C.muted }}>
                    {bin.id} · <Text weight="semibold" style={{ fontSize: 12.5, color: TONE[s.tone].fg }}>{s.short}</Text> · +{formatDistance(distanceM(prev, binPoint(bin)))}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => {
                  const now = toggleCollected(bin.id);
                  if (now) success();
                  else tap();
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                accessibilityLabel={`Đã thu ${bin.id}`}
                style={[styles.check, done && { backgroundColor: C.blue, borderColor: C.blue }]}>
                <MaterialIcons name="check" size={22} color={done ? '#fff' : 'transparent'} />
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

function Stat({ value, label, bg }: { value: string | number; label: string; bg: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: bg }]}>
      <Text weight="bold" style={{ fontSize: 24 }}>{value}</Text>
      <Text weight="medium" style={{ fontSize: 12, color: C.muted }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas },
  appbar: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  h1: { fontSize: 26, lineHeight: 32 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 12, borderRadius: 16 },
  cardHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, backgroundColor: C.canvas, borderWidth: 1, borderColor: C.line },
  stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  stop: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, paddingRight: 8, overflow: 'hidden', ...shadow },
  stopMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 12 },
  num: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  check: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, padding: 24 },
  done: { marginTop: 8, padding: 14, borderRadius: 16, backgroundColor: C.mint, alignItems: 'center' },
});
