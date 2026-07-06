import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Card, Chip, Screen, Txt } from '@/components/ui';
import { passageLabel } from '@/lib/bible';
import { fmtDayShort, fromIso } from '@/lib/dates';
import { sel, useApp } from '@/lib/store';
import { colors } from '@/lib/theme';

type Filter = 'all' | 'shared' | 'private';

interface Entry {
  key: string;
  date: string;
  kind: 'reflection' | 'amen';
  reflectionId?: string;
  passageLabel: string;
  tag: string;
  snippet?: string;
}

export default function ReflectTab() {
  const { state, t } = useApp();
  const [filter, setFilter] = useState<Filter>('all');

  const entries = useMemo<Entry[]>(() => {
    const reflections = sel
      .myReflections(state)
      .filter((r) => filter === 'all' || r.visibility === filter)
      .map((r) => ({
        key: r.id,
        date: r.date,
        kind: 'reflection' as const,
        reflectionId: r.id,
        passageLabel: passageLabel(r.passage, state.language),
        tag: r.visibility === 'shared' ? t('archive.sharedTag') : t('archive.privateTag'),
        snippet: sel.reflectionBody(state, r),
      }));
    const amens =
      filter === 'all'
        ? sel.myAmens(state).map((a) => {
            const day = sel
              .activeSchedule(state)
              ?.days.find((d) => d.date === a.date);
            return {
              key: a.id,
              date: a.date,
              kind: 'amen' as const,
              passageLabel: day ? passageLabel(day.passage, state.language) : '',
              tag: t('archive.amenTag'),
            };
          })
        : [];
    return [...reflections, ...amens].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [state, filter, t]);

  const byDate: [string, Entry[]][] = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      map.set(e.date, [...(map.get(e.date) ?? []), e]);
    }
    return [...map.entries()];
  }, [entries]);

  return (
    <Screen>
      <View style={{ height: 10 }} />
      <Txt variant="title" size={26}>
        {t('archive.title')}
      </Txt>
      <View style={{ height: 14 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['all', 'shared', 'private'] as const).map((f) => (
          <Chip
            key={f}
            label={t(`archive.${f}`)}
            active={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>
      <View style={{ height: 22 }} />

      {byDate.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Txt variant="quoteBold" size={17} color={colors.muted}>
            {t('archive.empty')}
          </Txt>
          <View style={{ height: 10 }} />
          <Txt variant="caption" center style={{ maxWidth: 260 }}>
            {t('archive.emptySub')}
          </Txt>
        </Card>
      ) : (
        byDate.map(([date, list]) => (
          <View key={date} style={{ marginBottom: 18 }}>
            <Txt variant="title" size={15} style={{ marginBottom: 8 }}>
              {fmtDayShort(fromIso(date), state.language)}
            </Txt>
            {list.map((e) => (
              <Card
                key={e.key}
                style={{ padding: 16, marginBottom: 8 }}
                onPress={
                  e.reflectionId
                    ? () => router.push(`/reflection/${e.reflectionId}`)
                    : undefined
                }
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Txt variant="button" size={12} color={colors.ink}>
                    {e.passageLabel}
                  </Txt>
                  <Txt
                    variant="caption"
                    size={11}
                    color={e.kind === 'amen' ? colors.muted : colors.charcoal}
                  >
                    {e.tag}
                  </Txt>
                </View>
                {e.snippet ? (
                  <>
                    <View style={{ height: 6 }} />
                    <Txt variant="quote" size={13} numberOfLines={2} style={{ lineHeight: 20 }}>
                      {e.snippet}
                    </Txt>
                  </>
                ) : null}
              </Card>
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}
