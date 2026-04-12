# Codex Latest Restart Delivery Review

## Scope

This note reviews every Telegram message that was actually delivered in the latest restart window and classifies whether that delivery was sensible. The review is analysis only; it does not change runtime behavior.

## Evidence Base

- Primary source: `/tmp/ptydeck-backend-debug.log`
- Review helper: `scripts/analyze-latest-restart-deliveries.mjs`
- Cross-check helper: `scripts/analyze-restart-resends.mjs`
- Session/thread mapping helper: `scripts/analyze-live-messaging-runtime.mjs`

## Latest Restart Window

- `readyAt`: `2026-04-12T17:54:10.724Z`
- `windowStart`: `2026-04-12T17:51:10.724Z`
- `windowEnd`: `2026-04-12T17:56:10.724Z`
- delivered messages in window: `52`
- sensible deliveries: `0`
- not sensible deliveries: `52`
- shipped scope observed in this window: `codex_separator_summary_sentence` only

## Verdict

All `52` delivered messages in this restart window were not sensible. None of them represented fresh post-restart live progress. Every delivered message fell into at least one restart-resend problem class, and most fell into all four of the main classes at once.

## Problem Classes

- `restart-history-resend`: the same normalized summary text had already been delivered before this restart window.
- `pre-ready-delivery`: the message was delivered before `runtime.ready`.
- `before-first-fresh-input`: the message was delivered before the first fresh post-restart input for that session.
- `duplicate-burst`: the same text reappeared multiple times inside the same restart window.

## Thread Mapping

| Thread | Deck | Session |
| --- | --- | --- |
| `7` | `secos-saas` | `secos-saas-frontend` |
| `8` | `snixy` | `codex` |
| `12` | `infra` | `infra-gcp` |

## Grouped Summary

| Thread | Deck / Session | Text | Count | Sensible | Problems |
| --- | --- | --- | ---: | ---: | --- |
| `12` | `infra / infra-gcp` | committed. der qualitätslauf läuft noch durch, danach committe ich nur den | 11 | 0 | before-first-fresh-input, duplicate-burst, pre-ready-delivery, restart-history-resend |
| `12` | `infra / infra-gcp` | completed and pushed multiple cycles on main with full local validation after | 11 | 0 | before-first-fresh-input, duplicate-burst, pre-ready-delivery, restart-history-resend |
| `7` | `secos-saas / secos-saas-frontend` | updated and synchronized the three files with current validated state. | 8 | 0 | before-first-fresh-input, duplicate-burst, pre-ready-delivery, restart-history-resend |
| `7` | `secos-saas / secos-saas-frontend` | updated in docs<path> auf heute, damit die doku konsistent ist. | 8 | 0 | before-first-fresh-input, duplicate-burst, pre-ready-delivery, restart-history-resend |
| `7` | `secos-saas / secos-saas-frontend` | completed. i finished all previously open short-term cycles (39.7, 39.8, 39.9) | 7 | 0 | before-first-fresh-input, duplicate-burst, pre-ready-delivery, restart-history-resend |
| `12` | `infra / infra-gcp` | updated wave-1 image refs are now published on the latest | 4 | 0 | before-first-fresh-input, duplicate-burst, pre-ready-delivery, restart-history-resend |
| `8` | `snixy / codex` | committed manual-test-ordner und bringe anschließend den sas-report selbst in | 1 | 0 | before-first-fresh-input, restart-history-resend |
| `8` | `snixy / codex` | committed und gepusht sind. danach gebe ich dir den aktuellen offenen task- | 1 | 0 | before-first-fresh-input, restart-history-resend |
| `8` | `snixy / codex` | completed und halte die zusätzlichen neuen seams samt realem teststand | 1 | 0 | before-first-fresh-input, restart-history-resend |

## Per-Message Review

| # | Timestamp | Thread | Deck / Session | Text | Sensible | Problem |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `2026-04-12T17:51:54.618Z` | `7` | `secos-saas / secos-saas-frontend` | updated and synchronized the three files with current validated state. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 2 | `2026-04-12T17:51:58.850Z` | `7` | `secos-saas / secos-saas-frontend` | updated in docs<path> auf heute, damit die doku konsistent ist. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 3 | `2026-04-12T17:52:02.868Z` | `7` | `secos-saas / secos-saas-frontend` | updated and synchronized the three files with current validated state. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 4 | `2026-04-12T17:52:08.066Z` | `7` | `secos-saas / secos-saas-frontend` | updated in docs<path> auf heute, damit die doku konsistent ist. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 5 | `2026-04-12T17:52:09.125Z` | `7` | `secos-saas / secos-saas-frontend` | completed. i finished all previously open short-term cycles (39.7, 39.8, 39.9) | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 6 | `2026-04-12T17:52:12.611Z` | `7` | `secos-saas / secos-saas-frontend` | updated and synchronized the three files with current validated state. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 7 | `2026-04-12T17:52:13.822Z` | `12` | `infra / infra-gcp` | completed and pushed multiple cycles on main with full local validation after | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 8 | `2026-04-12T17:52:16.249Z` | `7` | `secos-saas / secos-saas-frontend` | updated in docs<path> auf heute, damit die doku konsistent ist. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 9 | `2026-04-12T17:52:17.195Z` | `7` | `secos-saas / secos-saas-frontend` | completed. i finished all previously open short-term cycles (39.7, 39.8, 39.9) | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 10 | `2026-04-12T17:52:21.779Z` | `7` | `secos-saas / secos-saas-frontend` | updated and synchronized the three files with current validated state. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 11 | `2026-04-12T17:52:26.182Z` | `7` | `secos-saas / secos-saas-frontend` | updated in docs<path> auf heute, damit die doku konsistent ist. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 12 | `2026-04-12T17:52:27.341Z` | `7` | `secos-saas / secos-saas-frontend` | completed. i finished all previously open short-term cycles (39.7, 39.8, 39.9) | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 13 | `2026-04-12T17:52:31.281Z` | `7` | `secos-saas / secos-saas-frontend` | updated and synchronized the three files with current validated state. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 14 | `2026-04-12T17:52:34.572Z` | `7` | `secos-saas / secos-saas-frontend` | updated in docs<path> auf heute, damit die doku konsistent ist. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 15 | `2026-04-12T17:52:35.401Z` | `7` | `secos-saas / secos-saas-frontend` | completed. i finished all previously open short-term cycles (39.7, 39.8, 39.9) | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 16 | `2026-04-12T17:52:38.702Z` | `7` | `secos-saas / secos-saas-frontend` | updated and synchronized the three files with current validated state. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 17 | `2026-04-12T17:52:41.797Z` | `7` | `secos-saas / secos-saas-frontend` | updated in docs<path> auf heute, damit die doku konsistent ist. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 18 | `2026-04-12T17:52:42.544Z` | `7` | `secos-saas / secos-saas-frontend` | completed. i finished all previously open short-term cycles (39.7, 39.8, 39.9) | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 19 | `2026-04-12T17:52:44.601Z` | `12` | `infra / infra-gcp` | committed. der qualitätslauf läuft noch durch, danach committe ich nur den | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 20 | `2026-04-12T17:52:45.524Z` | `7` | `secos-saas / secos-saas-frontend` | updated and synchronized the three files with current validated state. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 21 | `2026-04-12T17:52:54.472Z` | `7` | `secos-saas / secos-saas-frontend` | updated in docs<path> auf heute, damit die doku konsistent ist. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 22 | `2026-04-12T17:52:54.623Z` | `12` | `infra / infra-gcp` | completed and pushed multiple cycles on main with full local validation after | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 23 | `2026-04-12T17:52:54.985Z` | `7` | `secos-saas / secos-saas-frontend` | completed. i finished all previously open short-term cycles (39.7, 39.8, 39.9) | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 24 | `2026-04-12T17:52:55.631Z` | `12` | `infra / infra-gcp` | committed. der qualitätslauf läuft noch durch, danach committe ich nur den | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 25 | `2026-04-12T17:52:56.735Z` | `7` | `secos-saas / secos-saas-frontend` | updated and synchronized the three files with current validated state. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 26 | `2026-04-12T17:52:59.650Z` | `12` | `infra / infra-gcp` | completed and pushed multiple cycles on main with full local validation after | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 27 | `2026-04-12T17:52:59.969Z` | `7` | `secos-saas / secos-saas-frontend` | updated in docs<path> auf heute, damit die doku konsistent ist. | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 28 | `2026-04-12T17:53:00.125Z` | `12` | `infra / infra-gcp` | committed. der qualitätslauf läuft noch durch, danach committe ich nur den | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 29 | `2026-04-12T17:53:01.210Z` | `7` | `secos-saas / secos-saas-frontend` | completed. i finished all previously open short-term cycles (39.7, 39.8, 39.9) | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 30 | `2026-04-12T17:53:01.428Z` | `12` | `infra / infra-gcp` | completed and pushed multiple cycles on main with full local validation after | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 31 | `2026-04-12T17:53:04.802Z` | `12` | `infra / infra-gcp` | committed. der qualitätslauf läuft noch durch, danach committe ich nur den | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 32 | `2026-04-12T17:53:06.391Z` | `12` | `infra / infra-gcp` | completed and pushed multiple cycles on main with full local validation after | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 33 | `2026-04-12T17:53:06.750Z` | `12` | `infra / infra-gcp` | committed. der qualitätslauf läuft noch durch, danach committe ich nur den | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 34 | `2026-04-12T17:53:08.019Z` | `12` | `infra / infra-gcp` | completed and pushed multiple cycles on main with full local validation after | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 35 | `2026-04-12T17:53:08.580Z` | `12` | `infra / infra-gcp` | committed. der qualitätslauf läuft noch durch, danach committe ich nur den | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 36 | `2026-04-12T17:53:11.634Z` | `12` | `infra / infra-gcp` | completed and pushed multiple cycles on main with full local validation after | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 37 | `2026-04-12T17:53:12.267Z` | `12` | `infra / infra-gcp` | committed. der qualitätslauf läuft noch durch, danach committe ich nur den | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 38 | `2026-04-12T17:53:16.435Z` | `12` | `infra / infra-gcp` | completed and pushed multiple cycles on main with full local validation after | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 39 | `2026-04-12T17:53:17.180Z` | `12` | `infra / infra-gcp` | committed. der qualitätslauf läuft noch durch, danach committe ich nur den | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 40 | `2026-04-12T17:53:18.029Z` | `12` | `infra / infra-gcp` | updated wave-1 image refs are now published on the latest | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 41 | `2026-04-12T17:53:56.548Z` | `12` | `infra / infra-gcp` | completed and pushed multiple cycles on main with full local validation after | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 42 | `2026-04-12T17:53:57.034Z` | `12` | `infra / infra-gcp` | committed. der qualitätslauf läuft noch durch, danach committe ich nur den | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 43 | `2026-04-12T17:53:57.733Z` | `12` | `infra / infra-gcp` | updated wave-1 image refs are now published on the latest | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 44 | `2026-04-12T17:54:00.872Z` | `12` | `infra / infra-gcp` | completed and pushed multiple cycles on main with full local validation after | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 45 | `2026-04-12T17:54:01.326Z` | `12` | `infra / infra-gcp` | committed. der qualitätslauf läuft noch durch, danach committe ich nur den | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 46 | `2026-04-12T17:54:02.039Z` | `12` | `infra / infra-gcp` | updated wave-1 image refs are now published on the latest | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 47 | `2026-04-12T17:54:05.827Z` | `12` | `infra / infra-gcp` | completed and pushed multiple cycles on main with full local validation after | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 48 | `2026-04-12T17:54:06.456Z` | `12` | `infra / infra-gcp` | committed. der qualitätslauf läuft noch durch, danach committe ich nur den | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 49 | `2026-04-12T17:54:07.123Z` | `12` | `infra / infra-gcp` | updated wave-1 image refs are now published on the latest | `no` | restart-history-resend, pre-ready-delivery, before-first-fresh-input, duplicate-burst |
| 50 | `2026-04-12T17:54:33.959Z` | `8` | `snixy / codex` | committed und gepusht sind. danach gebe ich dir den aktuellen offenen task- | `no` | restart-history-resend, before-first-fresh-input |
| 51 | `2026-04-12T17:54:34.066Z` | `8` | `snixy / codex` | committed manual-test-ordner und bringe anschließend den sas-report selbst in | `no` | restart-history-resend, before-first-fresh-input |
| 52 | `2026-04-12T17:54:46.697Z` | `8` | `snixy / codex` | completed und halte die zusätzlichen neuen seams samt realem teststand | `no` | restart-history-resend, before-first-fresh-input |

## Assessment by Topic

- `thread 7` (`secos-saas / secos-saas-frontend`): all `23` deliveries in this window were restart-history resends that started before readiness and before any fresh session input. They also formed an internal duplicate burst of three repeated text variants.
- `thread 12` (`infra / infra-gcp`): all `26` deliveries in this window were restart-history resends that started before readiness and before any fresh session input. They also formed an internal duplicate burst of three repeated text variants plus one shorter repeated variant.
- `thread 8` (`snixy / codex`): all `3` deliveries in this window were still restart-history resends and still happened before the first fresh session input. They were post-ready, which proves that `runtime.ready` alone is not a sufficient suppression boundary.

## Why None Were Sensible

A sensible delivery after restart must represent fresh post-restart progress. These deliveries did not. They replayed already-delivered summary-family texts from earlier process windows, arrived before any fresh session interaction in the affected sessions, and in the dominant cases also arrived before runtime readiness and in duplicate bursts. That is restart resend behavior, not fresh outbound progress.

## Clean Follow-Up Constraint

Any future runtime fix must suppress this specific failure mode on `codex_separator_summary_sentence` without muting fresh post-input summaries. The latest restart audit proves that the current delivered `H109` implementation is not yet effective enough in live practice for the summary family, even though the intended gating seams are present in code.

## Reproduce

```bash
node scripts/analyze-latest-restart-deliveries.mjs --format json
node scripts/analyze-restart-resends.mjs --restart-count 1 --format json
node scripts/analyze-live-messaging-runtime.mjs --since-minutes 720 --format json
```
