import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Eyebrow, Text, success, tap, useToast, warn } from '@/components/ui';
import { analyzeImage, type WasteAnalysis } from '@/lib/api';
import { binPoint, distanceM, formatDistance, HANOI_CENTER, inHanoi, STATUS, TONE } from '@/lib/bins';
import { useBinGo } from '@/lib/store';
import { WASTE_GROUPS } from '@/lib/taxonomy';
import { C, shadow } from '@/lib/theme';

/** Thu nhỏ ≤1280px + JPEG để gửi nhanh và dưới giới hạn 5 MB của backend. */
async function toDataUrl(uri: string) {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 1280 }).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.72, base64: true });
  return { uri: out.uri, dataUrl: `data:image/jpeg;base64,${out.base64}` };
}

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { bins, byId, scanBinId, setScanBinId, position, setBinStatus } = useBinGo();
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WasteAnalysis | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [applied, setApplied] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const target = scanBinId ? byId.get(scanBinId) : undefined;

  const run = async (fromLibrary: boolean) => {
    tap();
    const perm = fromLibrary
      ? await ImagePicker.requestMediaLibraryPermissionsAsync()
      : await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      return toast(fromLibrary ? 'Chưa có quyền thư viện ảnh. Hãy bật trong Cài đặt.' : 'Chưa có quyền camera. Hãy bật trong Cài đặt.', 'danger');
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
    const picked = fromLibrary ? await ImagePicker.launchImageLibraryAsync(opts) : await ImagePicker.launchCameraAsync(opts);
    if (picked.canceled || !picked.assets[0]) return;

    setBusy(true);
    setResult(null);
    setFailure(null);
    setApplied(false);
    try {
      const { uri, dataUrl } = await toDataUrl(picked.assets[0].uri);
      setPhoto(uri);
      const r = await analyzeImage(dataUrl, scanBinId);
      setResult(r);
      if (r.image_usable) success();
      else warn();
      setTimeout(() => scroll.current?.scrollTo({ y: 380, animated: true }), 150);
    } catch (err: any) {
      setFailure(err.message);
      warn();
    } finally {
      setBusy(false);
    }
  };

  const origin = position && inHanoi(position) ? position : HANOI_CENTER;
  const nearby = picking
    ? bins
        .filter(b => b.status !== 'broken')
        .map(b => ({ b, d: distanceM(origin, binPoint(b)) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, 10)
    : [];

  const bottomPadding = (Platform.OS === 'ios' ? Math.max(insets.bottom, 12) : 16) + 84;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.appbar}>
        <Eyebrow>AI · Computer Vision</Eyebrow>
        <Text weight="bold" style={styles.h1} accessibilityRole="header">Kiểm tra điểm thu gom</Text>
      </View>
      <ScrollView ref={scroll} contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}>
        <Pressable style={styles.target} onPress={() => { tap(); setPicking(true); }} accessibilityRole="button">
          <View style={styles.targetIcon}>
            <MaterialIcons name={target ? 'place' : 'add-location-alt'} size={20} color={C.deep} />
          </View>
          <View style={{ flex: 1 }}>
            <Text weight="semibold" numberOfLines={1}>{target ? `${target.id} · ${target.address}` : 'Gắn với điểm thu gom'}</Text>
            <Text style={{ fontSize: 12, color: C.muted }}>{target ? 'Kết quả sẽ cập nhật cho điểm này' : 'Không bắt buộc — để cập nhật trạng thái điểm'}</Text>
          </View>
          <Text weight="bold" style={{ color: C.green }}>{target ? 'Đổi' : 'Chọn'}</Text>
        </Pressable>

        <View style={[styles.preview, photo && styles.previewFilled]}>
          {photo ? (
            <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={{ alignItems: 'center', maxWidth: 260, gap: 8 }}>
              <MaterialIcons name="photo-camera" size={44} color={C.green} />
              <Text style={{ textAlign: 'center', color: C.muted, fontSize: 13.5 }}>
                Chụp rõ miệng thùng và khu vực xung quanh để AI đánh giá mức đầy và loại rác.
              </Text>
            </View>
          )}
          {busy && (
            <View style={styles.scanning}>
              <ActivityIndicator color="#6ef0b1" />
              <Text weight="semibold" style={{ color: '#fff' }}>AI đang phân tích ảnh…</Text>
            </View>
          )}
        </View>

        <View style={styles.row}>
          <Button style={{ flex: 1.4 }} title="Chụp ảnh" icon={<MaterialIcons name="photo-camera" size={20} color="#fff" />} onPress={() => run(false)} disabled={busy} />
          <Button style={{ flex: 1 }} variant="tonal" title="Thư viện" icon={<MaterialIcons name="photo-library" size={20} color={C.deep} />} onPress={() => run(true)} disabled={busy} />
        </View>

        {failure && (
          <Card style={{ backgroundColor: '#fdeceb' }}>
            <Text weight="bold" style={{ color: '#8b2018' }}>Chưa phân tích được</Text>
            <Text style={{ color: '#8b2018', marginTop: 4 }}>{failure}</Text>
          </Card>
        )}

        {result && (
          <Result
            r={result}
            targetId={target?.id}
            canApply={Boolean(target && result.suggested_status && target.status !== result.suggested_status) && !applied}
            applied={applied}
            onApply={() => {
              setBinStatus(target!.id, result.suggested_status!);
              setApplied(true);
              success();
              toast(`Đã cập nhật ${target!.id}`, 'ok');
            }}
          />
        )}
      </ScrollView>

      <Modal visible={picking} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }} edges={['bottom']}>
          <View style={styles.modalHead}>
            <Text weight="bold" style={{ fontSize: 19 }}>Chọn điểm gần bạn</Text>
            <Pressable onPress={() => setPicking(false)} hitSlop={10} accessibilityLabel="Đóng">
              <MaterialIcons name="close" size={24} color={C.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}>
            {nearby.map(({ b, d }) => (
              <Pressable
                key={b.id}
                android_ripple={{ color: '#17876018' }}
                style={styles.pickRow}
                onPress={() => { tap(); setScanBinId(b.id); setPicking(false); }}>
                <View style={[styles.dot, { backgroundColor: (STATUS[b.status] ?? STATUS.active).color }]} />
                <View style={{ flex: 1 }}>
                  <Text weight="semibold" numberOfLines={1}>{b.address}</Text>
                  <Text style={{ fontSize: 12.5, color: C.muted }}>{b.id} · {formatDistance(d)}</Text>
                </View>
                {scanBinId === b.id && <MaterialIcons name="check" size={22} color={C.green} />}
              </Pressable>
            ))}
            {scanBinId && (
              <Button variant="ghost" title="Bỏ gắn điểm" onPress={() => { setScanBinId(null); setPicking(false); }} />
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function Result({ r, targetId, canApply, applied, onApply }: {
  r: WasteAnalysis; targetId?: string; canApply: boolean; applied: boolean; onApply: () => void;
}) {
  const status = r.suggested_status ? STATUS[r.suggested_status] : null;
  const tone = status ? TONE[status.tone] : TONE.muted;
  const pct = r.fill_percent_estimate;
  const detected = (r.guidance || []).filter(g => g.detected);
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Eyebrow>Mức đầy</Eyebrow>
            <Text weight="bold" style={{ fontSize: 24, color: tone.fg }}>{r.fill_label}</Text>
          </View>
          <View style={[styles.gauge, { borderColor: tone.fg }]}>
            <Text weight="bold" style={{ fontSize: 20 }}>{pct ?? '?'}<Text style={{ fontSize: 12, color: C.muted }}>%</Text></Text>
          </View>
        </View>
        <View style={styles.bar}><View style={[styles.barFill, { width: `${pct ?? 0}%`, backgroundColor: tone.fg }]} /></View>
        <Text>{r.fill_action}</Text>
        <Text style={{ fontSize: 12.5, color: C.muted }}>
          Độ tin cậy {Math.round((r.fill_confidence || 0) * 100)}%{r.overflow_detected ? ' · Phát hiện rác tràn ra ngoài' : ''}
        </Text>
        {r.needs_manual_review && (
          <View style={styles.note}>
            <Text style={{ fontSize: 13.5 }}>⚠️ Cần người kiểm tra trực tiếp{r.review_reasons?.length ? `: ${r.review_reasons.join('; ')}` : '.'}</Text>
          </View>
        )}
        {canApply && <Button title={`Đặt ${targetId} là “${status!.short}”`} onPress={onApply} />}
        {applied && (
          <View style={[styles.note, { backgroundColor: C.mint }]}>
            <Text weight="semibold" style={{ color: C.deep }}>✓ Đã cập nhật trạng thái trên máy này.</Text>
          </View>
        )}
      </Card>

      {r.waste_items?.length > 0 && (
        <Card>
          <Eyebrow>Nhận diện được</Eyebrow>
          <View style={styles.tags}>
            {r.waste_items.map(item => {
              const g = WASTE_GROUPS[item.group];
              return (
                <Text key={`${item.group}:${item.name}`} weight="semibold" style={[styles.tag, { backgroundColor: `${g?.color ?? '#7b8794'}22`, borderColor: `${g?.color ?? '#7b8794'}55` }]}>
                  {g?.icon} {item.name}
                </Text>
              );
            })}
          </View>
        </Card>
      )}

      {detected.length > 0 && (
        <Card style={{ gap: 10 }}>
          <Eyebrow>Hướng dẫn xử lý</Eyebrow>
          {detected.map(g => (
            <View key={g.key} style={{ borderLeftWidth: 4, borderLeftColor: g.color, paddingLeft: 12 }}>
              <Text weight="bold">{g.icon} {g.label}</Text>
              <Text style={{ fontSize: 13.5, color: C.muted, marginTop: 2 }}>{g.guidance}</Text>
            </View>
          ))}
        </Card>
      )}

      {r.scene_summary ? <Text style={styles.summary}>“{r.scene_summary}”</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas },
  appbar: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  h1: { fontSize: 26, lineHeight: 32 },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  target: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: C.surface, ...shadow },
  targetIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  preview: {
    aspectRatio: 4 / 3,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#c9d8cf',
    backgroundColor: '#eef3ef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewFilled: { borderWidth: 0, backgroundColor: '#0d1f1a' },
  scanning: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(13,31,26,0.45)', alignItems: 'center', justifyContent: 'center', gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  gauge: { width: 72, height: 72, borderRadius: 36, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#edf2ee', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  note: { padding: 12, borderRadius: 12, backgroundColor: '#fff7e6' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { fontSize: 13, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
  summary: { textAlign: 'center', fontStyle: 'italic', color: C.muted, fontSize: 12.5, paddingHorizontal: 12 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
