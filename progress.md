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

## Second map: SKYWAY (2026-11-18, branch `claude/new-map-414ab7`, from main @ 4acc798)
Adrian's brief: a new map where open air is the focus (much wider, nearly always bending, up and down on smooth
curves, sparse moving obstacles), stations are shorter and read as ships, the background stays, the old map
stays switchable.

What was built
- Two maps (`src/core/Maps.js`): SKYWAY (new, default on this branch) and CLASSIC (the old one). `?map=`, a
  chip on the title and game-over screens, saved pick, a best score per map and mode. No new key.
- `src/level/TrackSkyway.js`: open air 64 m rail to rail (was 30), sweepers / hairpins / linked esses with calm
  sweepers between, real heights; stations are ships along world forward with tight corners in close pairs.
- Height everywhere: `Track.Y` / `G`, `sample()` returns `y` and `g`. The world builder, ship (it pitches and
  leans with the road), both cameras, obstacles, gates, pads, signs, coins, skid marks and sparks follow it.
  Before this there was no height at all (`Track.H` is heading).
- Open air is a real deck now (plating, lane lines, kerb, skirt, underside, lifter pods, soft rails: cyan on the
  right, magenta on the left). Each station is one rigid hull (`src/level/ShipHull.js`): three forms, lit
  outline, bridge, wings, engines either side of the mouth you fly in by, prow prongs at the other end, name
  on both flanks; bulkhead frames inside.
- Movers in open air: orbit, patrol, beacon, shuttle. Each moves inside an envelope painted on the deck; layout,
  bots and proof treat the whole envelope as solid.
- Clock pace is set per map (the only rule that differs). Handling numbers are untouched.

Classic is unchanged
- `npm run fingerprint`: EASY 4c21b329... and HARD 7df664ce... (recorded from main before any shared code was
  touched) both match after every step.
- `passability` output on 16 seeds per mode is identical to main's, line for line, apart from the map's name.
- Full classic runs on this branch: EASY 200 seeds x 12 km PASS, 10 x 40 km PASS. HARD 200 x 12 km: the search
  passes on every seed; the judged bot hits one laser (seed 139, s=11336), which is the known open item from
  main at the same seed and place; HARD 10 x 40 km PASS.

The map, measured (`npm run mapcheck`, 620 seeds: 1-300 and 5001-5300 at 12 km, 1001-1020 at 40 km): PASS
- Open air is 74% of the distance (stretches 1.07-2.38 km, median 1.62; ships 404-759 m, median 587).
- 64 m rail to rail wherever the width has settled.
- 69% of open air is a real bend (R 70-120 m), 83% is bending at all, 13% is calm sweeper, 17% dead straight
  (the longest straight is the 158 m run-in to a ship's mouth).
- Real bends: 3.9 per km, 92 / 128 / 174 m long (10th / median / 90th percentile); at cruise that is 1.6 / 2.3 /
  3.2 s in hard and 2.0 / 2.8 / 3.9 s in easy.
- Height: steepest slope 13.0% (cap 13%), tightest crest R 700 m (cap 700), tightest dip R 420 m (cap 420),
  no kink and no jump in vertical curvature anywhere; 82% of real-bend distance is on a slope of 3% or more.
- Nearest any two different stretches come: 58 m between footprints (rule: 12 m).

How it slides (`npm run feel:skyway`, hard, cruise speed, 1,282 open-air bends and 826 ship corners)
| player | open air, clean | slide held, average (90th pct) | road crossed | nova | ship corners clean, R < 45 / R >= 45 |
|---|---|---|---|---|---|
| takes the wide line, eases the arrow | 100% | 2.8-3.4 s (3.4-4.3 s); hairpins 4.6 s (5.1 s), 248 m | 37-39 m | 59-68%; hairpins 100% | (open air only) |
| holds the middle, eases the arrow | 100% | 2.3-2.9 s (2.7-3.9 s); hairpins 4.0 s | 8 m | 58-66%; hairpins 86% | 79% / 100% |
| presses SPACE 0.25 s late | 100% | 1.9-2.5 s; hairpins 3.7 s | 8-10 m | 29-52%; hairpins 94% | 37% / 81% |
| no drift, plain steering | 100% | - | 3-5 m | - | 58% / 95% |
| holds arrow + SPACE right through | 0%: reaches the inside rail after 1.3 s | 1.3 s | 30 m | 0% | 58% / 29% |
The last row is the known cost of the slide as Adrian settled it (a held arrow keeps tightening). On this map
it meets a soft rail 30 m away instead of a wall. Ship corners: plain steering no longer clears the tight ones
(42% end on the outer wall), a slide that is eased clears 79%, which is what the classic map's tight bends give (83%).

Fairness (`npm run verify:skyway`, `verify:skyway:hard`), run on e54a10f (since then only the ships' entry end,
which is looks only, and the self-test's shove have changed; the generated map is identical, checked by hash)
Each mode: 410 seeds, 5,200 km of course (seeds 1-200 and 5001-5200 at 12 km, 1001-1010 at 40 km).
- EASY: PASS on every seed. 3,380 groups, of them 1,722 movers (0.33 per km), 121 million start states, shortest
  time in sight 1.82 s, narrowest opening 6.34 m. Both bots: 0 obstacle hits, 0 hard wall hits, 0 grazes in
  10,400 km of driving.
- HARD: PASS on every seed. 6,642 groups, of them 1,913 movers (0.37 per km), 100 million start states, shortest
  time in sight 1.24 s, narrowest opening 5.42 m. Judged (no-drift) bot: 0 obstacle hits, 3 hard wall hits.
  Sliding bot (reported, not judged): 0 obstacle hits, 713 hard wall hits (0.14 per km, inside ships; classic
  hard on this branch: 0.075 per km).
- Every mover's motion sampled for 45 s: none leaves the envelope the proof treats as solid.
- Self-test (station rows shoved 45 m, movers 130 m): fails on 40 of 40 seeds in both modes, and the movers
  alone are caught on every seed that has any (152 of 152 groups easy, 173 of 174 hard).
- Run lengths on the clock, drifting bot / no-drift bot (median): EASY 10.6-11.5 km / 4.6 km (classic 11.3 / 4.6);
  HARD 10.1-10.5 km / 4.2 km (classic 9.2 / 6.2).

Frames (seed 42, hard, default quality)
- Draw calls, sampled once a second over the first 3 km: SKYWAY 160 / 348 / 387 (min / median / max), CLASSIC
  156 / 408 / 485. Triangles: 42-95 thousand against 52-93 thousand. A ship's hull is 11 draw calls.
- Real Chrome, his Mac, 2382 x 1145 drawing buffer, `?perf`: SKYWAY chase 119.9 fps, median frame 8.3 ms,
  99th percentile 10.1 ms, worst 32 ms, no frame over 34 ms in 50 s. SKYWAY cockpit 120.0 fps, worst 15 ms.
  CLASSIC chase 119.6 fps, worst 39 ms. (The display runs at 120 Hz.)

Checked in the browser (stepped frames): title with map chips; open air on a 12% climb, mid-slide, in a hairpin;
approach to three ships from 250 m, 140 m and 80 m and from the quarter; inside a ship; each mover; chase and
cockpit; classic open space. Real key events start a slide and charge it on the new map. No console errors.

Not verified
- Real hands on a keyboard on the new map. Audio by ear. Gamepad and touch.
- A ship seen from the far side or from below (never on screen in the runs looked at).
- Frame times at low quality, on battery, or on another machine.

## SKYWAY merged (2026-11-18, Adrian: "Merge to main")
- `main` fast-forwarded from 4acc798 to the branch. Before the push: both classic fingerprints match, the build
  passes. SKYWAY is now the default map for a new visitor; a saved pick is kept, and `?map=classic` or the
  CLASSIC chip gives the old map.
- He had not played the new map when he said it. The knobs listed under "Next Step" in task_plan.md are
  still his to turn.

## Twice the speed, to feel it (2026-11-18, Adrian: "make the base movement speed a lot faster like twice as fast, I just want to see how that feels")
- Built as a test hook, not a change to the game's numbers: `?speed=2` in the game, `--speed 2` in the tools
  (`TEST` in core/Maps.js). Any value from 0.5 to 3. Everything in metres per second is multiplied (cruise, start
  speed, and the rates that would otherwise take twice as long: pulling away, braking, boost, what a wall or a
  slide scrubs off). Steering, the slide and the clock are untouched. The HUD says SPEED x2 and no best is saved.
  On the branch only; not on `main`, so the live site does not have it.
- At 1x nothing moves: both classic fingerprints match and the SKYWAY numbers are the same.
- What 2x does on SKYWAY, measured (hard cruise becomes 92-120 m/s, the speedo reads 660-1,040):
  | | 1x | 2x |
  |---|---|---|
  | time in the median open-air bend, hard | 2.3 s | 1.2 s |
  | open-air bends an eased slide clears | 100% | 44% (R 70-90), 72%, 81% (R 105-120); hairpins 50% |
  | slide held, average | 2.3-2.9 s | 1.2-1.5 s |
  | open-air bends plain steering clears | 100% | 90-100%; hairpins 69% |
  | tight ship corners an eased slide clears | 79% | 13% (82% end on the outer wall) |
  | tight ship corners plain steering clears | 58% | 21% |
  | obstacle groups per km, hard / easy | 1.2 / 0.6 | 0.1 / 0.02 |
  | movers per km, hard / easy | 0.37 / 0.33 | 0.06 / 0 |
  | drifting bot's median run, hard | 10-11 km | 7.6 km |
  The proof still passes (16 seeds per mode): the layout places for whatever speed is live, so nothing unfair
  is laid; it simply finds almost nowhere with room. Ships cannot be taken at cruise: R 30-56 m at 92-120 m/s
  asks 1.6-4.0 rad/s and the slide tops out at 2.28. The brake (S) is what gets through them.
- In easy the no-drift bot hits a wall 124 times in 192 km (grip steering cannot hold a bend at this speed) and
  the drifting bot's clock never runs out.
- If he likes the speed: the map has to grow with it (bend radii and lengths, calm sweepers, ship corners all
  about twice the size) for bends to last as long, ships to be drivable and obstacles to come back. Not done.

## Fast open air, normal ships (2026-11-18, Adrian, after playing `?speed=2`)
His words: "the map is already nicely scaled for that speed specifically for the open air parts, but the station
parts are not, make it so when you start approaching the station parts it slows you down back to our previous
speed, and when you're exiting the station it speeds you up".
- That is his hands against my scripted players (who clear fewer open-air bends at 2x): his hands decide how it
  feels. No change to the map's open air.
- Built: speed is per zone on SKYWAY in HARD. Open air runs at 2x the ships' speed (`SHIP.AIR_SPEED: 2`, set
  in core/Maps.js). `Track.F` marks the zones; `Pace.airFactor` turns them into speed.
  - Brake field: the last 198 m before a ship's mouth (the funnel and the end of the bend before it), done 12 m
    before the mouth. A steady 18 m/s^2 early in a run, 31 late (92 -> 46 m/s, later 120 -> 60).
  - Launch: from 10 m past the exit, over 170 m. A steady 20-34 m/s^2.
  - The road does it: in a zone the ship is taken to the zone's speed as hard as the zone asks, whatever the
    engine would do. Steering, the slide, the brake key and the clock rules are untouched.
  - On the deck: amber bars across the brake field, closing up toward the mouth; running chevrons down the
    launch. BRAKE FIELD and LAUNCH come up on the HUD.
- EASY is unchanged (one speed everywhere), and so is the classic map: both fingerprints match; `passability`
  output is identical line for line on 16 seeds for classic easy, classic hard, SKYWAY easy, and SKYWAY hard
  with the factor set back to 1 (`--air 1`).
- `?air=N` in the game and `--air N` in the tools try another factor (`?air=1` is the old single speed).
  `?speed=N` still multiplies everything.

Fairness with fast open air (`npm run verify:skyway:hard`), run on 9b8e079: 410 seeds, 5,200 km: PASS on every seed
- 3,382 groups, 78 million start states, shortest time in sight 1.23 s, narrowest opening 5.44 m.
- Judged (no-drift) bot: 0 obstacle hits, 1 hard wall hit. Sliding bot (reported): 0 obstacle hits, 916 hard wall
  hits (0.18 per km; 0.14 before).
- New rule, and it passes: neither bot is ever more than 3% over the top speed the course is laid out for at
  that point. The most either was: 0.4%. So the brake field delivers the ship to a mouth at the ships' speed.
- Each group is searched at the top speed of the stretch it stands on, and sight and room are only counted
  from where the ship is down to that speed (in the layout and, separately, in the check).
- Self-test: fails on 60 of 60 seeds; movers caught on every seed that has any (43 of 43 groups). The movers'
  shove now grows with the open-air factor (260 m here): 130 m is under a second of road at this speed.
- SKYWAY easy, 60 seeds: PASS, same numbers as before.

What it does to play, measured (hard)
| | one speed (before) | fast open air (now) |
|---|---|---|
| cruise in open air / in a ship | 46-60 / 46-60 m/s | 92-120 / 46-60 m/s |
| the bots' average speed over 12 km | 58 m/s | 84 m/s |
| time in the median open-air bend | 2.3 s | 1.2 s |
| open-air bends an eased slide clears (R 70-90 / 90-105 / 105-120 / hairpins) | 100 / 100 / 100 / 100% | 57 / 78 / 83 / 53% |
| slide held, average | 2.3-2.9 s | 1.3-1.5 s; hairpins 2.0 s |
| open-air bends plain steering clears | 100% | 91 / 97 / 100%; hairpins 69% |
| ship corners an eased slide clears (R < 45 / R >= 45) | 79 / 100% | 79 / 100% |
| station rows per km | 0.85 | 0.59 |
| movers per km | 0.37 | 0.064 (one in about 16 km) |
| drifting bot's / no-drift bot's median run | 10.1 / 4.2 km | 10.5-11.0 / 5.1 km |
- The clock needed no retune.
- Movers are all but gone from open air in hard. The layout only places one where the ship has provably had
  time to see it and get round it, and at 110-144 m/s a 200-270 m calm sweeper is under two seconds long.
  Bringing them back means calm stretches about twice as long, which changes the open air he likes. His call.
- Station rows are a little fewer because sight is no longer counted from out in the brake field.
- Stepped frame cost is unchanged (median 1.9 ms, 99th percentile 4.9 ms). Real-Chrome frame times were not
  re-measured at the new speed: the measuring tab was not in front.
- Merged into `main` the same day on Adrian's word ("Merge to main"), fast-forward from 8083c32. Before the push:
  both classic fingerprints match and the build passes. The live site now has fast open air in SKYWAY hard, and
  the `?speed=` and `?air=` test hooks.

## Downward spirals (2026-11-18, Adrian: "Build spirals first")
He asked whether a downward spiral could be added where a slide is held for a full 360 degrees, and whether the
track could curve under or over itself. A probe on the real hard-mode physics before building anything: a
scripted player who eases the arrow held one slide right round 360 and 720 degrees at R 85 / 100 / 115 m, at
93 and at 120 m/s, without touching a rail (4.6-7.9 s a turn).

Built (merged into `main` the same day on Adrian's word, "Merge to main", fast-forward from 513796e; both classic
fingerprints matched and the build passed before the push)
- A spiral piece in the SKYWAY generator: a short run-in, right round once (15% of them: twice), R 82-104 m,
  a steady 5-8.5% down, a short run-out, then a sweeper the other way. At most one per stretch of open air.
- The no-overlap rule is 3D now: two stretches may overlap in plan only with 18 m between their decks, and
  nothing may be over, under or beside a ship. The generator measures every spiral against the road round it
  and both ships and lays the stretch again without it if it fails (about one in six does).
- All of a spiral stays built while it is near (the turn above you and the turn below are far outside the
  usual window measured along the road). Coins on the inside third, chevron boards all the way round,
  SPIRAL / HOLD THE SLIDE on the HUD.
- Not built: other crossings (flyovers, figure-8s), upward spirals.

The map with spirals (`npm run mapcheck`, 620 seeds: 1-300 and 5001-5300 at 12 km, 1001-1020 at 40 km): PASS
- 1,798 spirals, one per 4.5 km of track. 515-1,306 m of road each (median 596 m). Each turn drops 26-55 m.
- Least height between two decks that overlap in plan, anywhere: 18.1 m (rule: 18). Nearest two stretches come
  without passing over or under: 12 m between footprints (rule: 12).
- Every spiral is whole turns at one steady slope; every ship is on its axis with nothing near it.
- Open air is now 75% of the distance. Slope and curvature caps unchanged and met. Over 40 km the road ends
  up as much as 447 m below where it started: spirals only go down. Nothing depends on absolute height.

How a slide holds one (`npm run feel:skyway`, hard, 65 spirals in 40 seeds)
| player | once round (52) | twice round (13) |
|---|---|---|
| eases the arrow | clean 100%, one slide held all the way 100%, 5.9 s (90th pct 6.6 s), 612 m, NOVA 85% | clean 100%, held 100%, 11.2 s (12.0 s), 1,225 m |
| presses SPACE late | clean 94% | clean 100% |
| no drift, plain steering | clean 100% | clean 100% |
| holds arrow + SPACE right through | reaches the inside rail after 1.5 s (the known cost of the slide) | the same |
At easy's speed (38-50 m/s) one turn takes 11.6 s and two take 22.4 s.

Fairness with spirals in, both modes re-run in full on 27d2650 (410 seeds, 5,200 km each): PASS on every seed
- HARD (fast open air): 3,223 groups, 77 million start states, shortest time in sight 1.24 s, narrowest opening
  5.46 m. Judged bot 0 obstacle hits, 0 hard wall hits. Sliding bot (reported) 0 obstacle hits, 769 hard wall
  hits (0.15 per km). Never more than 0.4% over the laid-out speed. Median runs 10.2-10.6 km / 5.3 km.
- EASY: 3,049 groups, of them 1,494 movers, 108 million start states, shortest time in sight 1.68 s, narrowest
  opening 6.35 m. Both bots 0 obstacle hits, 0 hard wall hits, 0 grazes. Median runs 10.9-13.0 km / 4.5-4.6 km.
- Self-test OK in both modes; movers caught on every seed that has any.
- Classic: both fingerprints match.

Frames: stepped through a double spiral, median 1.8 ms and 99th percentile 5.5 ms a frame (unchanged); draw calls
median 338, at most 650 where a double spiral and the next ship are on screen together (51 chunks built).
Real-Chrome frame times through a spiral were not measured: the measuring tab did not report (not in front).

Checked in the browser (stepped frames, chase view): the way in with the banner; the second turn with the first
turn's deck overhead. No console errors.

Not verified: real hands; the cockpit view inside a spiral; easy mode inside a spiral by eye; real-Chrome frame time.

## A darker look: ten concepts to pick from (2026-11-18)
- Adrian wants fewer colours, less debris and a darker mood, like a wave phonk album cover, and asked for ten AI
  images to choose a direction from before anything in the game changes.
- One real frame of the game (hard, SKYWAY, the approach to the first ship, HUD hidden) was restyled ten ways
  by a Gemini image model, with the layout held: same road, racer and ship. All ten drop the asteroids, dust
  and nebula and keep to two or three colours.
- One of the ten (Void) kept leftover objects twice; a second, targeted edit removed them.
- Nothing in the game or the repo's code changed. The images and the prompts are kept outside the repo.

## The dark look, built (2026-11-18)
- Reference image generated first from the real frame and the three concepts Adrian named; three colours of it.
- New: `src/systems/Look.js` (haze pass, grade pass, ten colours, the HUD's colour). Changed: `core/Game.js`
  (composer with a depth texture, the two passes, colour picked per run, indoor exposure), `level/Sky.js`
  (a quiet variant), `level/WorldBuilder.js` (fewer asteroids, thinned by position), `ui/HUD.js` (colours go
  through the look), `index.html` (CSS variables under `body.look`), `tools/verify/README.md`.
- Not touched: anything under `gameplay/`, `level/Track*.js`, `core/Constants.js`, `core/Modes.js`,
  `core/Maps.js`, `systems/Input.js`. `npm run fingerprint`: EASY and HARD both unchanged. `npm run build` passes.
- Checked in the browser (stepped frames, no console errors): the approach to a ship, the mouth, inside a ship,
  open road, a spiral with the deck overhead, the classic map inside and out, the cockpit view, the title and
  game-over screens; all ten colours seen on the same frame. `?look=classic` draws the old
  frame. Forty picks in a row: never the same colour twice running, all ten came up.
- Real Chrome frame times: see findings.md (about 1 fps dearer than the old look, no frame over 20 ms).
- Not verified: his eyes on it in motion; low quality (Q);
  a phone or a slower machine; whether haze ever sits over an obstacle thickly enough to matter (the densest
  roadside bank lets at least half of what is behind it through, by its numbers, not by a test).

## One game: HARD on SKYWAY, and a simpler start screen (2026-11-18)
- Adrian liked the dark look and said to merge it. In the same message: SKYWAY the only map and HARD the only
  mode in the page, both others kept in the code, then straight to `main`.
- Changed: `index.html` (the four picker rows and their styles gone from the title and game-over screens; "TAB
  easy / hard" gone from the key list), `core/GameState.js` (always starts HARD on SKYWAY; a saved pick is not
  read and nothing saves one), `core/Game.js` (no picker listeners, no TAB / E / H switch; `?mode=` and `?map=`
  are test hooks for one page load), `ui/HUD.js` (the one game goes unnamed; a hooked one is named),
  `tools/verify/README.md`.
- Not touched: anything under `gameplay/` or `level/`, `core/Constants.js`, `core/Modes.js`, `core/Maps.js`,
  `systems/Input.js`. `npm run fingerprint`: EASY and HARD both unchanged. `npm run build` passes.
- Checked in the browser (no console errors):
  - with an old pick of EASY and CLASSIC planted in storage, the game still opens as HARD on SKYWAY (manual
    handling, open air at twice ship speed), nothing next to the score, title line reads "BEST ... · BANK ...";
  - TAB, E and H on the title screen change nothing;
  - a run starts, ends, and the game-over screen shows the stats and RUN IT BACK with no pickers;
  - `?mode=easy&map=classic&speed=1.5` plays the classic track with assisted handling and reads
    "CLASSIC · EASY · SPEED x1.5" next to the score; `?map=classic` alone reads "CLASSIC"; a plain reload
    afterwards is HARD on SKYWAY again.
  - at phone width (375 px) the title screen fits with no sideways scroll.
- `npm run verify:skyway:hard` (the one game the page now offers), 200 seeds, 2,400 km: PASS. Flat-out bot 0
  obstacle hits, no-drift bot 0 obstacle hits; shortest time in sight 1.24 s (rule 0.9); narrowest opening 5.46 m
  (rule 5).
- Not verified: his hands on the live site after the deploy.

## A new soundtrack (2026-11-18)
- Adrian gave a beat and asked for a new soundtrack on its chords with a beat of the game's own.
- Measured the beat with plain FFT analysis (no audio library): tempo 136.00 BPM from the onset envelope; chord
  tones and bass notes per beat, then averaged over the eight-bar cycle. Result in findings.md.
- New: `src/systems/Music.js` (the whole track), `tools/audio/render.html` (offline render and levels).
  Changed: `src/systems/Audio.js` (the old track and its bus removed; the scheduler hands steps to Music; a tab
  that wakes far behind picks the beat up from now).
- Not touched: anything under `gameplay/`, `level/`, `core/`. Fingerprints unchanged. Build passes.
- Checked, by measurement:
  - the pad alone, analysed the same way as the beat: D add9 (D E F# A) for beats 1 to 5, F6 (F A C D) for beats
    6 to 8; D7 (D F# A C) and F7 (F A C Eb) in the second half of each eight bars; bass D2 then F1. Same chords,
    same placement as the beat.
  - level: open air RMS -19.8 dB, peak -9.1 dB, no sample at full scale over 32 bars. The old track: RMS -24.3,
    peak -4.1. A-weighted the new one is 5.8 dB over the old in open air, 4.4 dB inside a ship, about level
    with it between runs.
  - tone balance from 250 Hz to 4 kHz is within 3 dB of the beat's, band by band.
- Checked in the browser: a real click starts the audio and the steps advance at 0.11 s each; with the scripted
  driver the track goes drive at the start, station at 830 m (first ship), drive at 1,297 m, idle at game
  over, drive again on restart. No console errors.
- Not verified: how it sounds. Nobody in this session can hear it. Phone or laptop speakers. Firefox and Safari.

## The soundtrack, remade on an exact transcription (2026-11-18)
- Adrian heard the first version: chords not quite the reference's, an 8-bit sound, and he asked for exact chords
  and bass, a simpler darker melody, and heavy laid-back rap drums.
- Transcribed the reference again, this time from exact pitches:
  - every spectral peak in each chord's span, to the cent, in the centre and in the sides of the stereo image.
    The bass sits in the centre; the chord instrument is spread. In the sides the chords are D4 A4 E5, then
    D4 F4 A4 C5, and nothing else.
  - what Phase 24 called F#, C and Eb sit 8 to 31 cents flat of the scale: they are harmonics 5 and 7 of the
    bass notes. No third in the first chord, no sevenths added.
  - the bass, tracked per sixteenth with a harmonic comb: D1 (36.7 Hz) from step 0, F1 (43.7 Hz) from step 20,
    over the whole track, each slide finished by the time the next note lands. In some passages the D stops at
    step 8 and is struck again at 12.
  - the drum hits fall within 10 ms of a grid that starts 0.1 s into the file, which is how everything above was
    placed. The second chord and the F arrive together on step 20. The first chord swells in from about step 2.
- Rewrote `src/systems/Music.js` (see task_plan.md, Phase 25). `tools/audio/render.html`: layer names updated.
- Checked, by the same analysis run on the reference and on a render of the game's track:
  - bass, step by step on the grid, two bars: mine `DDDD DDDD DDDD DDDD DDDd FFFF FFFF FFFF`, the reference
    `DDDD DDDD DDDD DDDD DDDD FFFF FFFF FFFF` (lower case: more than 25 cents off, the start of the slide).
    The chopped variation, read through each track's own kicks: D to step 8, nothing to step 12, D again, F at
    step 20, in both.
  - chords in the sides, notes within 12 dB of the loudest: first chord D4 A4 D5 E5 A5 in both (D5 and A5 are
    overtones of D4 and A4); second chord D4 F4 A4 C5 in mine, D4 F4 A4 in the reference over the same span
    with C5 present at its onset.
  - each bass harmonic and chord note, relative to the passage's own level, was within about 5 dB of the
    reference's range (measured two mix passes before the final one; the chords were made darker after it).
  - level: open air RMS -17.6 dB, peak -3.6 dB; in a ship -17.6 / -3.6; between runs -28.5 / -15.3. No sample
    at full scale in 44 bars. A-weighted, open air is 6.0 dB over the old synthwave track.
  - drums after the master chain: kick -7.2 and -4.8 dB peak, snare -6.2 and -5.9, hats -29. Nothing in the
    music's own path saturates.
- In the browser, with the page muted: the track follows the run (open air, in a ship at 830 m, open air at
  1,297 m, idle at game over); 64 live steps scheduled without an error; no console errors. Build passes. Both
  fingerprints unchanged.
- Not verified: how it sounds. Nobody in this session can hear it. A check by a model that can listen was
  prepared and not run (not permitted in this session).

## The soundtrack rebuilt round a drum loop (2026-11-18)
- Adrian put a drum loop in his downloads and asked for the beat to be remade round it: filtered, with a kick and
  a reese bass added, the same notes, the rhythm and the melody free to fit the loop.
- Measured the loop first: 264,600 samples at 44.1 kHz = 6.000 s = four bars at 160.00 BPM; its hits fall within
  1 ms of the sixteenth grid. Per bar: low hits on steps 0 and 10, snare on 4 and 12, ghosts on 6, 9 and 14.
- Filtering, done once with ffmpeg in floating point (the first two tries clipped inside the filter chain,
  which runs in 16-bit unless told otherwise): two 150 Hz high-passes and an 11 kHz low-pass. Against the
  original: 20 to 60 Hz down 32 dB, 60 to 120 Hz down 16 dB, 120 to 250 Hz down 6 dB, the rest within 1 to 3 dB.
  Peak set to -1 dB from the measured peak; no sample at full scale.
- Changed: `src/systems/Music.js` (160 BPM; the loop played a bar at a time behind a gate; kick; reese bass;
  the bell's rhythm; the old kit kept only as a stand-in), `src/systems/Audio.js` (fetches and decodes the
  loop; silent fallback), `tools/audio/render.html` (loads the loop; `&noloop`; a `kick` layer).
- Checked on renders:
  - notes: the bass reads D on steps 0 to 19 and F on 20 to 31 on the 160 BPM grid; the chords in the stereo
    sides are D4 A4 E5 and D4 F4 A4 C5.
  - the loop's bars join without a click: the jump at each join is 0.3 to 2.1 times the typical jump around it,
    the same range as the original file at its own bar lines.
  - sync: the loop and the kick are both started on the bar line by the same clock; the loop's own hits sit
    on the grid in the file.
  - balance: with the loop in, every band from 20 Hz to 1 kHz is within 2 dB of the reference beat's share,
    and 1 to 8 kHz within 4 dB.
  - level: open air RMS -17.1 dB, peak -3.2 dB; in a ship -17.2 / -3.3; between runs -27.8 / -14.8. No sample
    at full scale in 44 bars. A-weighted, open air is 8.7 dB over the old synthwave track and 2.7 dB over the
    version before this one: the break is bright.
  - drums after the master chain: kick with the loop -6.1 and -5.4 dB peak, the loop's snares -10.2 and -8.9.
  - without the loop file (`&noloop`): the stand-in kit plays, no errors.
- In the browser, muted: the loop loads (6 s, stereo), the track follows the run (open air, in a ship at 834 m,
  open air at 1,301 m, idle at game over), 128 live steps scheduled without an error. Build passes. Both
  fingerprints unchanged.
- Not verified: how it sounds. Whether the loop may be published.

## The loop-based track, grown (2026-11-18)
- Adrian asked for a quieter loop, a wider, deeper reese with more unison, a harder kick with a click and a
  strong low end, a much longer beat with sections dropping in and out, one or two more melodies, and subtle
  transitions.
- Changed: `src/systems/Music.js` only. The arrangement is a table; the reese's oscillators are built once and
  run for the life of the page; three melody voices; two transition sounds.
- Checked on renders, against the version before:
  - reese: it was mono; above 120 Hz its sides are now 6.6 dB under its middle (measured before its low octave
    was raised a little). Its sub band is unchanged; its top (1 to 2 kHz) is 6 dB darker.
  - kick: 5.6 dB more between 35 and 70 Hz, 10.4 dB more between 3 and 10 kHz in its first 12 ms.
  - loop: 3.4 dB lower on its own render (2.5 dB from its own level, the rest from the track's).
  - bass notes on the grid: D on steps 0 to 19, F on 20 to 31, as before.
  - the arrangement, block by block on the full render: sub, low, chord, melody and cymbal bands rise and fall
    where the table says. Intro: no sub, no cymbals. Breakdowns: no kick or reese, no loop. The stretch with no
    bass: sub 4 dB down (the kick alone). No drums: cymbals 20 dB down. Second breakdown: nothing under 150 Hz.
  - the two beats before each of the five drops are 11 to 16 dB under the two beats before them.
  - melody notes in the breakdowns, where they are exposed: only notes of the chord under them.
  - level, whole track: RMS -17.3 dB, peak -2.9 dB, no sample at full scale in 193 s. In a ship -16.3 / -3.7;
    between runs -29.9 / -18.6. A-weighted the track is 3.3 dB quieter than the version before (the loop is
    lower) and 5.4 dB over the old synthwave track.
  - first drop: downbeat -4.8 dB peak, kick on the "and" of 3 -5.9, the loop's snares -9.5 and -10.2.
  - without the loop file: the stand-in kit plays through the same arrangement, no errors.
- In the browser, muted: the loop loads, the track follows the run, and all 2,048 steps of the song were
  scheduled live without an error. Build passes. Both fingerprints unchanged.
- Not verified: how it sounds. A run can now start during a breakdown, with no drums for up to twelve seconds:
  not judged in play.
