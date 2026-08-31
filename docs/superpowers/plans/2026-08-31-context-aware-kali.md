# Context-Aware Kali Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local-first role-aware Kali guidance for booking safety, weather, group size, age changes, and booking reminders.

**Architecture:** A pure `buildKaliContext` rule engine consumes normalized facts. A small `KaliAvatar` sprite crop and `KaliContextPanel` render the highest-priority insight responsively from the existing app shell, while existing Supabase auth/bookings and free-form chat remain unchanged.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, Tailwind CSS, lucide-react, existing date-fns and Supabase client.

**Spec:** `docs/superpowers/specs/2026-08-31-context-aware-kali-design.md`

## Global Constraints

- Do not remove Supabase auth, booking persistence, RLS, or existing route behavior.
- Do not require `SUPABASE_ACCESS_TOKEN` or a remote AI call for proactive context prompts.
- Keep weather stale/unavailable states explicit and timestamped.
- Keep panel controls reachable on desktop and mobile, respecting safe-area insets.
- Use the supplied sprite sheet as cropped semantic expressions, never as one full-image illustration.

---

### Task 1: Context Rule Engine

**Files:**
- Create: `src/lib/kaliContext.ts`
- Test: `src/test/kaliContext.test.ts`

**Interfaces:**
- Produces `KaliRole`, `KaliInsightKind`, `KaliContextInput`, `KaliInsight`, `buildKaliContext`, and `getKaliRoleLabel`.

- [ ] **Step 1: Write failing behavior tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildKaliContext } from '@/lib/kaliContext';

describe('buildKaliContext', () => {
  it('flags an age change that crosses the minor boundary as review', () => {
    const [insight] = buildKaliContext({ role: 'hiker', savedAge: 14, currentAge: 25, now: '2026-08-31T09:00:00+08:00' });
    expect(insight.kind).toBe('age-review');
    expect(insight.severity).toBe('high');
    expect(insight.message).toContain('admin');
  });

  it('explains two-guide coverage for groups above five', () => {
    const [insight] = buildKaliContext({ role: 'hiker', groupSize: 6 });
    expect(insight.kind).toBe('group-guidance');
    expect(insight.message).toContain('front and back');
  });

  it('escalates severe weather to avoid and keeps a stale forecast visible', () => {
    const [insight] = buildKaliContext({ role: 'hiker', weather: { condition: 'Thunderstorm', rainProbability: 90, windKmh: 55, fetchedAt: Date.now() - 3_600_000 * 30 } });
    expect(insight.kind).toBe('weather');
    expect(insight.severity).toBe('high');
    expect(insight.message).toContain('resched');
    expect(insight.meta?.forecastStatus).toBe('stale');
  });

  it('uses role-aware copy for MDRRMO', () => {
    const [insight] = buildKaliContext({ role: 'mdrrmo', groupSize: 6 });
    expect(insight.message).toContain('response');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- src/test/kaliContext.test.ts`
Expected: FAIL because `src/lib/kaliContext.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure rule engine**

Implement deterministic ordering: age review, weather, group guidance, booking reminder. Return role-aware text, severity, expression, and metadata without calling browser APIs.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- src/test/kaliContext.test.ts`
Expected: PASS with four behavioral assertions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kaliContext.ts src/test/kaliContext.test.ts
git commit -m "feat: add context-aware Kali safety rules"
```

### Task 2: Sprite Avatar and Context Panel

**Files:**
- Create: `src/assets/kali-ai.png`
- Create: `src/components/kali/KaliAvatar.tsx`
- Create: `src/components/kali/KaliContextPanel.tsx`
- Modify: `src/index.css`
- Test: `src/test/kaliContextPanel.test.tsx`

**Interfaces:**
- `KaliAvatar({ expression, size, className })` renders a clipped sprite crop.
- `KaliContextPanel({ insights, role })` renders the highest-priority insight with desktop collapse and mobile trigger state.

- [ ] **Step 1: Write failing component tests**

```tsx
it('opens the mobile Kali panel and shows the role-aware insight', async () => {
  render(<KaliContextPanel role="hiker" insights={[{ id: 'group', kind: 'group-guidance', severity: 'medium', expression: 'map', title: 'Group plan', message: 'Two guides cover the front and back.', meta: {} }]} />);
  await userEvent.click(screen.getByRole('button', { name: /open kali guidance/i }));
  expect(screen.getByText('Two guides cover the front and back.')).toBeVisible();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- src/test/kaliContextPanel.test.tsx`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Add the image and implement responsive UI**

Copy the supplied `kali ai.png` to `src/assets/kali-ai.png`. Use a fixed-size clipped `div` with `background-size` and semantic positions. Render one insight, a compact timestamp/status line, a close button, and a mobile bottom sheet. Use `env(safe-area-inset-bottom)` and keep z-index below modal dialogs but above page content.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- src/test/kaliContextPanel.test.tsx`
Expected: PASS and no accessibility query failures.

- [ ] **Step 5: Commit**

```bash
git add src/assets/kali-ai.png src/components/kali src/index.css src/test/kaliContextPanel.test.tsx
git commit -m "feat: add responsive Kali context panel"
```

### Task 3: App-Shell Integration and Booking Facts

**Files:**
- Create: `src/hooks/useKaliContext.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/booking/BookingAIChat.tsx`
- Modify: `src/pages/BookingPage.tsx`
- Modify: `src/lib/weather.ts`
- Test: `src/test/useKaliContext.test.tsx`

**Interfaces:**
- `useKaliContext(input)` returns `{ insights, forecastStatus }` and only refreshes from online weather when explicitly given a forecast loader.
- Booking passes selected date, group size, committed/current ages, and `weatherInsight` into the hook.

- [ ] **Step 1: Write failing integration tests**

Assert that changing group size above five produces the panel insight, selecting a date with rain produces a warning, and the booking page renders the existing required form content alongside the new panel.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/test/useKaliContext.test.tsx`
Expected: FAIL because the hook and panel integration are absent.

- [ ] **Step 3: Implement the hook and wire existing facts**

Keep existing booking submit payloads unchanged. Add the panel to the existing shell only for authenticated roles or the booking flow, pass role from `useAuth`, and leave the existing chat launcher behavior intact. Add a local `forecastCache` in `weather.ts` only for successful snapshots.

- [ ] **Step 4: Run focused tests and verify pass**

Run: `npm test -- src/test/useKaliContext.test.tsx src/test/kaliContext.test.ts src/test/kaliContextPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useKaliContext.ts src/App.tsx src/components/booking/BookingAIChat.tsx src/pages/BookingPage.tsx src/lib/weather.ts src/test/useKaliContext.test.tsx
git commit -m "feat: wire Kali guidance into booking and app shell"
```

### Task 4: Verification and Release Gate

**Files:**
- Modify: `tests/e2e/responsive.spec.ts`
- Modify: `tests/e2e/authenticated-roles.spec.ts`
- Modify: `docs/RELEASE_CHECKLIST.md`

- [ ] **Step 1: Add browser coverage**

At mobile and desktop widths, open booking, set a group above five, open the Kali panel, and assert the insight is visible without preventing the Continue button from being reachable. Assert role pages do not show the wrong role label.

- [ ] **Step 2: Run the focused browser tests**

Run: `npm run build; npm run preview -- --host 127.0.0.1 --port 4173` in one terminal, then `npx playwright test tests/e2e/responsive.spec.ts tests/e2e/authenticated-roles.spec.ts`.
Expected: PASS against the built app; missing environment variables are reported explicitly rather than hidden.

- [ ] **Step 3: Run the full verification suite**

Run: `npm run lint; npm run typecheck; npm run test:unit; npm run build; npm run test:e2e`.
Expected: each command exits 0; otherwise fix the implementation root cause.

- [ ] **Step 4: Document actual limitations**

Record that Supabase-backed flows require configured `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, while proactive Kali rules are local-first and do not require a deployment access token.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e docs/RELEASE_CHECKLIST.md
git commit -m "test: cover Kali guidance in release checks"
```
