import { router } from 'expo-router';
import { Image, TouchableOpacity, View } from 'react-native';
import { Pill, Screen, Txt } from '@/components/ui';
import { useApp } from '@/lib/store';
import { colors, radii } from '@/lib/theme';

export default function Welcome() {
  const { state, actions, t } = useApp();

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ flex: 1.1 }} />
        <Image
          source={require('../../assets/images/logo.png')}
          style={{ width: 74, height: 189, resizeMode: 'contain' }}
        />
        <View style={{ flex: 0.6 }} />
        <Txt variant="quote" center size={17} style={{ maxWidth: 300 }}>
          {t('welcome.quote')}
        </Txt>
        <View style={{ height: 10 }} />
        <Txt variant="caption" center>
          {t('welcome.tagline')}
        </Txt>
        <View style={{ flex: 0.8 }} />
        <Pill
          label={t('welcome.join')}
          onPress={() => router.push('/join')}
          style={{ alignSelf: 'stretch', marginHorizontal: 40 }}
        />
        <TouchableOpacity onPress={() => router.push('/create')} style={{ marginTop: 18 }}>
          <Txt variant="caption" style={{ textDecorationLine: 'underline' }}>
            {t('welcome.create')}
          </Txt>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />

        {/* Language toggle */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: colors.input,
            borderRadius: radii.pill,
            padding: 4,
            marginBottom: 28,
          }}
        >
          {(['en', 'ko'] as const).map((lang) => {
            const active = state.language === lang;
            return (
              <TouchableOpacity
                key={lang}
                onPress={() => actions.setLanguage(lang)}
                style={{
                  backgroundColor: active ? colors.card : 'transparent',
                  borderRadius: radii.pill,
                  paddingVertical: 6,
                  paddingHorizontal: 22,
                }}
              >
                <Txt
                  variant={active ? 'button' : 'body'}
                  size={13}
                  color={active ? colors.ink : colors.muted}
                >
                  {lang === 'en' ? 'EN' : '한국어'}
                </Txt>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
