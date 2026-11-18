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

## Retune after the third playtest (2026-11-17)
- Steering halved back toward the assisted feel: holding LEFT now turns the nose 7 / 22 / 39 degrees at
  0.2 / 0.4 / 0.6 s (first manual version: 13 / 36 / 61; assisted: about 11.5 at most). A 0.1 s tap: 4 degrees.
- Slide runs wide: same R 62 m bend, same inside key held for 1 s at 46 m/s. On grip the ship is 1.4 m out at
  0.4 s and 3.9 m to the inside by 1.0 s. In a slide it is 0.5 / 1.2 / 1.9 / 2.6 / 3.2 m out at 0.2 .. 1.0 s and
  still going out, nose turned in 50 degrees.
- Easy fingerprint unchanged. Hard 24 seeds: search PASS on 1,205 groups (4.2/km); grip bot 0 obstacle hits,
  0 hard wall hits; sliding bot 1 obstacle hit, 1 hard wall hit in 288 km (reported, not judged).

## Full verification of the retuned hard mode (code at 05593ba, 2026-11-17)
- Hard, 410 seeds (1-200 and 5001-5200 at 12 km, 1001-1010 at 40 km), 5,200 km: the search PASSED on all 21,562
  obstacle groups (shortest time in sight 1.20 s, narrowest opening 5.41 m, 121.8 million start states).
- Judged grip bot: 2 obstacle hits in 5,200 km (seed 5124 laser at 4876, seed 5168 rock at 2099), 0 hard wall
  hits. Both traced: the bot was already in an open lane and switched lanes across the obstacle late (planner
  dithering; its look-ahead on a 1/40 s step does not match the real 1/120 s run closely enough for a tight
  cross). Bot fault, not layout. Fix not applied yet: saving Autopilot.js reloads the page Adrian is playing.
- Sliding bot (reported, not judged): 4 obstacle hits, 4 hard wall hits, 45 grazes.
- Hard self-test: 349 problems on 30 of 30 seeds. Easy, 100 seeds: PASS, both bots clean.

## Drift exit fix (2026-11-17)
- Before (R 62 m bend, 0.9 s slide, keys released): nose 43.5 degrees inside travel at release; travel swung to
  +26 degrees inward of the corridor within 0.3 s; ship moved 8.4 m toward the inside wall in 0.5 s.
- After: travel stays on its line (-3.6 -> -4.9 -> -7.5 degrees, i.e. no inward swing; the corridor is still
  turning away under a ship with no keys held); nose unwinds 43 -> 15 -> 4 -> 1 degrees in 0.3 s. With the steer
  key still held through the release, the ship comes back onto the bend smoothly over about 0.4 s, no overshoot.
- Bot fix: seeds 5124 and 5168 now pass. Hard 24 seeds PASS (grip bot 0 obstacle hits, 0 hard wall hits).
  Easy fingerprint unchanged.

## Drift exit, middle ground (2026-11-17)
- Adrian: after the exit fix he hit the outer wall instead. Wanted the middle.
- Share of the nose angle stored in the slide that the ship's travel takes on when let go (R 62 m bend, 0.9 s
  slide, 43.5 degrees stored): original 96% (42 degrees inward), first fix 12% (5 degrees), now 32% (14 degrees).
  Pull toward the nose at the moment of letting go: EXIT_PULL 1.0 -> 5.0, so steering also answers at once.
- Easy fingerprint unchanged; hard 24 seeds PASS.
