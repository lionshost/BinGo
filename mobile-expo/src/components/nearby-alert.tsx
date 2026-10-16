import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text, tap, useToast, warn } from '@/components/ui';
import { fetchNearbyTrucks } from '@/lib/api';
import { alertMessage, fmtDistance, newlyArrived, POLL_MS, RADII, radiusLabel, type NearbyTruck } from '@/lib/nearby';
import { useBinGo } from '@/lib/store';
import { C, shadow } from '@/lib/theme';

// Làm mới GPS mỗi ~15 giây để tiết kiệm pin (hỏi máy chủ vẫn 3 giây một lần).
const REFRESH_POSITION_EVERY = 5;

/** Nút chuông + thẻ "Xe gần bạn". `bottom` là mép dưới còn trống phía trên thanh tab. */
export function NearbyAlert({ bottom }: { bottom: number }) {
  const toast = useToast();
  const { position, locate } = useBinGo();
  const [on, setOn] = useState(false);
  const [radius, setRadius] = useState<number>(RADII[1]);
  const [trucks, setTrucks] = useState<NearbyTruck[]>([]);
  const known = useRef(new Set<string>());
  const pos = useRef(position);
  pos.current = position;

  const toggle = async () => {
    tap();
    if (on) {
      setOn(false);
      setTrucks([]);
      known.current = new Set();
      return;
    }
    try {
      await locate();
      setOn(true);
    } catch (err: any) {
      toast(err.message, 'danger');
    }
  };

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    let tick = 0;
    known.current = new Set();

    const poll = async () => {
      if (++tick % REFRESH_POSITION_EVERY === 0) await locate().catch(() => {});
      const here = pos.current;
      if (cancelled || !here) return;
      try {
        const found = await fetchNearbyTrucks(here.lat, here.lon, radius);
        if (cancelled) return;
        const fresh = newlyArrived(known.current, found);
        known.current = new Set(found.map(t => t.id));
        if (fresh.length) {
          warn();
          toast(alertMessage(fresh[0]), 'ok');
        }
        setTrucks(found);
      } catch {
        // Mạng chập chờn: giữ danh sách cũ, lượt sau thử lại.
      }
    };

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [on, radius, locate, toast]);

  const nextRadius = () => {
    tap();
    setRadius(r => RADII[(RADII.indexOf(r as (typeof RADII)[number]) + 1) % RADII.length]);
  };

  return (
    <>
      {on && (
        <View style={[styles.card, { bottom: bottom + 70 }]} accessibilityLiveRegion="polite">
          <View style={styles.head}>
            <Text weight="bold" style={{ color: C.ink, fontSize: 14 }}>Xe gần bạn</Text>
            <Pressable onPress={nextRadius} hitSlop={8} accessibilityLabel={`Bán kính ${radiusLabel(radius)}, bấm để đổi`}>
              <Text weight="semibold" style={{ color: C.deep, fontSize: 13 }}>Trong {radiusLabel(radius)} ▾</Text>
            </Pressable>
          </View>
          {trucks.length === 0 ? (
            <Text style={{ color: C.muted, fontSize: 13 }}>Chưa có xe nào trong bán kính.</Text>
          ) : (
            trucks.slice(0, 3).map(t => (
              <View key={t.id} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: t.color ?? C.green }]} />
                <Text weight="semibold" style={{ flex: 1, fontSize: 13.5, color: C.ink }}>{t.name}</Text>
                <Text style={{ fontSize: 13, color: C.muted }}>{fmtDistance(t.distance)} · ~{t.etaMinutes} phút</Text>
              </View>
            ))
          )}
        </View>
      )}
      <Pressable
        onPress={toggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: on }}
        accessibilityLabel="Thông báo xe thu gom gần bạn"
        style={({ pressed }) => [styles.bell, { bottom }, on && { backgroundColor: C.green }, pressed && { transform: [{ scale: 0.94 }] }]}>
        <MaterialIcons name={on ? 'notifications-active' : 'notifications-none'} size={24} color={on ? '#fff' : C.deep} />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  bell: {
    position: 'absolute',
    right: 14,
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    elevation: 5,
  },
  card: {
    position: 'absolute',
    left: 14,
    right: 82,
    padding: 12,
    gap: 6,
    borderRadius: 14,
    backgroundColor: C.surface,
    ...shadow,
    elevation: 4,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
