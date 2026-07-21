import { router } from 'expo-router';
import React, { type ReactNode } from 'react';
import {
  Image,
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

// Text roles map 1:1 to the Brand System's bilingual type scale (04 · Typography).
type Variant =
  | 'title' // 03 Title Screen — 24 / one per screen
  | 'titleSection' // 04 Title Section — 18 / sections inside a screen
  | 'body' // 05 Body — 15
  | 'quote' // 06 Quote Body — 15, Scripture italic (EN)
  | 'quoteBold' // 02 Quote Display — 24, big quotes / chapter refs
  | 'button' // 07 Button — 14
  | 'label' // 09 Label — 13, card labels
  | 'caption' // 10 Caption — 12, hints
  | 'meta'; // 11 Metadata — 11, timestamps / dot-separated meta

const VARIANT_DEFAULTS: Record<Variant, { size: number; color: string }> = {
  title: { size: 24, color: colors.ink },
  titleSection: { size: 18, color: colors.ink },
  body: { size: 15, color: colors.charcoal },
  quote: { size: 15, color: colors.charcoal },
  quoteBold: { size: 24, color: colors.ink },
  button: { size: 14, color: colors.charcoal },
  label: { size: 13, color: colors.muted },
  caption: { size: 12, color: colors.muted },
  meta: { size: 11, color: colors.muted },
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
  // Label/caption/meta share the body face; section titles share the title face.
  const familyKey =
    variant === 'caption' || variant === 'label' || variant === 'meta'
      ? 'body'
      : variant === 'titleSection'
        ? 'title'
        : variant;
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

/**
 * Numeric voice — Noto Sans with tabular figures (confirmed brand decision).
 * Use for *standalone* numerals only: OTP codes, invite codes, times,
 * week-strip dates, standalone counts. Numerals inside a running/translated
 * sentence stay in the sentence's font (no mid-line switch, no string parser),
 * so those keep using <Txt>. `track` is the tracking fraction of the font size
 * (OTP ≈ 0.30, invite code ≈ 0.04).
 */
export function Num({
  children,
  size = 15,
  color = colors.ink,
  track = 0,
  weight = 'bold',
  center,
  style,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  track?: number;
  weight?: 'regular' | 'bold';
  center?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { state } = useApp();
  return (
    <Text
      style={[
        {
          fontFamily: fonts.numeric(state.language, weight),
          fontSize: size,
          color,
          letterSpacing: size * track,
          lineHeight: size * 1.3,
          fontVariant: ['tabular-nums'],
          textAlign: center ? 'center' : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const LOGO_RATIO = 189 / 74; // symbol source aspect (assets/images/logo.png)

/**
 * The Iron logo. `<Logo />` renders the "blade-i" symbol alone — its in-app use
 * (onboarding, sign-in, verify), where the approved screens are symbol-only.
 * `<Logo wordmark />` renders the full lockup: the symbol with the IRON wordmark
 * in Lato Bold, uppercase, optically tracked (confirmed brand decision — for
 * splash / headers / brand assets). Do not redesign the symbol.
 */
export function Logo({
  height = 96,
  wordmark = false,
  layout = 'stacked',
  onDark = false,
  style,
}: {
  height?: number;
  wordmark?: boolean;
  layout?: 'stacked' | 'horizontal';
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const mark = (
    <Image
      source={require('../../assets/images/logo.png')}
      style={{ height, width: height / LOGO_RATIO, resizeMode: 'contain' }}
    />
  );
  if (!wordmark) {
    return <View style={[{ alignItems: 'center' }, style]}>{mark}</View>;
  }
  const wmSize = height * (layout === 'horizontal' ? 0.46 : 0.3);
  return (
    <View
      style={[
        {
          alignItems: 'center',
          flexDirection: layout === 'horizontal' ? 'row' : 'column',
          gap: height * (layout === 'horizontal' ? 0.32 : 0.22),
        },
        style,
      ]}
    >
      {mark}
      <Text
        style={{
          fontFamily: 'Lato_700Bold',
          textTransform: 'uppercase',
          color: onDark ? colors.onDark : colors.ink,
          fontSize: wmSize,
          letterSpacing: wmSize * 0.14, // optical tracking for the uppercase wordmark
        }}
      >
        IRON
      </Text>
    </View>
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

/**
 * The one button shape. Four kinds map to the Brand System's component set:
 *   yellow  — Primary CTA (Accent Soft fill)          · one per screen
 *   dark    — Dark pill (Action Dark fill)            · Read / Close, inside cards
 *   white   — Secondary CTA (Surface + Border/Subtle) · toggles beside a primary
 *   danger  — Destructive (State/Error fill)          · always behind a confirm
 *   onDark  — Accent pill sitting on a dark surface
 * Geometry stays fixed (17/32 · small 9/22); pressed = 80% opacity,
 * disabled = 45% — exactly as documented in 06 · Product Components.
 */
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
  kind?: 'yellow' | 'dark' | 'white' | 'onDark' | 'danger';
  small?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    kind === 'yellow' || kind === 'onDark'
      ? colors.yellowSoft
      : kind === 'dark'
        ? colors.charcoal
        : kind === 'danger'
          ? colors.danger
          : colors.card;
  const fg = kind === 'dark' || kind === 'danger' ? colors.onDark : colors.charcoal;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled}
      // Small pills read below 48dp; extend the tap area without altering the
      // visual size so touch targets stay accessible.
      hitSlop={small ? { top: 8, bottom: 8, left: 4, right: 4 } : undefined}
      style={[
        {
          backgroundColor: bg,
          borderRadius: radii.pill,
          borderWidth: kind === 'white' ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: colors.hairline,
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
      // Keep the glyph visually compact (so adjacent titles sit close) but
      // extend the tap area past 44dp via hitSlop rather than layout width.
      hitSlop={{ top: 16, bottom: 16, left: 18, right: 18 }}
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
