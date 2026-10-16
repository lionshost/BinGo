import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui';
import { BinGoProvider, useBinGo } from '@/lib/store';
import { C, F } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

function TabIcon({ name, focused }: { name: keyof typeof MaterialIcons.glyphMap; focused: boolean }) {
  return (
    <View style={[styles.tabIconWrapper, focused && styles.tabIconWrapperActive]}>
      <MaterialIcons
        name={name}
        size={24}
        color={focused ? C.deep : C.muted}
      />
    </View>
  );
}

function TabLayout() {
  const insets = useSafeAreaInsets();
  const { route, byId, collected } = useBinGo();
  const remaining = route ? route.binIds.filter(id => !collected[id] && byId.get(id)).length : 0;

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  const bottomMargin = Platform.OS === 'ios' ? Math.max(insets.bottom, 12) : 16;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: C.deep,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: [
          styles.tabBar,
          {
            bottom: bottomMargin,
          },
        ],
        tabBarItemStyle: styles.tabBarItem,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Bản đồ',
          tabBarIcon: ({ focused }) => <TabIcon name="map" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="route"
        options={{
          title: 'Tuyến',
          tabBarBadge: remaining > 0 ? remaining : undefined,
          tabBarBadgeStyle: styles.badge,
          tabBarIcon: ({ focused }) => <TabIcon name="alt-route" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Chụp ảnh',
          tabBarIcon: ({ focused }) => <TabIcon name="photo-camera" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="guide"
        options={{
          title: 'Phân loại',
          tabBarIcon: ({ focused }) => <TabIcon name="recycling" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ffffff',
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: 'rgba(25, 61, 52, 0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#0e2b23',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.16,
        shadowRadius: 12,
      },
      android: {
        elevation: 10,
      },
    }),
    paddingBottom: 0,
    paddingTop: 0,
  },
  tabBarItem: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapperActive: {
    backgroundColor: C.greenSoft,
  },
  badge: {
    backgroundColor: C.hot,
    color: '#fff',
    fontSize: 10,
    fontFamily: F.bold,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    lineHeight: 18,
    top: 8,
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.canvas }}>
      <StatusBar style="dark" />
      <BinGoProvider>
        <ToastProvider>
          <TabLayout />
        </ToastProvider>
      </BinGoProvider>
    </GestureHandlerRootView>
  );
}
