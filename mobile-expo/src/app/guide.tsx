import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Eyebrow, Text, tap } from '@/components/ui';
import { WASTE_GROUPS } from '@/lib/taxonomy';
import { C, shadow } from '@/lib/theme';

export default function GuideScreen() {
  const insets = useSafeAreaInsets();
  const groups = Object.values(WASTE_GROUPS);
  const [open, setOpen] = useState<string | null>(groups[0]?.key ?? null);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.appbar}>
        <Eyebrow>Phân loại tại nguồn</Eyebrow>
        <Text weight="bold" style={styles.h1} accessibilityRole="header">4 nhóm rác cần nhớ</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {groups.map(g => {
          const expanded = open === g.key;
          return (
            <View key={g.key} style={styles.card}>
              <Pressable
                style={styles.head}
                android_ripple={{ color: '#17876014' }}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => {
                  tap();
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setOpen(expanded ? null : g.key);
                }}>
                <View style={[styles.icon, { backgroundColor: `${g.color}22` }]}>
                  <Text style={{ fontSize: 24 }}>{g.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text weight="bold">{g.label}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12.5, color: C.muted }}>{g.examples}</Text>
                </View>
                <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={24} color={C.muted} />
              </Pressable>
              {expanded && (
                <View style={styles.body}>
                  <Eyebrow color={g.color}>Ví dụ</Eyebrow>
                  <Text style={styles.p}>{g.examples}</Text>
                  <Eyebrow color={g.color}>Cách xử lý</Eyebrow>
                  <Text style={styles.p}>{g.guidance}</Text>
                </View>
              )}
            </View>
          );
        })}

        <Pressable style={[styles.card, styles.head, { backgroundColor: C.ink }]} onPress={() => { tap(); router.navigate('/scan'); }}>
          <View style={[styles.icon, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
            <MaterialIcons name="photo-camera" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text weight="bold" style={{ color: '#fff' }}>Không chắc là loại nào?</Text>
            <Text style={{ fontSize: 12.5, color: '#b9cdc5' }}>Chụp ảnh để AI gợi ý nhóm rác</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#b9cdc5" />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas },
  appbar: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  h1: { fontSize: 26, lineHeight: 32 },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  card: { backgroundColor: C.surface, borderRadius: 18, overflow: 'hidden', ...shadow },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  body: { paddingLeft: 76, paddingRight: 16, paddingBottom: 16, gap: 2 },
  p: { fontSize: 14, color: '#3c5a51', marginBottom: 8 },
});
