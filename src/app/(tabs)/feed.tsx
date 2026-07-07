import { router } from 'expo-router';
import { View } from 'react-native';
import { Avatar, Card, Pill, Screen, Txt } from '@/components/ui';
import { passageLabel } from '@/lib/bible';
import { addDays, fmtDateShort, fromIso, isoDate } from '@/lib/dates';
import { sel, useApp } from '@/lib/store';
import type { Reflection } from '@/lib/types';
import { colors, radii } from '@/lib/theme';

function ReflectionCard({ r, index }: { r: Reflection; index: number }) {
  const { state, t } = useApp();
  // Parse instead of slicing the string: real posts store UTC ISO strings
  // (trailing Z), seeded data stores local-naive ones — Date handles both.
  const created = new Date(r.createdAt);
  const time = Number.isNaN(created.getTime())
    ? ''
    : `${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}`;
  return (
    <Card
      style={{ marginBottom: 12, padding: 18 }}
      onPress={() => router.push(`/reflection/${r.id}`)}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Avatar name={sel.userName(state, r.userId)} size={26} index={index} />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Txt variant="button" size={13} color={colors.ink}>
            {sel.userName(state, r.userId)}
          </Txt>
          <Txt variant="caption" size={11}>
            {passageLabel(r.passage, state.language)} · {t('feed.reflectionTag')}
          </Txt>
        </View>
        <Txt variant="caption" size={11}>
          {time}
        </Txt>
      </View>
      <View style={{ height: 10 }} />
      <Txt variant="quote" size={14} numberOfLines={3} style={{ lineHeight: 22 }}>
        {sel.reflectionBody(state, r)}
      </Txt>
      <View style={{ height: 8 }} />
      <Txt variant="caption" size={11} style={{ alignSelf: 'flex-end' }}>
        {t('feed.readMore')}
      </Txt>
    </Card>
  );
}

export default function Feed() {
  const { state, t } = useApp();
  const group = sel.activeGroup(state);
  const todayDay = sel.todayDay(state);
  const responded = sel.respondedToday(state);
  const { responded: respondedCount, total } = sel.respondedCountToday(state);
  if (!group) return null;

  const todayIso = todayDay?.date;
  const yesterdayIso = todayIso
    ? isoDate(addDays(fromIso(todayIso), -1))
    : undefined;

  const todayShared = todayIso ? sel.sharedReflectionsOn(state, todayIso) : [];
  const yesterdayShared = yesterdayIso ? sel.sharedReflectionsOn(state, yesterdayIso) : [];
  const amens = todayIso ? sel.amenUsersOn(state, todayIso) : [];

  const amenNames = amens.slice(0, 3).map((u) => sel.firstName(state, u.id));
  const amenLine =
    amens.length > 3
      ? `${amenNames.join(', ')} +${amens.length - 3}`
      : amenNames.join(', ');

  return (
    <Screen>
      <View style={{ height: 10 }} />
      {/* group summary card */}
      <Card dark style={{ paddingVertical: 24 }}>
        <Txt variant="quoteBold" size={24} color={colors.yellow} style={{ lineHeight: 32 }}>
          {sel.groupName(state, group)}
        </Txt>
        <View style={{ height: 14 }} />
        {[
          [t('feed.todayChapter'), todayDay ? passageLabel(todayDay.passage, state.language) : '—'],
          [t('feed.responded'), t('feed.of', { x: respondedCount, n: total })],
          [t('feed.total'), String(total)],
        ].map(([k, v]) => (
          <View
            key={k}
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}
          >
            <Txt variant="body" size={13} color={colors.yellow}>
              {k}
            </Txt>
            <Txt variant="body" size={13} color={colors.onDark}>
              {v}
            </Txt>
          </View>
        ))}
      </Card>

      <View style={{ height: 22 }} />
      {todayIso && (
        <Txt variant="title" size={18}>
          {t('feed.today', { date: fmtDateShort(fromIso(todayIso), state.language) })}
        </Txt>
      )}
      <View style={{ height: 12 }} />

      {!responded ? (
        /* soft gate — respond first, then see today's reflections */
        <Card style={{ alignItems: 'center', paddingVertical: 30 }}>
          <Txt variant="body" center size={14} style={{ lineHeight: 22 }}>
            {t('feed.gate')}
          </Txt>
          <View style={{ height: 18 }} />
          <Pill small label={t('feed.gateCta')} onPress={() => router.push('/reading')} />
        </Card>
      ) : (
        <>
          {amens.length > 0 && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.card,
                borderRadius: radii.pill,
                paddingVertical: 10,
                paddingHorizontal: 16,
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: 'row', marginRight: 10 }}>
                {amens.slice(0, 4).map((u, i) => (
                  <View key={u.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                    <Avatar name={sel.userName(state, u.id)} size={22} index={i} />
                  </View>
                ))}
              </View>
              <Txt variant="caption" size={12} style={{ flex: 1 }}>
                {t('feed.amenLine', { names: amenLine })}
              </Txt>
            </View>
          )}
          {todayShared.map((r, i) => (
            <ReflectionCard key={r.id} r={r} index={i + 1} />
          ))}
          {todayShared.length === 0 && amens.length === 0 && (
            <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
              <Txt variant="quoteBold" size={17} color={colors.muted}>
                {t('feed.quiet')}
              </Txt>
              <View style={{ height: 6 }} />
              <Txt variant="caption" center>
                {t('feed.quietSub')}
              </Txt>
            </Card>
          )}
        </>
      )}

      {yesterdayShared.length > 0 && yesterdayIso && (
        <>
          <View style={{ height: 20 }} />
          <Txt variant="title" size={18}>
            {t('feed.yesterday', { date: fmtDateShort(fromIso(yesterdayIso), state.language) })}
          </Txt>
          <View style={{ height: 12 }} />
          {yesterdayShared.map((r, i) => (
            <ReflectionCard key={r.id} r={r} index={i + 2} />
          ))}
        </>
      )}
    </Screen>
  );
}
