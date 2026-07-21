import Feather from '@expo/vector-icons/Feather';
import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';
import { sel, useApp } from '@/lib/store';
import { colors } from '@/lib/theme';

// 24px line icons with a small Brand/Accent dot above the active tab
// (Brand System 06: "Active = ink + yellow dot; idle = muted").
function TabBarIcon({
  name,
  color,
  focused,
}: {
  name: keyof typeof Feather.glyphMap;
  color: string;
  focused: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Feather name={name} size={24} color={color} />
      {focused && (
        <View
          style={{
            position: 'absolute',
            top: -7,
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.yellow,
          }}
        />
      )}
    </View>
  );
}

export default function TabsLayout() {
  const { state, t } = useApp();

  // Route through the index so Supabase mode lands on sign-in when signed
  // out and demo mode lands on welcome — the index knows the difference.
  if (!state.currentUserId || !state.activeGroupId) {
    return <Redirect href="/" />;
  }

  const isLeader = sel.canManageActiveGroup(state);
  const labelFamily =
    state.language === 'ko' ? 'NotoSansKR_400Regular' : 'IstokWeb_400Regular';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopWidth: 0,
          elevation: 0,
          height: 84,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: labelFamily, fontSize: 10, marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: t('tabs.feed'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="align-left" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="reflect"
        options={{
          title: t('tabs.reflect'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="book-open" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="group"
        options={{
          href: isLeader ? null : '/(tabs)/group',
          title: t('tabs.group'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="users" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="manage"
        options={{
          href: isLeader ? '/(tabs)/manage' : null,
          title: t('tabs.manage'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="sliders" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
