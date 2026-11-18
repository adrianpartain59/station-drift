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

## Slide runs wide of every bend; steering down a bit (2026-11-17)
- Adrian: exit angle good now; the drift does not slide out enough, he takes drifts too sharp and has an
  accident; turn regular steering down a bit.
- Measured cause, hands only (key + SPACE from 5 m before the bend to 4 m before its end, then hands off, at
  cruise, every station bend with a straight either side in the first 9 km of 40 seeds, 779 bends):
  | bend radius | share of bends | before: ends on | before: width used | after: ends on | after: width used |
  |---|---|---|---|---|---|
  | under 45 m | 34% | outer wall 97% | 99% | outer wall 98% | 99% |
  | 45-55 m | 44% | outer wall 45% | 78% | outer wall 58% | 86% |
  | 55-65 m | 18% | INSIDE wall 45% | 25% | clean 92%, outer 8% | 51% |
  | 65-80 m | 4% | INSIDE wall 100% | 0% | clean 80%, inside 17% | 39% |
  The slide's arc was one fixed radius (60 m), so the gentler bends were cut inside. That is his accident.
- Fix: arc = bend radius x SLIDE_WIDE (1.15), kept between SLIDE_RADIUS 60 and SLIDE_RADIUS_MAX 90
  (ShipPhysics.stepManual). Tight bends as before; straights and sweepers 90 m.
- Rejected on the same test: one wider fixed arc. 78 m, and 72 m with SLIDE_GRIP 2.0, both took the 45-55 m
  bends (the most common) to 84% outer-wall endings.
- Steering: TURN_RATE 1.5 -> 1.35 rad/s, TURN_MAX 2.0 -> 1.85. Key held 0.4 s on a straight at 46 m/s: nose
  22 -> 20 degrees, moved 1.76 -> 1.58 m; 0.6 s: 38 -> 35 degrees, 5.47 -> 4.94 m. The slide's nose turns at
  the same rate, which is where the 45-55 m row's extra width comes from.
- Real key events in the browser, seed 42, first gentle bend (R 64 m, 58 m long), from the middle, key + SPACE
  held: 5.33 m out at 1.2 s, reaching the outer wall as the bend ends (1.25 s). Before: 3.6 m, then back in.
- FAIR_SHARE kept at 0.55, so the layout assumes the same share of the smaller turn rate. Obstacles per km
  4.1 -> 3.8, shortest sight time 1.20 -> 1.32 s.
- Hard, 30 seeds: PASS. Grip bot 0 obstacle hits, 0 hard wall hits; sliding bot 0 obstacle hits, 2 hard wall hits.
  Easy fingerprint unchanged. Build passes. No console errors.
- Full hard run on 5a270f5 (410 seeds, 5,200 km): search PASS on every seed, 3.9-4.0 obstacles per km, shortest
  sight 1.24 s, narrowest opening 5.40 m. Judged grip bot: 1 obstacle hit (seed 5147, laser at s=6178), 2 hard
  wall hits. Sliding bot (reported): 1 obstacle hit, 38 hard wall hits, 6 lost.
- Seed 5147 traced, bot fault: lined up with a laser gate's only opening 109 m out, the planner left for a
  lane the gate blocks, because the gate was in sight but beyond its 1.3 s look-ahead, so no lane was scored
  against it. It came back late, overshot, and hit the beam. Not fixed (see task_plan Phase 12).

## Adrian's seventh note: the drift feels rigid (2026-11-17)
- His words: "The drift still feels very rigid. I think that it needs to allow you to take sharper turns. Right
  now, it doesn't really feel any sharper than when you're normally turning, and this doesn't have to do with
  the exit angle." Asked for a review of everything he has asked for and a different system, not more tweaks.
- Measured, open plain, 46 m/s, key held throughout:
  | | travel turned 45 degrees after | turn rate it settles at |
  |---|---|---|
  | plain steering | 0.80 s | 1.85 rad/s |
  | drift (key + SPACE) | 1.62 s | 0.50 rad/s |
  In the drift the rate is 0.50 rad/s from 0.25 s on whether the key is held or tapped. Letting go lets it fade;
  the opposite key swings it the other way. Nothing makes it tighter. So he is right on both counts: the drift
  turns the ship about a quarter as sharply as not drifting, and the keys do nothing to tighten it.
- Cause: the cap on the slide's arc (60 m since phase 9, 60-90 m since phase 11), reached at 12-18 degrees of
  slip. Review and proposal: findings.md, last section.

## New drift built: the slide obeys the keys (2026-11-17, Adrian: "Build it")
- Controls untouched (his rule). Plain steering untouched. Only the ship's response while SPACE is held changed.
- What it does now (ShipPhysics.stepManual, numbers in SHIP.MANUAL):
  - SPACE down: grip lets go at once (LET_GO 60) to SLIDE_LOOSE 0.5, then bites to SLIDE_GRIP 2.4 over 0.38 s.
  - An arrow flicks the nose to 26 degrees (SLIDE_ANGLE 0.45 rad at 3.5 rad/s), then winds it deeper at
    0.7 rad/s while held, to 54 degrees. Arrows up: the angle eases back (3 /s). Other arrow: swings across.
  - The ship turns at grip x angle, no cap: 1.1 rad/s at the flick angle, 2.28 at full angle (plain: 1.85).
  - Exit mechanism unchanged; EXIT_PULL 5.0 -> 3.0 (tuck 32% -> 21% of the drift angle). Reason: the old slide
    left the ship running wide at release and the tuck cancelled it; the new slide leaves it on its line, so
    the same tuck threw it at the inside wall.
- Measured (npm run feel), 46 m/s, one key held: 45 degrees round in 0.68 s with SPACE, 0.81 s without; 90 in
  1.03 s against 1.25 s. SPACE in the middle of a corner: slides 1.3 m wide, back on its line at 0.69 s.
- Scripted players, 779 station bends, clean % by radius (under 45 / 45-55 / 55-65 / 65-80 m):
  | player | clean | outer wall / inner wall, all bends |
  |---|---|---|
  | eases the arrow on and off (hands 0.18 s late) | 89 / 100 / 100 / 100 | 3% / 0% |
  | no drift, plain steering, same judgement | 90 / 76 / 100 / 100 | 14% / 0% |
  | presses SPACE 0.25 s late | 63 / 49 / 95 / 100 | 36% / 0% |
  | holds arrow + SPACE all the way | 28 / 0 / 0 / 0 | 0% / 90% |
  The last row is the known cost: a held arrow keeps tightening, so holding it right through cuts inside.
- Tried and dropped, all measured with the same tool: keys turning the nose at a plain rate x 1.25 (inward jerk
  at the flick, no slide-out); a pause at the flick angle before it deepens (did not save the hold-everything
  player, hurt the others); a harder break-loose (2.4-3.3 m slide-out, but a late press hits the outside wall
  in half the common bends); wash-out past a peak angle (hold-everything 50-69% clean on common bends, but the
  drift is then no sharper than steering: 45 degrees in 0.84-0.93 s).
- Test bot: slide rule rewritten for the new slide; stopped it dithering on the drift button. 30 seeds hard:
  PASS; judged bot 0 obstacle hits, 0 hard wall hits; drifting bot 0 obstacle hits, 4 hard wall hits, 1,560
  drifts banked (was 368), median run 9.1 km (was 6.6): drifting well now pays.
- Browser, real key events, seed 42: R 50 m bend eased: slid 2.6 m out, came back, banked a boost, no wall.
  Screenshot mid-slide looks right. No console errors. Easy fingerprint unchanged. Build passes.
- Full hard run on 72ffd61 (410 seeds, 5,200 km): search PASS on every seed. Judged bot: 1 obstacle hit (seed
  139, laser at s=11336, not traced; same symptom as the open lane-scoring fault), 4 hard wall hits. Drifting
  bot (reported): 0 obstacle hits, 137 hard wall hits, about 22,000 drifts banked, median run 9.2-9.5 km.

## Adrian's eighth note: almost perfect, a little sharp (2026-11-17)
- His words: "The drift is much better now, it's almost perfect, it just feels a little sharp for some reason
  and I can't tell what part of it is causing that or if it's just too sensitive or something. The regular
  steering may be too sensitive as well." Asked for an opinion first, no changes. Then: "Yes, try it".
- Measured, turn rate per tenth of a second from the key going down (46 m/s, open ground):
  | | 0.3 s | 0.4 s | 0.5 s | 0.6 s | 0.8 s | 1.0 s |
  |---|---|---|---|---|---|---|
  | plain steering | 0.80 | 1.03 | 1.17 | 1.28 | 1.52 | 1.75 |
  | slide before | 0.94 | 1.39 | 1.62 | 1.79 | 2.12 | 2.28 |
  | slide now | 0.89 | 1.26 | 1.43 | 1.53 | 1.75 | 1.97 |
  A common bend at cruise needs about 0.9-1.1. The slide matched steering for 0.3 s, then hooked: grip finishes
  biting (0.38 s) while the held arrow is still deepening the angle.
- Change, one number: SLIDE_WIND 0.7 -> 0.45 rad/s. Steering not touched (the slide does not use the steering
  rate, and changing both would hide which one mattered).
- After: 45 degrees round in 0.73 s (was 0.68, plain 0.81); 90 in 1.13 s (was 1.03, plain 1.25); full angle
  after about 1.2 s of holding (was 0.85 s). Slide-out mid-corner 1.4 m (was 1.3 m). I had told him 2.0 m: that
  was the tool counting the run-out after the arrow was let go; the tool now reports the first run-out only.
- Scripted players (clean %, under 45 / 45-55 / 55-65 / 65-80 m): eases the arrow 83 / 100 / 100 / 100 (was 89 /
  100 / 100 / 100); presses late 58 / 38 / 89 / 100 (was 63 / 49 / 95 / 100); holds everything 58 / 2 / 0 / 0
  (was 28 / 0 / 0 / 0).
- Not chosen: smaller flick (kept as the next candidate if a tap alone feels sharp); slower bite (delays the
  hook 0.1 s and makes it steeper); both softenings together (eases-the-arrow player 63% on tight bends).
- 30 seeds hard: PASS; judged bot 0 obstacle hits, 0 hard wall hits; drifting bot 0 obstacle hits, 15 hard wall
  hits (4 before this change), 1,553 drifts banked. Full 410-seed run not repeated: the course, the search and
  the judged bot do not depend on this number. Easy fingerprint unchanged. Build passes. Browser, real keys,
  seed 42 R 50 m bend held 0.8 s: nose 20 -> 43 degrees (53 before), slid out and came back, no wall, no errors.

## Hard is the default mode (2026-11-17, Adrian: "make hard mode the default")
- `DEFAULT_MODE = 'hard'` in core/Modes.js; GameState starts there when nothing is saved, and when the saved
  value is not a mode. A player who picked EASY keeps EASY (their pick is saved); `?mode=` still wins.
- Checked in the browser: nothing saved -> HARD; chose easy earlier -> EASY; saved nonsense -> HARD. No console
  errors. Easy fingerprint unchanged; easy 20 seeds PASS, hard 20 seeds PASS; build passes.
- The verify tools keep their own defaults (`npm run verify` = easy, `npm run verify:hard` = hard).

## Public repo and GitHub Pages (2026-11-18, Adrian: "get it on github pages and make the repo public, make sure nothing is at risk")
- Audit before publishing, over every version of every file in all 25 commits on all 3 branches (main,
  hard-mode, movement-redesign):
  - Keys, tokens, private keys, bearer strings (pattern scan): none.
  - Email addresses inside files: none. In commit messages: only the co-author line's no-reply address.
  - Commit author email: his own, on every commit. It is the same address already shown on his GitHub
    profile, so publishing adds no new exposure.
  - Other projects, client names, private local paths: none. One old note mentions the project folder's path
    relative to the home folder.
  - Tracked binaries: four game screenshots in docs/. No large files anywhere in history.
  - The game makes no network calls of its own; the page loads two fonts from Google Fonts.
  - GitHub side: no repo secrets, variables, deploy keys, webhooks, forks, issues, pull requests or releases;
    one collaborator (him).
  - Dependencies: one advisory (picomatch pattern-matching slowdown) inside the build tool only; it is not in
    the published game and has no clean fix available yet.
  - What a visitor can read besides code: these three notes files, with his first name and his playtest
    comments quoted. No licence file, so the code stays all rights reserved.
- Repo made public. Pages switched on, built by `.github/workflows/pages.yml` (official actions, current
  major versions; the publishing job has no access to the code, the build job cannot publish).
- A clean clone, clean install and build were run locally first: works. The build already uses relative paths.
- First deploy: build and deploy jobs both succeeded. Live at https://adrianpartain59.github.io/station-drift/
  (HTTP 200, same script file as the local build). Opened in a browser: title screen renders, HARD is selected
  for a first-time visitor, a run starts and plays, no console errors.
- Repo homepage set to the live address.
