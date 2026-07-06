import Feather from '@expo/vector-icons/Feather';
import { Redirect, Tabs } from 'expo-router';
import { sel, useApp } from '@/lib/store';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const { state, t } = useApp();

  if (!state.currentUserId || !state.activeGroupId) {
    return <Redirect href="/welcome" />;
  }

  const isLeader = sel.myRole(state) === 'leader';
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
        tabBarInactiveTintColor: '#AEACA3',
        tabBarLabelStyle: { fontFamily: labelFamily, fontSize: 10, marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => <Feather name="home" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: t('tabs.feed'),
          tabBarIcon: ({ color }) => <Feather name="align-left" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reflect"
        options={{
          title: t('tabs.reflect'),
          tabBarIcon: ({ color }) => <Feather name="book-open" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="group"
        options={{
          href: isLeader ? null : '/(tabs)/group',
          title: t('tabs.group'),
          tabBarIcon: ({ color }) => <Feather name="users" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="manage"
        options={{
          href: isLeader ? '/(tabs)/manage' : null,
          title: t('tabs.manage'),
          tabBarIcon: ({ color }) => <Feather name="sliders" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
