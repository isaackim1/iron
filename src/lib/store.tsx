import React, {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { addDays, isoDate, mondayOf, today, todayReadingIndex } from './dates';
import { translate } from './i18n';
import {
  buildJoinerHistory,
  buildSeedActivity,
  buildSeedSchedules,
  seedGroups,
  seedMemberships,
  seedNotificationPrefs,
  seedUsers,
} from './mock';
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

export interface AppState {
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
  /** Verses highlighted in the current reading session (carried into Reflection). */
  draftVerses: number[];
}

function initialState(): AppState {
  const { responses, reflections } = buildSeedActivity();
  return {
    language: 'en',
    currentUserId: null,
    activeGroupId: null,
    users: seedUsers,
    groups: seedGroups,
    memberships: seedMemberships,
    schedules: buildSeedSchedules(),
    responses,
    reflections,
    notificationPrefs: seedNotificationPrefs,
    draftVerses: [],
  };
}

type Action =
  | { type: 'setLanguage'; language: Language }
  | { type: 'joinGroup'; user: UserProfile; groupId: string }
  | { type: 'createGroup'; user: UserProfile; group: Group; schedule: WeeklySchedule }
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
  | { type: 'publishWeek' }
  | { type: 'switchGroup'; groupId: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setLanguage':
      return { ...state, language: action.language };

    case 'joinGroup': {
      const history = buildJoinerHistory(action.user.id);
      const extraMemberships: Membership[] = [
        {
          userId: action.user.id,
          groupId: action.groupId,
          role: 'member' as const,
          joinedAt: isoDate(today()),
        },
        // Demo seed: second membership so the group switcher is meaningful.
        {
          userId: action.user.id,
          groupId: 'g-word',
          role: 'member' as const,
          joinedAt: isoDate(today()),
        },
      ].filter((m) => state.groups.some((g) => g.id === m.groupId));
      return {
        ...state,
        users: [...state.users, action.user],
        memberships: [...state.memberships, ...extraMemberships],
        responses: [...state.responses, ...history.responses],
        reflections: [...state.reflections, ...history.reflections],
        currentUserId: action.user.id,
        activeGroupId: action.groupId,
      };
    }

    case 'createGroup':
      return {
        ...state,
        users: [...state.users, action.user],
        groups: [...state.groups, action.group],
        memberships: [
          ...state.memberships,
          {
            userId: action.user.id,
            groupId: action.group.id,
            role: 'leader',
            joinedAt: isoDate(today()),
          },
          // Demo seed: new leaders also belong to the seeded group as a
          // regular member, so the leader ↔ member switching is testable.
          ...(state.groups.some((g) => g.id === 'g-honest')
            ? [
                {
                  userId: action.user.id,
                  groupId: 'g-honest',
                  role: 'member' as const,
                  joinedAt: isoDate(today()),
                },
              ]
            : []),
        ],
        schedules: [...state.schedules, action.schedule],
        currentUserId: action.user.id,
        activeGroupId: action.group.id,
      };

    case 'setNotificationTime': {
      if (!state.currentUserId) return state;
      const rest = state.notificationPrefs.filter(
        (p) => p.userId !== state.currentUserId,
      );
      return {
        ...state,
        notificationPrefs: [
          ...rest,
          {
            userId: state.currentUserId,
            time: action.time,
            timezone: 'Europe/Amsterdam',
          },
        ],
      };
    }

    case 'toggleDraftVerse': {
      const has = state.draftVerses.includes(action.n);
      return {
        ...state,
        draftVerses: has
          ? state.draftVerses.filter((v) => v !== action.n)
          : [...state.draftVerses, action.n].sort((a, b) => a - b),
      };
    }

    case 'clearDraftVerses':
      return { ...state, draftVerses: [] };

    case 'amenToday': {
      if (!state.currentUserId || !state.activeGroupId) return state;
      const exists = state.responses.some(
        (r) =>
          r.userId === state.currentUserId &&
          r.groupId === state.activeGroupId &&
          r.date === action.date &&
          r.kind === 'amen',
      );
      if (exists) return state;
      return {
        ...state,
        responses: [
          ...state.responses,
          {
            id: `resp-${Date.now()}`,
            userId: state.currentUserId,
            groupId: state.activeGroupId,
            date: action.date,
            kind: 'amen',
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }

    case 'postReflection': {
      if (!state.currentUserId || !state.activeGroupId) return state;
      if (action.editId) {
        return {
          ...state,
          reflections: state.reflections.map((r) =>
            r.id === action.editId
              ? { ...r, body: action.body, bodyKo: undefined, visibility: action.visibility }
              : r,
          ),
          draftVerses: [],
        };
      }
      const id = `r-${Date.now()}`;
      const reflection: Reflection = {
        id,
        userId: state.currentUserId,
        groupId: state.activeGroupId,
        date: action.date,
        passage: action.passage,
        highlightedVerses: state.draftVerses,
        body: action.body,
        visibility: action.visibility,
        createdAt: new Date().toISOString(),
      };
      return {
        ...state,
        reflections: [...state.reflections, reflection],
        responses: [
          ...state.responses,
          {
            id: `resp-${id}`,
            userId: state.currentUserId,
            groupId: state.activeGroupId,
            date: action.date,
            kind: 'reflection',
            reflectionId: id,
            createdAt: new Date().toISOString(),
          },
        ],
        draftVerses: [],
      };
    }

    case 'setPrayerPoint':
    case 'setAnnouncement':
    case 'publishWeek':
    case 'setDayPassage': {
      if (!state.activeGroupId) return state;
      const weekStart = isoDate(mondayOf(today()));
      return {
        ...state,
        schedules: state.schedules.map((s) => {
          if (s.groupId !== state.activeGroupId || s.weekStart !== weekStart) return s;
          switch (action.type) {
            case 'setPrayerPoint':
              return { ...s, prayerPoint: action.text, prayerPointKo: undefined };
            case 'setAnnouncement':
              return { ...s, announcement: action.text, announcementKo: undefined };
            case 'publishWeek':
              return { ...s, published: true };
            case 'setDayPassage':
              return {
                ...s,
                days: s.days.map((d) =>
                  d.weekday === action.weekday ? { ...d, passage: action.passage } : d,
                ),
              };
          }
        }),
      };
    }

    case 'switchGroup':
      return { ...state, activeGroupId: action.groupId };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------

export interface AppActions {
  setLanguage: (l: Language) => void;
  joinGroup: (code: string, name: string) => boolean;
  createGroup: (groupName: string, leaderName: string) => string;
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
  publishWeek: () => void;
  switchGroup: (groupId: string) => void;
}

interface AppContextValue {
  state: AppState;
  actions: AppActions;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  });

  const actions = useMemo<AppActions>(
    () => ({
      setLanguage: (language) => dispatch({ type: 'setLanguage', language }),

      joinGroup: (code, name) => {
        const s = stateRef.current;
        const group = s.groups.find(
          (g) => g.inviteCode.toUpperCase() === code.trim().toUpperCase(),
        );
        if (!group || !name.trim()) return false;
        const user: UserProfile = {
          id: `u-${Date.now()}`,
          name: name.trim(),
        };
        dispatch({ type: 'joinGroup', user, groupId: group.id });
        return true;
      },

      createGroup: (groupName, leaderName) => {
        const user: UserProfile = { id: `u-${Date.now()}`, name: leaderName.trim() };
        const code = `IRON-${String(1000 + Math.floor(Math.random() * 9000))}`;
        const group: Group = {
          id: `g-${Date.now()}`,
          name: groupName.trim(),
          description: '',
          inviteCode: code,
          createdBy: user.id,
        };
        // New groups start with a draft week (Proverbs 20–24) the leader can
        // adjust in Manage before publishing.
        const monday = mondayOf(today());
        const schedule: WeeklySchedule = {
          id: `s-${Date.now()}`,
          groupId: group.id,
          weekStart: isoDate(monday),
          days: ([0, 1, 2, 3, 4] as Weekday[]).map((w) => ({
            weekday: w,
            date: isoDate(addDays(monday, w)),
            passage: { book: 'Proverbs', chapter: 20 + w },
          })),
          prayerPoint: '',
          published: false,
        };
        dispatch({ type: 'createGroup', user, group, schedule });
        return group.id;
      },

      setNotificationTime: (time) => dispatch({ type: 'setNotificationTime', time }),
      toggleDraftVerse: (n) => dispatch({ type: 'toggleDraftVerse', n }),
      clearDraftVerses: () => dispatch({ type: 'clearDraftVerses' }),

      amenToday: () => {
        const day = sel.todayDay(stateRef.current);
        if (day) dispatch({ type: 'amenToday', date: day.date });
      },

      postReflection: ({ body, visibility, editId }) => {
        const day = sel.todayDay(stateRef.current);
        if (!day) return;
        dispatch({
          type: 'postReflection',
          date: day.date,
          passage: day.passage,
          body,
          visibility,
          editId,
        });
      },

      setPrayerPoint: (text) => dispatch({ type: 'setPrayerPoint', text }),
      setAnnouncement: (text) => dispatch({ type: 'setAnnouncement', text }),
      setDayPassage: (weekday, passage) =>
        dispatch({ type: 'setDayPassage', weekday, passage }),
      publishWeek: () => dispatch({ type: 'publishWeek' }),
      switchGroup: (groupId) => dispatch({ type: 'switchGroup', groupId }),
    }),
    [],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      actions,
      t: (key, params) => translate(state.language, key, params),
    }),
    [state, actions],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
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

  myRole(s: AppState): 'leader' | 'member' | undefined {
    return s.memberships.find(
      (m) => m.userId === s.currentUserId && m.groupId === s.activeGroupId,
    )?.role;
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

  todayDay(s: AppState): ScheduleDay | undefined {
    return sel.activeSchedule(s)?.days[todayReadingIndex()];
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
        (r) => r.groupId === s.activeGroupId && r.date === date && r.visibility === 'shared',
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
    return s.reflections.find((r) => r.id === id);
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
