import { nextChapterPassage } from './bible';
import { isoDate, mondayOf, today, todayReadingIndex } from './dates';
import type {
  BiblePassage,
  Group,
  Language,
  Membership,
  NotificationPreference,
  Reflection,
  ResponseEntry,
  ScheduleDay,
  UserProfile,
  Weekday,
  WeeklySchedule,
} from './types';

/**
 * Pure app-state contract: state shapes, action types, and selectors.
 *
 * This module has no React and no I/O so both the provider (store.tsx) and
 * the Supabase action layer (supabase-actions.ts) can depend on it without
 * forming a require cycle (store → supabase-actions → store).
 */

export const APP_STATE_VERSION = 1;

export interface PersistedAppState {
  version: number;
  language: Language;
  currentUserId: string | null;
  activeGroupId: string | null;
  users: UserProfile[];
  groups: Group[];
  memberships: Membership[];
  schedules: WeeklySchedule[];
  responses: ResponseEntry[];
  reflections: Reflection[];
  notificationPrefs: NotificationPreference[];
}

export interface TransientAppState {
  /** Verses highlighted in the current reading session (carried into Reflection). */
  draftVerses: number[];
}

export interface AppState extends PersistedAppState, TransientAppState {}

export const PERSISTED_STATE_KEYS = [
  'version',
  'language',
  'currentUserId',
  'activeGroupId',
  'users',
  'groups',
  'memberships',
  'schedules',
  'responses',
  'reflections',
  'notificationPrefs',
] as const satisfies readonly (keyof PersistedAppState)[];

export const TRANSIENT_STATE_KEYS = [
  'draftVerses',
] as const satisfies readonly (keyof TransientAppState)[];

export function transientInitialState(): TransientAppState {
  return { draftVerses: [] };
}

export function createHydratedAppState(persisted: PersistedAppState): AppState {
  return {
    ...persisted,
    ...transientInitialState(),
  };
}

export type Action =
  | { type: 'setLanguage'; language: Language }
  | {
      type: 'joinGroup';
      user: UserProfile;
      activeGroupId: string;
      memberships: Membership[];
      responses: ResponseEntry[];
      reflections: Reflection[];
    }
  | {
      type: 'createGroup';
      user: UserProfile;
      group: Group;
      schedule: WeeklySchedule;
      activeGroupId: string;
      memberships: Membership[];
    }
  | { type: 'setNotificationTime'; time: string }
  | { type: 'toggleDraftVerse'; n: number }
  | { type: 'clearDraftVerses' }
  | { type: 'amenToday'; date: string }
  | {
      type: 'postReflection';
      date: string;
      passage: BiblePassage;
      body: string;
      visibility: 'shared' | 'private';
      editId?: string;
    }
  | { type: 'setPrayerPoint'; text: string }
  | { type: 'setAnnouncement'; text: string }
  | { type: 'setDayPassage'; weekday: Weekday; passage: BiblePassage }
  | { type: 'setDayEnabled'; weekday: Weekday; enabled: boolean }
  | { type: 'setDayPublished'; weekday: Weekday; published: boolean }
  | { type: 'autoFillWeek' }
  | { type: 'publishWeek' }
  | { type: 'startWeek'; schedule: WeeklySchedule }
  | { type: 'switchGroup'; groupId: string }
  | { type: 'hydrateState'; state: AppState }
  | { type: 'resetDemoData' };

export interface AppActions {
  setLanguage: (l: Language) => void;
  /** Async in both modes: Supabase joins via RPC, demo resolves immediately. */
  joinGroup: (code: string, name: string) => Promise<boolean>;
  createGroup: (groupName: string, leaderName: string) => Promise<string | null>;
  setNotificationTime: (time: string) => void;
  toggleDraftVerse: (n: number) => void;
  clearDraftVerses: () => void;
  amenToday: () => void;
  postReflection: (args: {
    body: string;
    visibility: 'shared' | 'private';
    editId?: string;
  }) => void;
  setPrayerPoint: (text: string) => void;
  setAnnouncement: (text: string) => void;
  setDayPassage: (weekday: Weekday, passage: BiblePassage) => void;
  setDayEnabled: (weekday: Weekday, enabled: boolean) => void;
  setDayPublished: (weekday: Weekday, published: boolean) => void;
  autoFillWeek: () => void;
  publishWeek: () => void;
  startWeek: () => void;
  switchGroup: (groupId: string) => void;
  resetDemoData: () => void;
}

/**
 * Ordered chapter auto-fill: anchor on the first enabled day, then continue
 * whole chapters in canonical order across the remaining enabled days.
 * Shared by the reducer and the Supabase action (which mirrors the same
 * fill to the server), so the two can never diverge.
 */
export function computeAutoFillPassages(days: ScheduleDay[]): Map<Weekday, BiblePassage> {
  const enabledDays = [...days]
    .sort((a, b) => a.weekday - b.weekday)
    .filter((d) => d.enabled);
  const filled = new Map<Weekday, BiblePassage>();
  if (enabledDays.length === 0) return filled;
  let passage: BiblePassage = {
    book: enabledDays[0].passage.book,
    chapter: enabledDays[0].passage.chapter,
  };
  for (const d of enabledDays) {
    filled.set(d.weekday, passage);
    passage = nextChapterPassage(passage);
  }
  return filled;
}

export function getActiveMembership(s: AppState): Membership | undefined {
  return s.memberships.find(
    (m) => m.userId === s.currentUserId && m.groupId === s.activeGroupId,
  );
}

export function hasGroupMembership(s: AppState, groupId: string): boolean {
  return s.memberships.some(
    (m) => m.userId === s.currentUserId && m.groupId === groupId,
  );
}

export function hasActiveGroupLeaderRole(s: AppState): boolean {
  return getActiveMembership(s)?.role === 'leader';
}

export function userCanViewReflection(s: AppState, r: Reflection): boolean {
  if (!s.currentUserId) return false;
  if (r.userId === s.currentUserId) return true;
  return r.visibility === 'shared' && hasGroupMembership(s, r.groupId);
}

export function userCanEditReflection(s: AppState, r: Reflection): boolean {
  return !!s.currentUserId && r.userId === s.currentUserId;
}

// ---------------------------------------------------------------------------
// Selectors — pure helpers over AppState.
// ---------------------------------------------------------------------------

export const sel = {
  me(s: AppState): UserProfile | undefined {
    return s.users.find((u) => u.id === s.currentUserId);
  },

  activeGroup(s: AppState): Group | undefined {
    return s.groups.find((g) => g.id === s.activeGroupId);
  },

  activeMembership(s: AppState): Membership | undefined {
    return getActiveMembership(s);
  },

  myRole(s: AppState): 'leader' | 'member' | undefined {
    return getActiveMembership(s)?.role;
  },

  isActiveGroupLeader(s: AppState): boolean {
    return hasActiveGroupLeaderRole(s);
  },

  canManageActiveGroup(s: AppState): boolean {
    return hasActiveGroupLeaderRole(s);
  },

  isMemberOfGroup(s: AppState, groupId: string): boolean {
    return hasGroupMembership(s, groupId);
  },

  myGroups(s: AppState): { group: Group; membership: Membership; memberCount: number }[] {
    return s.memberships
      .filter((m) => m.userId === s.currentUserId)
      .flatMap((membership) => {
        const group = s.groups.find((g) => g.id === membership.groupId);
        if (!group) return [];
        return [
          {
            group,
            membership,
            memberCount: s.memberships.filter((mm) => mm.groupId === group.id).length,
          },
        ];
      });
  },

  activeSchedule(s: AppState): WeeklySchedule | undefined {
    const weekStart = isoDate(mondayOf(today()));
    return s.schedules.find(
      (sc) => sc.groupId === s.activeGroupId && sc.weekStart === weekStart,
    );
  },

  /** Today's schedule entry regardless of enabled/published (for rest states). */
  todayEntry(s: AppState): ScheduleDay | undefined {
    return sel
      .activeSchedule(s)
      ?.days.find((d) => d.weekday === todayReadingIndex());
  },

  /** Today's reading day, or undefined when today is a rest day. */
  todayDay(s: AppState): ScheduleDay | undefined {
    const day = sel.todayEntry(s);
    return day?.enabled ? day : undefined;
  },

  /**
   * Today's reading as visible to the current user: leaders see their enabled
   * days; members additionally need the week and the day published. Gate for
   * viewing the reading and for creating Amens/reflections against it.
   */
  todayVisibleDay(s: AppState): ScheduleDay | undefined {
    const day = sel.todayDay(s);
    if (!day) return undefined;
    if (sel.isActiveGroupLeader(s)) return day;
    return sel.activeSchedule(s)?.published && day.published ? day : undefined;
  },

  groupMembers(s: AppState, groupId: string): { user: UserProfile; role: string }[] {
    return s.memberships
      .filter((m) => m.groupId === groupId)
      .flatMap((m) => {
        const user = s.users.find((u) => u.id === m.userId);
        return user ? [{ user, role: m.role }] : [];
      })
      .sort((a, b) => (a.role === 'leader' ? -1 : b.role === 'leader' ? 1 : 0));
  },

  respondedToday(s: AppState, userId?: string): boolean {
    const uid = userId ?? s.currentUserId;
    const day = sel.todayDay(s);
    if (!day || !uid) return false;
    return s.responses.some(
      (r) => r.userId === uid && r.groupId === s.activeGroupId && r.date === day.date,
    );
  },

  myResponseKinds(s: AppState): ('amen' | 'reflection')[] {
    const day = sel.todayDay(s);
    if (!day || !s.currentUserId) return [];
    return s.responses
      .filter(
        (r) =>
          r.userId === s.currentUserId &&
          r.groupId === s.activeGroupId &&
          r.date === day.date,
      )
      .map((r) => r.kind);
  },

  respondedCountToday(s: AppState): { responded: number; total: number } {
    const day = sel.todayDay(s);
    const total = s.memberships.filter((m) => m.groupId === s.activeGroupId).length;
    if (!day) return { responded: 0, total };
    const uids = new Set(
      s.responses
        .filter((r) => r.groupId === s.activeGroupId && r.date === day.date)
        .map((r) => r.userId),
    );
    return { responded: uids.size, total };
  },

  amenUsersOn(s: AppState, date: string): UserProfile[] {
    return s.responses
      .filter((r) => r.groupId === s.activeGroupId && r.date === date && r.kind === 'amen')
      .flatMap((r) => {
        const u = s.users.find((uu) => uu.id === r.userId);
        return u ? [u] : [];
      });
  },

  sharedReflectionsOn(s: AppState, date: string): Reflection[] {
    return s.reflections
      .filter(
        (r) =>
          r.groupId === s.activeGroupId &&
          r.date === date &&
          r.visibility === 'shared' &&
          userCanViewReflection(s, r),
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  myReflections(s: AppState): Reflection[] {
    return s.reflections
      .filter((r) => r.userId === s.currentUserId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  },

  myAmens(s: AppState): ResponseEntry[] {
    return s.responses.filter((r) => r.userId === s.currentUserId && r.kind === 'amen');
  },

  reflectionById(s: AppState, id: string): Reflection | undefined {
    const reflection = s.reflections.find((r) => r.id === id);
    return reflection && userCanViewReflection(s, reflection) ? reflection : undefined;
  },

  canViewReflection(s: AppState, r: Reflection): boolean {
    return userCanViewReflection(s, r);
  },

  canEditReflection(s: AppState, r: Reflection): boolean {
    return userCanEditReflection(s, r);
  },

  notificationPref(s: AppState): NotificationPreference | undefined {
    return s.notificationPrefs.find((p) => p.userId === s.currentUserId);
  },

  userName(s: AppState, userId: string): string {
    const u = s.users.find((uu) => uu.id === userId);
    if (!u) return '?';
    return s.language === 'ko' && u.nameKo ? u.nameKo : u.name;
  },

  firstName(s: AppState, userId?: string): string {
    const uid = userId ?? s.currentUserId ?? '';
    const u = s.users.find((uu) => uu.id === uid);
    if (!u) return '';
    if (s.language === 'ko' && u.nameKo) return u.nameKo.length > 1 ? u.nameKo.slice(1) : u.nameKo;
    return u.name.split(' ')[0].toLowerCase();
  },

  groupName(s: AppState, g: Group): string {
    return s.language === 'ko' && g.nameKo ? g.nameKo : g.name;
  },

  reflectionBody(s: AppState, r: Reflection): string {
    return s.language === 'ko' && r.bodyKo ? r.bodyKo : r.body;
  },
};
