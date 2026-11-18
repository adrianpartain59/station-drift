# Progress: movement + obstacle redesign

## 2026-11-16
- Branch `movement-redesign` created from db2593e. Old planning files replaced (history keeps them).
- Read all source. Research subagent returned (see findings.md). Design fixed.
- Constants.js: map blocks kept; SHIP/DRIFT/CLOCK/SCORE/CAMERA rewritten. Track.js trimmed to the centreline
  and now records `pieces`; all obstacle/coin/pad code and collision helpers removed from it.
- ShipPhysics, Course, Autopilot, Pace written (no three.js). First bot drive: 6 km x 3 seeds, 0 crashes, 0 wall hits.
- tools/verify/passability.mjs: sight lines, openings, exhaustive sideways search (information-limited), two bots.
  Found the sideways-speed gap in the layout maths on its first run; fixed in Course.worstTime.
- Browser layer rewritten: ShipModel (hover coupe + cockpit), CourseView (replaces level/Entities.js), CameraRig,
  Skid effect, Audio one-shots, Input, HUD + index.html, Game. EventBus removed (ship reports through a callback).
- Scripted imperfect players (scratchpad players.mjs / novice.mjs) used as a stand-in for hands-on feel:
  before fixes, "hold SPACE + inside key" hit a wall 1.4 times/km; after, 0.00. Doing nothing no longer keeps pace.
- Clock redesigned twice (see task_plan decisions). Run length by scripted player: nothing 4.5-5.7 km, steer only
  5.5-6 km, sloppy drifter 9-14 km, decent drifter 11-14 km.
- Deep set-pieces: 3,587 obstacles in 1,087 groups over 360 km, all proved.
- Checked in the in-app browser with stepped frames: title, chase and cockpit views (straight + mid-drift), each
  obstacle kind, gate, boost, game over; synthetic keyboard run banks drifts and earns clock. No console errors.
- Not checked: real hands on a keyboard, audio by ear, gamepad, touch.

### Final scripted-player table (8 seeds x 16 km, committed code)
| player | crashes/km | hard wall hits/km | grazes/km | speed vs cruise | clock runs out at |
|---|---|---|---|---|---|
| touches nothing | 1.16 | 1.56 | 0.94 | 92% | 4.3-5.7 km |
| steers at the coins, never drifts | 0.00 | 0.68 | 0.13 | 98% | 5.5-6.1 km |
| holds SPACE late in bends, never steers | 1.01 | 0.17 | 0.24 | 97% | 6.6-11.1 km |
| SPACE + inside key, late, follows coins | 0.01 | 0.00 | 0.04 | 102% | 9.4-13.6 km |
| presses early, follows coins | 0.00 | 0.01 | 0.00 | 103% | 10.8-15.3 km |

- Seeds 1-300 x 12 km and 1001-1012 x 40 km passed; seeds 5001-5080 found one failure (seed 5008, s=8759).
  Root cause: width change ignored by the layout maths. Fixed in Course.tryPlace / settledStart; re-verifying on 1,000+ seeds.

## Final verification (code at d94b626, 2026-11-16)
- 1,020 seeds, 12,800 km of course (seeds 1-400, 5001-5300, 20001-20300 at 12 km; 1001-1020 at 40 km): PASS.
  114,843 obstacles in 35,700 groups; shortest time in sight 1.75 s; narrowest opening 6.30 m for a 2.5 m hull;
  294.6 million start states searched; flat-out bot and no-drift bot: 0 obstacle hits, 0 hard wall hits, 0 grazes.
- Self-test (obstacles shoved 45 m): 428 problems on 40 of 40 seeds, as it must.
- `npm run build` passes. In-app browser: no console errors over a 50 s cockpit + chase run and two restarts.

- 2026-11-16: Adrian asked to merge. `movement-redesign` merged into `main` (merge commit, no fast-forward) and pushed.

## Hard mode (2026-11-16, branch hard-mode)
- Adrian's playtest: wants faster base speed, more and more varied obstacles (lasers), a drift that cannot be
  tapped down a straight for boosts; keep today's game as EASY, build HARD.
- Modes.js + live constants; easy fingerprint identical after every step.
- Hard drift, hard course (spans, laser gate / sweep / fenced lane / fenced bend), views, mode UI.
- Hard scripted players (6 seeds x 14 km): nothing 1.9-3.8 km, steer only 4.5-5.7, late SPACE only 3.9-6.2,
  sloppy drifter 7.0-9.6, decent drifter 7.1-12.8. Coin lines: 0 of 9,834 coins inside an obstacle's reach.
- Pacing: hard 5.0 set-pieces/km, median 2.8 s apart (90th pct 7.4 s); easy 2.8/km, 6.1 s (14.9 s).
- Hard verify, first full run (600 seeds x 12 km): search PASS on all 34,819 groups; bots hit lasers on 7 seeds
  and walls on 3. Causes fixed (see task_plan errors). Easy 150 seeds: PASS. Hard 20 x 40 km: PASS.
  Hard self-test: 1,018 problems on 40 of 40 seeds.

## Manual handling for hard (2026-11-17)
- Adrian played hard: wants no automatic turning round bends, more sensitive steering, no stop after holding a
  key for a second, and a drift with the same sensitivity that slides outward more.
- Hard is now fully manual (ShipPhysics.stepManual). Through real key events in the browser: holding LEFT turns
  the nose 13 / 36 / 61 degrees at 0.2 / 0.4 / 0.6 s and keeps going; hands off in an R 62 m bend the nose falls
  20.4 degrees behind the corridor in 0.5 s, exactly the corridor's own turn (no assist); RIGHT for 0.5 s gives
  nose 48 degrees with or without the drift button, slip 10 degrees on grip and 25 degrees in a slide.
- Easy fingerprint unchanged. Hard 24 seeds: search PASS on 1,387 groups (4.8/km); grip bot 0 obstacle hits,
  0 hard wall hits; sliding bot 0 obstacle hits, 4 hard wall hits, 12 grazes in 288 km. Easy 24 seeds: PASS.
