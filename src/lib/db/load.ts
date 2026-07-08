import { addDays, fromIso, isoDate, mondayOf, today } from '../dates';
import { requireSupabase } from '../supabase';
import type {
  Group,
  Membership,
  NotificationPreference,
  Reflection,
  ResponseEntry,
  ScheduleDay,
  UserProfile,
  Weekday,
  WeeklySchedule,
} from '../types';
import { mapProfile } from './profiles';
import { mapReflection } from './reflections';
import type {
  AmenResponseRow,
  GroupRow,
  InviteCodeRow,
  MembershipRow,
  NotificationPreferenceRow,
  ProfileRow,
  ReflectionRow,
  ScheduleDayRow,
  WeeklyScheduleRow,
} from './types';

/** Server-backed portion of the app state, in the app's own types. */
export interface ServerAppData {
  users: UserProfile[];
  groups: Group[];
  memberships: Membership[];
  schedules: WeeklySchedule[];
  responses: ResponseEntry[];
  reflections: Reflection[];
  notificationPrefs: NotificationPreference[];
}

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const satisfies readonly Weekday[];

/** Feed shows today/yesterday; two weeks of history is plenty for the MVP. */
const ACTIVITY_WINDOW_DAYS = 14;

/**
 * A member's SELECT on schedule_days only returns enabled+published days of
 * published weeks (RLS). The app renders a full Mon–Sun week, so RLS-hidden
 * rows are re-synthesized as rest days — a member sees "no reading today" for
 * hidden days, exactly like rest days, and the placeholder passage is never
 * rendered. Leaders always receive all 7 rows.
 */
function normalizeWeek(row: WeeklyScheduleRow, dayRows: ScheduleDayRow[]): WeeklySchedule {
  const monday = fromIso(row.week_start);
  const days = ALL_WEEKDAYS.map((weekday): ScheduleDay => {
    const existing = dayRows.find((d) => d.weekday === weekday);
    if (existing) {
      return {
        id: existing.id,
        weekday,
        date: existing.date,
        passage: {
          book: existing.book,
          chapter: existing.chapter,
          verseStart: existing.verse_start ?? undefined,
          verseEnd: existing.verse_end ?? undefined,
        },
        enabled: existing.enabled,
        published: existing.published,
      };
    }
    return {
      weekday,
      date: isoDate(addDays(monday, weekday)),
      passage: { book: 'Proverbs', chapter: 1 }, // never rendered for rest days
      enabled: false,
      published: true,
    };
  });

  return {
    id: row.id,
    groupId: row.group_id,
    weekStart: row.week_start,
    days,
    prayerPoint: row.prayer_point,
    prayerPointKo: row.prayer_point_ko ?? undefined,
    announcement: row.announcement ?? undefined,
    announcementKo: row.announcement_ko ?? undefined,
    published: row.status === 'published',
  };
}

/**
 * Load everything the app state mirrors from Supabase. Row visibility is
 * enforced by RLS, so every query is a plain select: profiles come back only
 * for groupmates, groups/memberships only for my groups, invite codes only
 * for groups I lead, schedules per the draft/hidden-day rules, reflections
 * per visibility.
 */
export async function loadServerAppData(uid: string): Promise<ServerAppData> {
  const supabase = requireSupabase();
  const weekStart = isoDate(mondayOf(today()));
  const activityCutoff = isoDate(addDays(today(), -ACTIVITY_WINDOW_DAYS));

  const [profilesQ, groupsQ, membershipsQ, codesQ, schedulesQ, reflectionsQ, amensQ, prefsQ] =
    await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('groups').select('*').eq('status', 'active'),
      supabase.from('memberships').select('*').eq('status', 'active'),
      supabase.from('invite_codes').select('*').eq('status', 'active'),
      supabase
        .from('weekly_schedules')
        .select('*, schedule_days(*)')
        .eq('week_start', weekStart),
      supabase
        .from('reflections')
        .select('*')
        .or(`user_id.eq.${uid},date.gte.${activityCutoff}`),
      supabase.from('amen_responses').select('*').gte('date', activityCutoff),
      supabase.from('notification_preferences').select('*'),
    ]);

  const firstError =
    profilesQ.error ?? groupsQ.error ?? membershipsQ.error ?? codesQ.error ??
    schedulesQ.error ?? reflectionsQ.error ?? amensQ.error ?? prefsQ.error;
  if (firstError) throw firstError;

  const codes = (codesQ.data ?? []) as InviteCodeRow[];
  const groups: Group[] = ((groupsQ.data ?? []) as GroupRow[]).map((g) => ({
    id: g.id,
    name: g.name,
    nameKo: g.name_ko ?? undefined,
    description: g.description ?? '',
    descriptionKo: g.description_ko ?? undefined,
    // RLS only returns codes for groups this user leads; members see ''.
    // The invite-code screens are leader-only, so '' is never rendered.
    inviteCode: codes.find((c) => c.group_id === g.id)?.code ?? '',
    createdBy: g.created_by,
  }));

  const memberships: Membership[] = ((membershipsQ.data ?? []) as MembershipRow[]).map(
    (m) => ({
      userId: m.user_id,
      groupId: m.group_id,
      role: m.role,
      joinedAt: m.created_at.slice(0, 10),
    }),
  );

  const schedules: WeeklySchedule[] = (
    (schedulesQ.data ?? []) as (WeeklyScheduleRow & { schedule_days: ScheduleDayRow[] })[]
  ).map((row) => normalizeWeek(row, row.schedule_days ?? []));

  const reflections: Reflection[] = ((reflectionsQ.data ?? []) as ReflectionRow[]).map(
    mapReflection,
  );

  // "Who responded" is the union of Amens and reflections (contract §7): Amen
  // rows map directly; reflection response entries are synthesized client-side.
  const responses: ResponseEntry[] = [
    ...((amensQ.data ?? []) as AmenResponseRow[]).map((a) => ({
      id: a.id,
      userId: a.user_id,
      groupId: a.group_id,
      date: a.date,
      kind: 'amen' as const,
      createdAt: a.created_at,
    })),
    ...reflections.map((r) => ({
      id: `resp-${r.id}`,
      userId: r.userId,
      groupId: r.groupId,
      date: r.date,
      kind: 'reflection' as const,
      reflectionId: r.id,
      createdAt: r.createdAt,
    })),
  ];

  const notificationPrefs: NotificationPreference[] = (
    (prefsQ.data ?? []) as NotificationPreferenceRow[]
  ).map((p) => ({
    userId: p.user_id,
    time: p.time_of_day.slice(0, 5),
    timezone: p.timezone,
  }));

  return {
    users: ((profilesQ.data ?? []) as ProfileRow[]).map(mapProfile),
    groups,
    memberships,
    schedules,
    responses,
    reflections,
    notificationPrefs,
  };
}
