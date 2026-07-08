import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { AppState as RNAppState } from 'react-native';
import { nextChapterPassage } from './bible';
import { addDays, fromIso, isoDate, mondayOf, today, todayReadingIndex } from './dates';
import { loadServerAppData } from './db/load';
import { translate } from './i18n';
import { isSupabaseEnabled, supabase } from './supabase';
import { createSupabaseActions } from './supabase-actions';
import {
  buildDemoCreateGroupContext,
  buildDemoJoinGroupContext,
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

export const APP_STATE_VERSION = 1;
const APP_STATE_STORAGE_KEY = 'iron.appState.v1';

/**
 * In Supabase mode the server owns the data; only these device-level
 * preferences persist locally. Kept under a separate key so demo-mode
 * persisted state and Supabase mode never mix.
 */
const DEVICE_PREFS_STORAGE_KEY = 'iron.devicePrefs.v1';

interface DevicePrefs {
  language: Language;
  activeGroupId: string | null;
}

async function loadDevicePrefs(): Promise<DevicePrefs> {
  try {
    const raw = await AsyncStorage.getItem(DEVICE_PREFS_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed) && (parsed.language === 'en' || parsed.language === 'ko')) {
        return {
          language: parsed.language,
          activeGroupId:
            typeof parsed.activeGroupId === 'string' ? parsed.activeGroupId : null,
        };
      }
    }
  } catch {
    // fall through to defaults
  }
  return { language: 'en', activeGroupId: null };
}

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

function transientInitialState(): TransientAppState {
  return { draftVerses: [] };
}

export function createHydratedAppState(persisted: PersistedAppState): AppState {
  return {
    ...persisted,
    ...transientInitialState(),
  };
}

function persistedSnapshot(state: PersistedAppState): PersistedAppState {
  return PERSISTED_STATE_KEYS.reduce(
    (snapshot, key) => ({ ...snapshot, [key]: state[key] }),
    {} as PersistedAppState,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPersistedAppState(value: unknown): value is PersistedAppState {
  if (!isRecord(value)) return false;
  if (value.version !== APP_STATE_VERSION) return false;
  if (value.language !== 'en' && value.language !== 'ko') return false;
  if (value.currentUserId !== null && typeof value.currentUserId !== 'string') return false;
  if (value.activeGroupId !== null && typeof value.activeGroupId !== 'string') return false;
  return (
    Array.isArray(value.users) &&
    Array.isArray(value.groups) &&
    Array.isArray(value.memberships) &&
    Array.isArray(value.schedules) &&
    Array.isArray(value.responses) &&
    Array.isArray(value.reflections) &&
    Array.isArray(value.notificationPrefs)
  );
}

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const satisfies readonly Weekday[];

/**
 * Older persisted schedules stored only Mon–Fri and predate the per-day
 * enabled/published flags; fill the gaps so the app can assume seven
 * flagged days. Missing weekend days arrive disabled (rest days).
 */
function normalizeSchedule(schedule: WeeklySchedule): WeeklySchedule {
  const monday = fromIso(schedule.weekStart);
  let prev: BiblePassage = { book: 'Proverbs', chapter: 19 };
  const days = ALL_WEEKDAYS.map((weekday): ScheduleDay => {
    const existing = schedule.days.find((d) => d.weekday === weekday);
    if (existing) {
      prev = existing.passage;
      return {
        ...existing,
        enabled: existing.enabled ?? true,
        published: existing.published ?? true,
      };
    }
    prev = nextChapterPassage(prev);
    return {
      weekday,
      date: isoDate(addDays(monday, weekday)),
      passage: prev,
      enabled: false,
      published: true,
    };
  });
  return { ...schedule, days };
}

function normalizePersistedAppState(state: PersistedAppState): PersistedAppState {
  return { ...state, schedules: state.schedules.map(normalizeSchedule) };
}

async function loadInitialAppState(): Promise<AppState> {
  try {
    const raw = await AsyncStorage.getItem(APP_STATE_STORAGE_KEY);
    if (!raw) return createDemoAppState();
    const parsed: unknown = JSON.parse(raw);
    return isPersistedAppState(parsed)
      ? createHydratedAppState(normalizePersistedAppState(persistedSnapshot(parsed)))
      : createDemoAppState();
  } catch {
    return createDemoAppState();
  }
}

async function savePersistedAppState(state: AppState): Promise<void> {
  await AsyncStorage.setItem(
    APP_STATE_STORAGE_KEY,
    JSON.stringify(persistedSnapshot(state)),
  );
}

export function createDemoAppState(): AppState {
  const { responses, reflections } = buildSeedActivity();
  return {
    version: APP_STATE_VERSION,
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
    ...transientInitialState(),
  };
}

/** Supabase mode never touches demo seeds: signed-out state is simply empty. */
export function createEmptyAppState(language: Language): AppState {
  return {
    version: APP_STATE_VERSION,
    language,
    currentUserId: null,
    activeGroupId: null,
    users: [],
    groups: [],
    memberships: [],
    schedules: [],
    responses: [],
    reflections: [],
    notificationPrefs: [],
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

function addUserOnce(users: UserProfile[], user: UserProfile): UserProfile[] {
  return users.some((u) => u.id === user.id) ? users : [...users, user];
}

function addMembershipsOnce(
  current: Membership[],
  added: Membership[],
): Membership[] {
  const fresh = added.filter(
    (m) => !current.some((mm) => mm.userId === m.userId && mm.groupId === m.groupId),
  );
  return fresh.length ? [...current, ...fresh] : current;
}

function getActiveMembership(s: AppState): Membership | undefined {
  return s.memberships.find(
    (m) => m.userId === s.currentUserId && m.groupId === s.activeGroupId,
  );
}

function hasGroupMembership(s: AppState, groupId: string): boolean {
  return s.memberships.some(
    (m) => m.userId === s.currentUserId && m.groupId === groupId,
  );
}

function hasActiveGroupLeaderRole(s: AppState): boolean {
  return getActiveMembership(s)?.role === 'leader';
}

function userCanViewReflection(s: AppState, r: Reflection): boolean {
  if (!s.currentUserId) return false;
  if (r.userId === s.currentUserId) return true;
  return r.visibility === 'shared' && hasGroupMembership(s, r.groupId);
}

function userCanEditReflection(s: AppState, r: Reflection): boolean {
  return !!s.currentUserId && r.userId === s.currentUserId;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setLanguage':
      return { ...state, language: action.language };

    case 'joinGroup':
      return {
        ...state,
        users: addUserOnce(state.users, action.user),
        memberships: addMembershipsOnce(state.memberships, action.memberships),
        responses: [...state.responses, ...action.responses],
        reflections: [...state.reflections, ...action.reflections],
        currentUserId: action.user.id,
        activeGroupId: action.activeGroupId,
      };

    case 'createGroup':
      return {
        ...state,
        users: addUserOnce(state.users, action.user),
        groups: [...state.groups, action.group],
        memberships: addMembershipsOnce(state.memberships, action.memberships),
        schedules: [...state.schedules, action.schedule],
        currentUserId: action.user.id,
        activeGroupId: action.activeGroupId,
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
      if (!hasGroupMembership(state, state.activeGroupId)) return state;
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
      if (!hasGroupMembership(state, state.activeGroupId)) return state;
      if (action.editId) {
        const existing = state.reflections.find((r) => r.id === action.editId);
        if (!existing || !userCanEditReflection(state, existing)) return state;
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
    case 'setDayPassage':
    case 'setDayEnabled':
    case 'setDayPublished':
    case 'autoFillWeek': {
      if (!state.activeGroupId) return state;
      if (!hasActiveGroupLeaderRole(state)) return state;
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
            case 'setDayEnabled':
              return {
                ...s,
                days: s.days.map((d) =>
                  d.weekday === action.weekday ? { ...d, enabled: action.enabled } : d,
                ),
              };
            case 'setDayPublished':
              return {
                ...s,
                days: s.days.map((d) =>
                  d.weekday === action.weekday ? { ...d, published: action.published } : d,
                ),
              };
            case 'autoFillWeek': {
              const filled = computeAutoFillPassages(s.days);
              if (filled.size === 0) return s;
              return {
                ...s,
                days: s.days.map((d) => {
                  const p = filled.get(d.weekday);
                  return p ? { ...d, passage: p } : d;
                }),
              };
            }
          }
        }),
      };
    }

    case 'startWeek': {
      if (!state.activeGroupId) return state;
      if (!hasActiveGroupLeaderRole(state)) return state;
      if (action.schedule.groupId !== state.activeGroupId) return state;
      const exists = state.schedules.some(
        (s) =>
          s.groupId === action.schedule.groupId &&
          s.weekStart === action.schedule.weekStart,
      );
      if (exists) return state;
      return { ...state, schedules: [...state.schedules, action.schedule] };
    }

    case 'switchGroup':
      if (!hasGroupMembership(state, action.groupId)) return state;
      return { ...state, activeGroupId: action.groupId };

    case 'hydrateState':
      return action.state;

    case 'resetDemoData':
      return createDemoAppState();

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------

/**
 * Draft week (Proverbs placeholder, Mon–Fri on, weekend resting). Iron is
 * leader-driven: the draft stays unpublished and invisible to members until
 * the leader picks chapters, writes a prayer point, and publishes in Manage.
 */
function draftWeekSchedule(groupId: string): WeeklySchedule {
  const monday = mondayOf(today());
  return {
    id: `s-${Date.now()}`,
    groupId,
    weekStart: isoDate(monday),
    days: ALL_WEEKDAYS.map((w) => ({
      weekday: w,
      date: isoDate(addDays(monday, w)),
      passage: { book: 'Proverbs', chapter: 20 + w },
      enabled: w <= 4,
      published: true,
    })),
    prayerPoint: '',
    published: false,
  };
}

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

interface AppContextValue {
  state: AppState;
  actions: AppActions;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createDemoAppState);
  const [hydrated, setHydrated] = React.useState(false);
  const stateRef = React.useRef(state);
  const supabaseMode = isSupabaseEnabled();
  /** Which user's server data is currently loaded (avoids duplicate loads). */
  const loadedUidRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    stateRef.current = state;
  });

  /**
   * Pull the current user's world from Supabase and swap it into app state.
   * The previous activeGroupId is kept when still valid, otherwise the first
   * group (or none) is selected.
   */
  const reloadFromServer = React.useCallback(
    async (uid: string, overrideActiveGroupId?: string) => {
      const data = await loadServerAppData(uid);
      const current = stateRef.current;
      const myGroupIds = new Set(
        data.memberships.filter((m) => m.userId === uid).map((m) => m.groupId),
      );
      const preferred = overrideActiveGroupId ?? current.activeGroupId;
      const activeGroupId =
        preferred && myGroupIds.has(preferred)
          ? preferred
          : (data.memberships.find((m) => m.userId === uid)?.groupId ?? null);
      loadedUidRef.current = uid;
      dispatch({
        type: 'hydrateState',
        state: {
          version: APP_STATE_VERSION,
          language: current.language,
          currentUserId: uid,
          activeGroupId,
          ...data,
          ...transientInitialState(),
        },
      });
    },
    [],
  );

  // Hydration — demo mode restores the persisted local world; Supabase mode
  // restores device prefs, then follows the auth session. The two paths use
  // different storage keys and never mix.
  React.useEffect(() => {
    let cancelled = false;

    if (!supabaseMode || !supabase) {
      async function hydrateDemo() {
        const initialState = await loadInitialAppState();
        if (cancelled) return;
        dispatch({ type: 'hydrateState', state: initialState });
        setHydrated(true);
      }
      void hydrateDemo();
      return () => {
        cancelled = true;
      };
    }

    const client = supabase;

    async function hydrateFromSession(
      uid: string | null,
      language: Language,
      preferredGroupId?: string,
    ) {
      if (uid) {
        try {
          await reloadFromServer(uid, preferredGroupId);
        } catch (e) {
          // Offline / first-load failure: keep the session, start empty
          // rather than crashing; data arrives on the next successful load.
          console.warn('[iron] initial server load failed:', e);
          loadedUidRef.current = uid;
          dispatch({
            type: 'hydrateState',
            state: { ...createEmptyAppState(language), currentUserId: uid },
          });
        }
      } else {
        loadedUidRef.current = null;
        dispatch({ type: 'hydrateState', state: createEmptyAppState(language) });
      }
      if (!cancelled) setHydrated(true);
    }

    async function hydrateSupabase() {
      const prefs = await loadDevicePrefs();
      if (cancelled) return;
      dispatch({ type: 'setLanguage', language: prefs.language });
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      // The stored active group is passed explicitly — reload validates it
      // against the fresh memberships and falls back to the first group.
      await hydrateFromSession(
        data.session?.user.id ?? null,
        prefs.language,
        prefs.activeGroupId ?? undefined,
      );
    }

    void hydrateSupabase();

    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      const uid = session?.user.id ?? null;
      if (event === 'SIGNED_OUT' || !uid) {
        if (loadedUidRef.current !== null) {
          loadedUidRef.current = null;
          dispatch({
            type: 'hydrateState',
            state: createEmptyAppState(stateRef.current.language),
          });
        }
        return;
      }
      // SIGNED_IN also fires on app foreground/token refresh; only load when
      // the user actually changed.
      if (loadedUidRef.current !== uid) {
        void hydrateFromSession(uid, stateRef.current.language);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Supabase session tokens refresh only while the app is foregrounded.
  React.useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
    void client.auth.startAutoRefresh();
    return () => {
      sub.remove();
      void client.auth.stopAutoRefresh();
    };
  }, []);

  // Persistence — demo mode snapshots the whole world; Supabase mode saves
  // device prefs only (the server owns the data).
  React.useEffect(() => {
    if (!hydrated) return;
    if (supabaseMode) {
      const prefs: DevicePrefs = {
        language: state.language,
        activeGroupId: state.activeGroupId,
      };
      void AsyncStorage.setItem(DEVICE_PREFS_STORAGE_KEY, JSON.stringify(prefs)).catch(
        () => {},
      );
    } else {
      void savePersistedAppState(state).catch(() => {});
    }
  }, [hydrated, state, supabaseMode]);

  const demoActions = useMemo<AppActions>(
    () => ({
      setLanguage: (language) => dispatch({ type: 'setLanguage', language }),

      joinGroup: async (code, name) => {
        const s = stateRef.current;
        const group = s.groups.find(
          (g) => g.inviteCode.toUpperCase() === code.trim().toUpperCase(),
        );
        const existing = sel.me(s);
        if (!group || (!existing && !name.trim())) return false;
        // Already a member (e.g. joining the same code twice): just switch.
        if (
          existing &&
          s.memberships.some((m) => m.userId === existing.id && m.groupId === group.id)
        ) {
          dispatch({ type: 'switchGroup', groupId: group.id });
          return true;
        }
        const user: UserProfile = existing ?? {
          id: `u-${Date.now()}`,
          name: name.trim(),
        };
        // Demo joiner history/bonus groups only make sense for a fresh profile.
        const context = existing
          ? {
              memberships: [
                {
                  userId: user.id,
                  groupId: group.id,
                  role: 'member' as const,
                  joinedAt: isoDate(today()),
                },
              ],
              responses: [],
              reflections: [],
            }
          : buildDemoJoinGroupContext(user.id, group.id, s.groups.map((g) => g.id));
        dispatch({
          type: 'joinGroup',
          user,
          activeGroupId: group.id,
          memberships: context.memberships,
          responses: context.responses,
          reflections: context.reflections,
        });
        return true;
      },

      createGroup: async (groupName, leaderName) => {
        const s = stateRef.current;
        const existing = sel.me(s);
        const user: UserProfile = existing ?? {
          id: `u-${Date.now()}`,
          name: leaderName.trim(),
        };
        const code = `IRON-${String(1000 + Math.floor(Math.random() * 9000))}`;
        const group: Group = {
          id: `g-${Date.now()}`,
          name: groupName.trim(),
          description: '',
          inviteCode: code,
          createdBy: user.id,
        };
        const schedule = draftWeekSchedule(group.id);
        // Demo leader-as-member membership only makes sense for a fresh profile.
        const memberships = existing
          ? [
              {
                userId: user.id,
                groupId: group.id,
                role: 'leader' as const,
                joinedAt: isoDate(today()),
              },
            ]
          : buildDemoCreateGroupContext(user.id, group.id, s.groups.map((g) => g.id))
              .memberships;
        dispatch({
          type: 'createGroup',
          user,
          group,
          schedule,
          activeGroupId: group.id,
          memberships,
        });
        return group.id;
      },

      setNotificationTime: (time) => dispatch({ type: 'setNotificationTime', time }),
      toggleDraftVerse: (n) => dispatch({ type: 'toggleDraftVerse', n }),
      clearDraftVerses: () => dispatch({ type: 'clearDraftVerses' }),

      amenToday: () => {
        const day = sel.todayVisibleDay(stateRef.current);
        if (day) dispatch({ type: 'amenToday', date: day.date });
      },

      postReflection: ({ body, visibility, editId }) => {
        const s = stateRef.current;
        // Edits keep the original reflection's date/passage, so they must not
        // depend on today having a scheduled reading.
        if (editId) {
          const existing = s.reflections.find((r) => r.id === editId);
          if (!existing) return;
          dispatch({
            type: 'postReflection',
            date: existing.date,
            passage: existing.passage,
            body,
            visibility,
            editId,
          });
          return;
        }
        const day = sel.todayVisibleDay(s);
        if (!day) return;
        dispatch({
          type: 'postReflection',
          date: day.date,
          passage: day.passage,
          body,
          visibility,
        });
      },

      setPrayerPoint: (text) => dispatch({ type: 'setPrayerPoint', text }),
      setAnnouncement: (text) => dispatch({ type: 'setAnnouncement', text }),
      setDayPassage: (weekday, passage) =>
        dispatch({ type: 'setDayPassage', weekday, passage }),
      setDayEnabled: (weekday, enabled) =>
        dispatch({ type: 'setDayEnabled', weekday, enabled }),
      setDayPublished: (weekday, published) =>
        dispatch({ type: 'setDayPublished', weekday, published }),
      autoFillWeek: () => dispatch({ type: 'autoFillWeek' }),
      publishWeek: () => dispatch({ type: 'publishWeek' }),

      startWeek: () => {
        const s = stateRef.current;
        if (!s.activeGroupId) return;
        dispatch({ type: 'startWeek', schedule: draftWeekSchedule(s.activeGroupId) });
      },

      switchGroup: (groupId) => dispatch({ type: 'switchGroup', groupId }),
      resetDemoData: () => dispatch({ type: 'resetDemoData' }),
    }),
    [],
  );

  const supabaseActions = useMemo<AppActions | null>(
    () =>
      supabaseMode
        ? createSupabaseActions({ dispatch, stateRef, reloadFromServer })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reloadFromServer],
  );

  const actions = supabaseActions ?? demoActions;

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      actions,
      t: (key, params) => translate(state.language, key, params),
    }),
    [state, actions],
  );

  if (!hydrated) return null;

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
