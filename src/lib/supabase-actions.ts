import type { Dispatch, MutableRefObject } from 'react';
import { isoDate, mondayOf, today } from './dates';
import { createGroupWithLeader, joinGroupByInviteCode } from './db/groups';
import { saveNotificationPref } from './db/notifications';
import { insertReflection, updateReflection } from './db/reflections';
import { insertAmen } from './db/responses';
import * as schedulesDb from './db/schedules';
import { getMyProfile, getOrCreateProfile } from './db/profiles';
import {
  computeAutoFillPassages,
  sel,
  type Action,
  type AppActions,
  type AppState,
} from './store';

/**
 * AppActions against Supabase. Strategy: reuse the existing reducer as an
 * optimistic mirror (it already encodes the exact product rules), send the
 * matching server write, and rely on RLS as the real boundary. Structural
 * changes (join/create/start week) are server-first with a full reload so
 * client state always carries server ids. Failures are logged, not thrown —
 * the next reload converges the mirror.
 */

function sync(label: string, work: Promise<unknown>): void {
  work.catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[iron] ${label} failed: ${message}`);
  });
}

/** Debounced per-field server writes for type-as-you-go leader edits. */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
function debounced(key: string, run: () => void, ms = 800): void {
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      run();
    }, ms),
  );
}

export function createSupabaseActions(ctx: {
  dispatch: Dispatch<Action>;
  stateRef: MutableRefObject<AppState>;
  reloadFromServer: (uid: string, overrideActiveGroupId?: string) => Promise<void>;
}): AppActions {
  const { dispatch, stateRef, reloadFromServer } = ctx;

  const uid = () => stateRef.current.currentUserId;

  /**
   * Join/Create screens double as profile creation on first use: the name
   * typed there becomes the profile. An existing profile keeps its name.
   */
  async function ensureProfile(name: string): Promise<boolean> {
    const existing = await getMyProfile();
    if (existing) return true;
    if (!name.trim()) return false;
    await getOrCreateProfile(name);
    return true;
  }

  return {
    setLanguage: (language) => dispatch({ type: 'setLanguage', language }),

    joinGroup: async (code, name) => {
      const userId = uid();
      if (!userId || !code.trim()) return false;
      try {
        if (!(await ensureProfile(name))) return false;
        const result = await joinGroupByInviteCode(code);
        if (!result) return false;
        await reloadFromServer(userId, result.groupId);
        return true;
      } catch (e) {
        console.warn('[iron] joinGroup failed:', e);
        return false;
      }
    },

    createGroup: async (groupName, leaderName) => {
      const userId = uid();
      if (!userId || !groupName.trim()) return null;
      try {
        if (!(await ensureProfile(leaderName))) return null;
        const { groupId } = await createGroupWithLeader({
          name: groupName,
          weekStart: isoDate(mondayOf(today())),
        });
        await reloadFromServer(userId, groupId);
        return groupId;
      } catch (e) {
        console.warn('[iron] createGroup failed:', e);
        return null;
      }
    },

    setNotificationTime: (time) => {
      const userId = uid();
      if (!userId) return;
      dispatch({ type: 'setNotificationTime', time });
      sync('save notification time', saveNotificationPref({ userId, time }));
    },

    toggleDraftVerse: (n) => dispatch({ type: 'toggleDraftVerse', n }),
    clearDraftVerses: () => dispatch({ type: 'clearDraftVerses' }),

    amenToday: () => {
      const s = stateRef.current;
      const userId = uid();
      const day = sel.todayVisibleDay(s);
      if (!userId || !s.activeGroupId || !day?.id) return;
      const alreadyAmened = s.responses.some(
        (r) =>
          r.userId === userId &&
          r.groupId === s.activeGroupId &&
          r.date === day.date &&
          r.kind === 'amen',
      );
      dispatch({ type: 'amenToday', date: day.date });
      if (alreadyAmened) return; // reducer dedupes; skip the duplicate write
      sync(
        'save Amen',
        insertAmen({
          groupId: s.activeGroupId,
          userId,
          scheduleDayId: day.id,
          date: day.date,
        }),
      );
    },

    postReflection: ({ body, visibility, editId }) => {
      const s = stateRef.current;
      const userId = uid();
      if (!userId || !s.activeGroupId) return;

      if (editId) {
        const existing = s.reflections.find((r) => r.id === editId);
        if (!existing || existing.userId !== userId) return;
        dispatch({
          type: 'postReflection',
          date: existing.date,
          passage: existing.passage,
          body,
          visibility,
          editId,
        });
        sync('save reflection edit', updateReflection(editId, { body, visibility }));
        return;
      }

      const day = sel.todayVisibleDay(s);
      if (!day?.id) return;
      // Capture before dispatch: the reducer clears draft verses on post.
      const highlightedVerses = [...s.draftVerses];
      dispatch({
        type: 'postReflection',
        date: day.date,
        passage: day.passage,
        body,
        visibility,
      });
      sync(
        'save reflection',
        insertReflection({
          groupId: s.activeGroupId,
          userId,
          scheduleDayId: day.id,
          date: day.date,
          passage: day.passage,
          highlightedVerses,
          body,
          visibility,
          // Reload swaps the optimistic temp id for the server row id.
        }).then(() => reloadFromServer(userId)),
      );
    },

    setPrayerPoint: (text) => {
      const scheduleId = sel.activeSchedule(stateRef.current)?.id;
      dispatch({ type: 'setPrayerPoint', text });
      if (!scheduleId) return;
      debounced(`prayer:${scheduleId}`, () =>
        sync('save prayer point', schedulesDb.setPrayerPoint(scheduleId, text)),
      );
    },

    setAnnouncement: (text) => {
      const scheduleId = sel.activeSchedule(stateRef.current)?.id;
      dispatch({ type: 'setAnnouncement', text });
      if (!scheduleId) return;
      debounced(`announcement:${scheduleId}`, () =>
        sync('save announcement', schedulesDb.setAnnouncement(scheduleId, text)),
      );
    },

    setDayPassage: (weekday, passage) => {
      const day = sel
        .activeSchedule(stateRef.current)
        ?.days.find((d) => d.weekday === weekday);
      dispatch({ type: 'setDayPassage', weekday, passage });
      if (!day?.id) return;
      sync('save day passage', schedulesDb.setDayPassage(day.id, passage));
    },

    setDayEnabled: (weekday, enabled) => {
      const day = sel
        .activeSchedule(stateRef.current)
        ?.days.find((d) => d.weekday === weekday);
      dispatch({ type: 'setDayEnabled', weekday, enabled });
      if (!day?.id) return;
      sync('save day enabled', schedulesDb.setDayEnabled(day.id, enabled));
    },

    setDayPublished: (weekday, published) => {
      const day = sel
        .activeSchedule(stateRef.current)
        ?.days.find((d) => d.weekday === weekday);
      dispatch({ type: 'setDayPublished', weekday, published });
      if (!day?.id) return;
      sync('save day published', schedulesDb.setDayPublished(day.id, published));
    },

    autoFillWeek: () => {
      const schedule = sel.activeSchedule(stateRef.current);
      if (!schedule) return;
      // Same fill the reducer computes, mirrored day-by-day to the server.
      const filled = computeAutoFillPassages(schedule.days);
      dispatch({ type: 'autoFillWeek' });
      for (const [weekday, passage] of filled) {
        const day = schedule.days.find((d) => d.weekday === weekday);
        if (day?.id) sync('auto-fill day', schedulesDb.setDayPassage(day.id, passage));
      }
    },

    publishWeek: () => {
      const scheduleId = sel.activeSchedule(stateRef.current)?.id;
      dispatch({ type: 'publishWeek' });
      if (!scheduleId) return;
      sync('publish week', schedulesDb.publishWeek(scheduleId));
    },

    startWeek: () => {
      const s = stateRef.current;
      const userId = uid();
      if (!userId || !s.activeGroupId || !sel.isActiveGroupLeader(s)) return;
      const groupId = s.activeGroupId;
      // Server-first: the RPC creates the week plus its 7 day rows; the
      // reload brings them back with real ids for subsequent edits.
      sync(
        'start week',
        schedulesDb
          .startWeek(groupId, isoDate(mondayOf(today())))
          .then(() => reloadFromServer(userId)),
      );
    },

    switchGroup: (groupId) => dispatch({ type: 'switchGroup', groupId }),

    resetDemoData: () => {
      // Demo-only escape hatch; in Supabase mode the server owns the data.
      console.warn('[iron] resetDemoData is a demo-mode action; ignored.');
    },
  };
}
