# System Testing Results

Date: 2026-10-19
Branch: `feat/system-testing-thesis-v2`

## Automated results

| Area | Coverage | Result |
| --- | --- | --- |
| AI policy and thesis cases | query validation, weather intent/parse fallback, reservation field validation, read-only refusal, guide PII refusal, guide-safe booking projection | PASS: 6 files/tests, 6 tests |
| GPS filtering and track integrity | valid participant fixes, low-quality/jump rejection, reconnect gap splitting, stale-location labels, existing jitter/spike/quality tests | PASS: 2 files/tests, 12 tests |
| TypeScript and Edge Functions | frontend compiler, `trail-chat-rag`, `ops-ai`, email functions | PASS |
| Landing load | k6 script added with 5/25/50/100 VU ramps, 2-minute hold, p95 < 800 ms and failure rate < 1% thresholds | NOT RUN: k6 is not installed and production traffic was not generated |
| Browser compatibility | Chromium, Firefox, WebKit, desktop/mobile | NOT RUN in this pass; no browser-engine result is claimed |

## Live AI cases

TC-AI-01a through TC-AI-10 are implemented as server-side guardrails and tool contracts, but live model assertions require deployed Edge Functions, configured AI credentials, and role-specific JWTs. They are therefore marked **Not run** here rather than represented as passing. The deterministic parts are covered by `src/test/aiThesisPolicy.test.ts`.

## GPS cases requiring devices

The following remain manual device checks: permission denial/recovery, background tracking after screen lock, offline reload/resume, and physical mountain-signal reconnect. The client implementation persists sessions and points locally, rejects poor fixes, and splits unmeasured reconnect gaps; these behaviors are covered by automated pure-function tests, but hardware reception was not simulated as real GPS evidence.

## Known manuscript issues to resolve

- TC-AI-01 is duplicated in the manuscript and should be split into 01a/01b.
- Booking CTA behavior and the read-only assistant boundary must be described separately.
- Conceptual paths and placeholder booking references such as `#BK-9021` should be replaced with this repository's actual routes and UUID-backed records.
- The GPS results table needs a clear distinction between automated filtering evidence and Not-run physical-device checks.
- Security, live-data availability, and external-service failure cases must remain explicit limitations.
