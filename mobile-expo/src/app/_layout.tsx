import { NativeTabs } from 'expo-router/unstable-native-tabs';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ToastProvider } from '@/components/ui';
import { BinGoProvider, useBinGo } from '@/lib/store';
import { C, F } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

function Tabs() {
  const { route, byId, collected } = useBinGo();
  const remaining = route ? route.binIds.filter(id => !collected[id] && byId.get(id)).length : 0;

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <NativeTabs
      backgroundColor={C.surface}
      indicatorColor={C.greenSoft}
      iconColor={{ default: C.muted, selected: C.deep }}
      labelStyle={{ default: { color: C.muted, fontFamily: F.semibold }, selected: { color: C.deep, fontFamily: F.semibold } }}
      badgeBackgroundColor={C.hot}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Bản đồ</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="route">
        <NativeTabs.Trigger.Label>Tuyến</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="point.bottomleft.forward.to.point.topright.scurvepath" md="route" />
        <NativeTabs.Trigger.Badge hidden={remaining === 0}>{String(remaining)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scan">
        <NativeTabs.Trigger.Label>Chụp ảnh</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'camera', selected: 'camera.fill' }} md="photo_camera" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="guide">
        <NativeTabs.Trigger.Label>Phân loại</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'trash', selected: 'trash.fill' }} md="recycling" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.canvas }}>
      <StatusBar style="dark" />
      <BinGoProvider>
        <ToastProvider>
          <Tabs />
        </ToastProvider>
      </BinGoProvider>
    </GestureHandlerRootView>
  );
}
