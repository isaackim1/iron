import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Card, Num, Pill, Screen, Txt } from '@/components/ui';
import { sel, useApp } from '@/lib/store';
import { colors } from '@/lib/theme';

export default function InviteCode() {
  const { state, t } = useApp();
  const [copied, setCopied] = useState(false);
  const group = sel.activeGroup(state);
  if (!group) return null;

  const share = async () => {
    await Clipboard.setStringAsync(group.inviteCode);
    setCopied(true);
  };

  return (
    <Screen>
      <View style={{ height: 56 }} />
      <Txt variant="title" center>
        {t('invite.ready', { group: sel.groupName(state, group) })}
      </Txt>
      <View style={{ height: 8 }} />
      <Txt variant="body" center size={14}>
        {t('invite.subtitle')}
      </Txt>
      <View style={{ height: 32 }} />
      <Card dark style={{ alignItems: 'center', paddingVertical: 32 }}>
        <Txt variant="body" size={14} color={colors.yellow}>
          {t('invite.codeLabel')}
        </Txt>
        <View style={{ height: 10 }} />
        {/* Invite code — Noto Sans numeric, tabular, +4% tracking on dark card. */}
        <Num size={42} color="#FFFFFF" track={0.04}>
          {group.inviteCode}
        </Num>
        <View style={{ height: 14 }} />
        <Txt variant="quote" center size={13} color={colors.mutedOnDark} style={{ maxWidth: 260 }}>
          {t('invite.body')}
        </Txt>
        <View style={{ height: 22 }} />
        <Pill
          small
          label={copied ? t('invite.copied') : t('invite.share')}
          kind={copied ? 'dark' : 'yellow'}
          onPress={share}
          style={copied ? { backgroundColor: '#474747' } : undefined}
        />
      </Card>
      <View style={{ flex: 1 }} />
      <Pill
        label={t('invite.continue')}
        kind="dark"
        onPress={() => router.push('/notification-time')}
        style={{ alignSelf: 'center', paddingHorizontal: 48 }}
      />
      <View style={{ height: 16 }} />
      <Txt variant="caption" center style={{ marginBottom: 24 }}>
        {t('invite.hint')}
      </Txt>
    </Screen>
  );
}
