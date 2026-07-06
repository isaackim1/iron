# Iron

A dedicated Bible-reading and prayer space for Christian small groups — so the
Word, prayer points, and reflections don't get lost in chat noise.

**“The Word doesn’t get lost in chat noise.”**

Design source of truth: the Figma prototype
(“Iron” → page *MVP Prototype — Full Flow*).

## Stack

- Expo (SDK 54) + React Native + TypeScript
- expo-router (file-based navigation, role-aware tabs)
- Local mock state (React context + reducer) — no backend yet
- English / Korean (한국어) language mode

## Run it

```bash
npm install
npm run ios        # or: npm run android / npm run web
```

Useful checks:

```bash
npm run typecheck
npm run lint
```

## Try the MVP flows

- **Member**: Welcome → *Join a group* → code `IRON-4217` + your name →
  notification time → Home → Read → highlight verses → Amen or Reflection →
  Feed / My Reflections.
- **Leader**: Welcome → *create a new group* → invite code (copy) →
  notification time → Leader Home → Manage → tap a weekday → Bible picker →
  write prayer point → Publish week.
- **Korean mode**: toggle 한국어 on the Welcome screen (also in group settings).

## Structure

```
src/
  app/            expo-router routes (onboarding, (tabs), reading, picker…)
  components/     shared UI primitives (Txt, Card, Pill, Avatar…)
  lib/
    theme.ts      design tokens from the Figma prototype
    types.ts      domain types (Group, WeeklySchedule, Reflection…)
    store.tsx     app state + actions + selectors (mock-local)
    mock.ts       seed world (Honest People group, week, activity)
    bible.ts      66 books + mock passage text (EN public-domain / KO rendering)
    i18n.ts       EN/KO strings
    dates.ts      week + formatting helpers
```

## Not wired yet (intentionally)

Supabase auth/data, Kakao/Apple/Google login, API.Bible passages,
push notifications, server-side scheduling.
