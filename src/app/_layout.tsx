import {
  IstokWeb_400Regular,
  IstokWeb_400Regular_Italic,
  IstokWeb_700Bold,
  IstokWeb_700Bold_Italic,
} from '@expo-google-fonts/istok-web';
import { Lato_700Bold } from '@expo-google-fonts/lato';
import {
  NotoSans_400Regular,
  NotoSans_700Bold,
} from '@expo-google-fonts/noto-sans';
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

/** AppProvider renders children only after state hydration, so mounting this
 *  keeps the splash up until both fonts and persisted state are ready. */
function HideSplash() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    IstokWeb_400Regular,
    IstokWeb_400Regular_Italic,
    IstokWeb_700Bold,
    IstokWeb_700Bold_Italic,
    Lato_700Bold,
    NotoSans_400Regular, // numeric voice (Latin digits)
    NotoSans_700Bold,
    NotoSansKR_400Regular,
    NotoSansKR_700Bold,
  });

  if (!loaded && !error) return null;

  return (
    <AppProvider>
      <HideSplash />
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
