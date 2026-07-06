import { router } from 'expo-router';
import React, { type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/lib/store';
import { colors, fonts, radii, spacing } from '@/lib/theme';

type Variant = 'title' | 'body' | 'quote' | 'quoteBold' | 'button' | 'caption' | 'label';

const VARIANT_DEFAULTS: Record<Variant, { size: number; color: string }> = {
  title: { size: 24, color: colors.ink },
  body: { size: 15, color: colors.charcoal },
  quote: { size: 15, color: colors.charcoal },
  quoteBold: { size: 24, color: colors.ink },
  button: { size: 14, color: colors.charcoal },
  caption: { size: 12, color: colors.muted },
  label: { size: 13, color: colors.muted },
};

export function Txt({
  variant = 'body',
  size,
  color,
  center,
  style,
  children,
  numberOfLines,
}: {
  variant?: Variant;
  size?: number;
  color?: string;
  center?: boolean;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  const { state } = useApp();
  const d = VARIANT_DEFAULTS[variant];
  const familyKey = variant === 'caption' || variant === 'label' ? 'body' : variant;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: fonts[familyKey as keyof typeof fonts](state.language),
          fontSize: size ?? d.size,
          color: color ?? d.color,
          textAlign: center ? 'center' : undefined,
          lineHeight: (size ?? d.size) * 1.45,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inner = padded ? (
    <View style={[styles.padded, style]}>{children}</View>
  ) : (
    <View style={[{ flex: 1 }, style]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function Pill({
  label,
  onPress,
  kind = 'yellow',
  small,
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  kind?: 'yellow' | 'dark' | 'white' | 'onDark';
  small?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    kind === 'yellow'
      ? colors.yellowSoft
      : kind === 'dark'
        ? colors.charcoal
        : kind === 'onDark'
          ? colors.yellowSoft
          : colors.card;
  const fg = kind === 'dark' ? colors.onDark : colors.charcoal;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          backgroundColor: bg,
          borderRadius: radii.pill,
          paddingVertical: small ? 9 : 17,
          paddingHorizontal: small ? 22 : 32,
          alignItems: 'center',
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      <Txt variant="button" color={fg} size={small ? 13 : 14}>
        {label}
      </Txt>
    </TouchableOpacity>
  );
}

export function BackChevron({ onDark }: { onDark?: boolean }) {
  return (
    <TouchableOpacity
      onPress={() => router.back()}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={{ alignSelf: 'flex-start', paddingVertical: 4 }}
    >
      <Text
        style={{
          fontFamily: 'IstokWeb_700Bold',
          fontSize: 28,
          color: onDark ? colors.onDark : colors.ink,
          lineHeight: 30,
        }}
      >
        ‹
      </Text>
    </TouchableOpacity>
  );
}

export function Card({
  children,
  dark,
  style,
  onPress,
}: {
  children: ReactNode;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const base: ViewStyle = {
    backgroundColor: dark ? colors.cardDark : colors.card,
    borderRadius: radii.card,
    padding: 22,
  };
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[base, style]}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

const AVATAR_TONES = ['#FFCF00', '#2C2C2A', '#8A8880', '#C9C7BE', '#474747'];

export function Avatar({
  name,
  size = 26,
  index = 0,
}: {
  name: string;
  size?: number;
  index?: number;
}) {
  const bg = AVATAR_TONES[index % AVATAR_TONES.length];
  const light = bg === '#FFCF00' || bg === '#C9C7BE';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: light ? colors.ink : colors.onDark,
          fontSize: size * 0.42,
          fontFamily: 'Lato_700Bold',
        }}
      >
        {name.trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: active ? colors.yellowSoft : colors.input,
        borderRadius: radii.pill,
        paddingVertical: 7,
        paddingHorizontal: 18,
      }}
    >
      <Txt variant="button" size={12} color={active ? colors.ink : colors.muted}>
        {label}
      </Txt>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  padded: { flex: 1, paddingHorizontal: spacing.screen },
});
