import {
  IstokWeb_400Regular,
  IstokWeb_400Regular_Italic,
  IstokWeb_700Bold,
  IstokWeb_700Bold_Italic,
} from '@expo-google-fonts/istok-web';
import { Lato_700Bold } from '@expo-google-fonts/lato';
import {
  NotoSansKR_400Regular,
  NotoSansKR_700Bold,
} from '@expo-google-fonts/noto-sans-kr';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '@/lib/store';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    IstokWeb_400Regular,
    IstokWeb_400Regular_Italic,
    IstokWeb_700Bold,
    IstokWeb_700Bold_Italic,
    Lato_700Bold,
    NotoSansKR_400Regular,
    NotoSansKR_700Bold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AppProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </AppProvider>
  );
}
