import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Card, Pill, Txt } from '@/components/ui';
import { sel, useApp } from '@/lib/store';
import { colors, radii } from '@/lib/theme';

/**
 * My Groups switcher — used by the member Group tab and by the
 * leader-facing /groups screen. Selecting a group makes it active;
 * the tab layout re-derives the role (Manage vs Group tab) from it.
 */
export function GroupsGrid() {
  const { state, actions, t } = useApp();
  const mine = sel.myGroups(state);

  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 8 }}>
        <Pill small label={t('groups.add')} onPress={() => router.push('/join')} />
      </View>

      {/* decorative search */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.card,
          borderRadius: radii.pill,
          paddingVertical: 13,
          paddingHorizontal: 18,
          marginBottom: 18,
        }}
      >
        <Feather name="search" size={15} color={colors.muted} />
        <Txt variant="caption" style={{ marginLeft: 10 }}>
          {t('join.codePlaceholder')}
        </Txt>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {mine.map(({ group, membership, memberCount }) => {
          const active = group.id === state.activeGroupId;
          const description =
            state.language === 'ko' && group.descriptionKo
              ? group.descriptionKo
              : group.description;
          return (
            <Card
              key={group.id}
              onPress={() => {
                actions.switchGroup(group.id);
                router.navigate('/(tabs)/home');
              }}
              style={{
                width: '47%',
                minHeight: 220,
                backgroundColor: active ? colors.yellow : colors.cardDark,
              }}
            >
              {/* Flexible centered content region; the meta line below it sits
                  at the same bottom position on every card regardless of how
                  many lines the name/description wrap to. */}
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Txt
                  variant="quoteBold"
                  center
                  size={20}
                  numberOfLines={3}
                  color={active ? colors.ink : colors.yellow}
                  style={{ lineHeight: 28 }}
                >
                  {sel.groupName(state, group)}
                </Txt>
                {!!description && (
                  <>
                    <View style={{ height: 10 }} />
                    <Txt
                      variant="quote"
                      center
                      size={13}
                      numberOfLines={2}
                      color={active ? colors.charcoal : colors.onDark}
                    >
                      {description}
                    </Txt>
                  </>
                )}
              </View>
              <Txt
                variant="caption"
                center
                size={10}
                numberOfLines={1}
                color={active ? colors.charcoal : colors.mutedOnDark}
                style={{ marginTop: 14 }}
              >
                {membership.role === 'leader'
                  ? t('groups.leaderMeta', { n: memberCount })
                  : t('groups.memberMeta', { n: memberCount })}
              </Txt>
            </Card>
          );
        })}
      </View>
    </>
  );
}
