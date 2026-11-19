# STATION DRIFT: movement + obstacle redesign

Branch `movement-redesign` (baseline `main` @ db2593e). Started 2026-11-16.

## Goal
Rebuild from scratch how the ship plays (model, handling, speed, drift, camera feel, scoring,
pickups, HUD, sounds) and the obstacles (what they are, how they look, placement and sequencing).
Keep the map and scenery exactly as they are (Track centreline/sections, WorldBuilder, Sky, Materials).

Adrian's words: "an easy and fun drifting mechanic based on drifting mechanics from other games
that should feel like a car drifting game." Easy and intuitive, still hard enough not to get boring.
Old version: movement "extremely hard", "cheap and annoying"; obstacles sequenced so they were
"impossible to get through".

Done means:
- Plays in Adrian's Chrome: easy, intuitive, fun, difficulty builds. Both camera views kept.
- No obstacle or obstacle sequence is ever impossible at the speed the game asks for,
  proved by an automated check across many seeds.
- `npm run build` passes, no console errors.

## Current Phase
Phase 26 (the soundtrack rebuilt round a drum loop Adrian chose, on the branch, waiting on his ears; `main` is at Phase 23), branch `claude/new-map-414ab7`

## Phases
### Phase 1: Read the codebase, research drift games, write the design
- Status: complete (design in findings.md)

### Phase 2: Headless core (no three.js): Constants, Track trim, Course, ShipPhysics, Autopilot
- Status: complete

### Phase 3: Verification tooling (tools/verify): reachability proof + sight lines + bot runs, many seeds
- Status: complete (`npm run verify`; `--self-test` proves it catches an unfair course)

### Phase 4: Browser layer: ShipModel, CourseView, CameraRig, Effects, Audio, Input, HUD, Game wiring
- Status: complete

### Phase 5: Browser playtest (stepped frames), tune, `npm run build`, console clean
- Status: complete (stepped frames + synthetic key input + scripted imperfect players; real hands-on feel still needs Adrian)

### Phase 6: Commit, push branch, open in Adrian's Chrome, hand-over note
- Status: complete (branch pushed; merged into `main` on 2026-11-16 at Adrian's request; game opened in Chrome; note in the shared notes folder)

### Phase 7: Hard mode (Adrian's playtest notes, 2026-11-16)
His notes: base speed faster; more obstacles, diverse and often, lasers especially; the drift must turn the ship
enough that it cannot be spammed going straight for boosts, while staying as easy as possible; keep the current
game as EASY, build HARD with these changes; free to change other things in hard.
- 7a Mode system: complete. `src/core/Modes.js` lays HARD over the constants; EASY reproduces the pre-change
  course and bot trace exactly (fingerprint 4c21b329..., scratchpad baseline.mjs). Title and game-over chips,
  TAB / E / H, HUD tag, best per mode, `?mode=`, `verify --mode`, `npm run verify:hard`.
- 7b Hard drift: complete. On a straight the slide hooks to R 58 m after 0.08 s and charges at 15%; in a real
  bend it follows the bend as before; the wall save can flick the ship off the inside wall. Scripted "tap the
  drift down every straight" player: 6.5 boosts/km in easy, 0.1 in hard.
- 7c Hard course: complete. Straights dressed as whole spans; laser gates with 1-3 openings, sweeping lasers
  (whole sweep treated as solid by layout and proof), laser-fenced lanes on straights and through bends.
- 7d Prove it: first full run found bot hits (see errors); fixed; final run in progress.
- 7e Browser check: complete (mode chips, TAB switch, laser gate, sweeper, fenced bend, game over, exploit
  attempt through real key events). Build passes.

### Phase 8: Manual handling for hard (Adrian's second playtest, 2026-11-17)
His notes: turning round bends happens by itself, turn that off completely; make normal steering more
sensitive; holding a steer key stops turning after about a second, remove that; make the drift more slippery:
same sensitivity, but it slides outward more round corners.
- Applied to HARD only (EASY was frozen as "the current version" at his request the day before); one flag,
  `SHIP.MANUAL`, would give it to easy too.
- `ShipPhysics.stepManual`: keys turn the nose at 2.3 rad/s for as long as held, no angle cap, no bend follow,
  no wall guard; travel is pulled to the nose by grip (11 /s), and by a third of that (3.5 /s) while the drift
  button is held, so the nose turns just as fast and the ship slides wide. Charge needs real slip in a real bend.
- The first hard drift (hook to R 58 m, wall save) is removed: superseded.
- Layout and proof re-fitted: sideways ability = a stated share of the turn rate (Pace.lateralAcc / lateralCap).
  Fenced bends only ever shut the inside lane. Verifier's search step now lands exactly on the top sideways speed.
- Status: complete, pending the final verification run and Adrian's hands.

### Phase 9: Retune after Adrian's third playtest (2026-11-17)
His notes: steering now too sensitive, wants the middle between the assisted feel and the first manual one;
the drift still does not slide outward enough.
- TURN_RATE 2.3 -> 1.5 rad/s (assisted was about 0.7), winding up to 2.0 if a key is held past 0.4 s.
- Slide: grip while sliding 3.5 -> 2.4 /s, and the ship cannot travel an arc tighter than SLIDE_RADIUS (60 m)
  while sliding, so in a tighter bend it runs wide for as long as the slide is held. Tail kick of 8 degrees when
  the button goes down with a steer key held; nose capped 54 degrees in from travel (no spin-out).
- Bots brake for bends the turn rate cannot make and only slide where a slide can live.
- Status: complete, pending Adrian's hands and the final verification run.

### Phase 10: Drift exit (Adrian's fourth playtest, 2026-11-17)
His note: the slide is perfect now, but coming out of it he always ends up at too strong an angle and hits the
inside wall, though it did not feel that way during the slide.
- Cause (measured): in the slide the nose is 25-45 degrees inside the direction of travel; on release grip came
  back and pulled the travel round to the nose (26 degrees inward within 0.3 s after a 0.9 s slide).
- Fix: for 0.32 s after letting go the nose swings back to the line of travel (EXIT_RATE) and grip returns as it
  gets there (EXIT_PULL). The ship leaves the slide going the way it was going. Slide itself untouched.
- Test bot: commits to a clear lane when an obstacle is close; judges a crossing with more room; finer look-ahead.
- Status: complete, pending Adrian's hands.

### Phase 11: Slide runs wide of every bend; steering down a bit (Adrian's sixth playtest, 2026-11-17)
(His fifth note, "now it hits the outer wall, find a middle", set EXIT_PULL 1.0 -> 5.0: commit d359d1b.)
His notes: the exit angle feels good now. The drift does not slide out enough: he expects the ship to slide out
round a corner, it does not, he takes the drift too sharp and has an accident. Turn regular steering down a bit.
- Cause (measured, every station bend of 40 seeds, hands only: key + SPACE through the bend, then hands off):
  the slide's arc was one fixed radius, 60 m. Bends tighter than that ran wide; the gentler ones (R 55 m and up,
  a fifth of station bends) were cut inside: 45% of R 55-65 bends and all of R 65-80 ended on the INSIDE wall.
- Fix: the arc is now the bend's own radius x SLIDE_WIDE (1.15), between SLIDE_RADIUS (60, tight bends as
  before) and SLIDE_RADIUS_MAX (90, straights and sweepers). Same test: inside-wall endings 45% -> 0% and
  100% -> 3-17%; width used 25% -> 51% and 0% -> 39%.
- A blanket wider arc (tried 78 m, then 72 m with less slide grip) was rejected: it moved the common R 45-55
  bends from 45% to 84% outer-wall endings in the same test.
- TURN_RATE 1.5 -> 1.35 rad/s (TURN_MAX 2.0 -> 1.85). The nose turns at the same rate in a slide, so this alone
  makes the common bends run a little wider too (R 45-55: outer-wall endings 45% -> 58%, width used 78% -> 86%).
- FAIR_SHARE stays 0.55: the layout assumes the same share of a smaller turn rate, so the proof keeps its margin.
- Exit untouched.
- Status: complete, pending Adrian's hands.

### Phase 12: Drift review and a different system (Adrian's seventh note, 2026-11-17)
His note: the drift feels rigid, should allow sharper turns, feels no sharper than normal turning; stop the
small tweaks, review everything asked for so far, suggest a different system.
- Measured: in the drift the ship turns at 0.50 rad/s whatever the keys do; plain steering reaches 1.85.
- Review and proposal (steerable slide) written to findings.md, last section. Nothing built: his call first.
- Open, separate: test bot leaves an opening for a blocked lane when the gate is in sight but past its
  look-ahead (seed 5147). Root fix: score every lane against every obstacle in sight, not just those the
  look-ahead reaches. Autopilot.js will be open anyway if the drift is rebuilt.
- Status: waiting for Adrian's go on the proposal.

### Phase 13: The slide obeys the keys (Adrian: "Build it", 2026-11-17)
- Built as revised: same keys, same meanings. SPACE: grip lets go, the ship breaks loose about 1.3 m, then bites.
  Arrows set the drift angle (flick to 26 degrees, deeper while held, eases back when let go, other arrow
  swings across). The ship turns at grip x angle with no cap: sharper than steering when deep.
- One departure from what I told him: EXIT_PULL 5.0 -> 3.0 (see progress.md for why).
- Known cost, stronger than I warned: holding the arrow all the way through any bend cuts inside.
- Status: complete, pending the full verification run and Adrian's hands.

### Phase 14: A little less sharp (Adrian's eighth note, 2026-11-17)
His note: much better, almost perfect, a little sharp; regular steering may be too sensitive too.
- Measured the hook 0.3-0.5 s into a held slide; SLIDE_WIND 0.7 -> 0.45 on its own. Steering left alone.
- Status: complete, pending Adrian's hands.

### Phase 15: Hard is the default mode (Adrian, 2026-11-17)
- A new player starts in HARD; a saved pick of EASY is kept. Status: complete.

### Phase 16: Public repo and GitHub Pages (Adrian, 2026-11-18)
- Audit before publishing (all 25 commits, 3 branches): no secrets, no emails in files, no other-project names.
  Commit email is the one already public on his GitHub profile. Details in progress.md.
- Repo made public. `.github/workflows/pages.yml` builds and publishes on every push to `main`.
- Live at https://adrianpartain59.github.io/station-drift/
- Status: complete.

### Phase 17: Second map, SKYWAY (Adrian, 2026-11-18). Branch `claude/new-map-414ab7` from main @ 4acc798
Goal: a second, entirely new map beside the classic one: open air is the main event (64 m wide, nearly always
bending, hills), stations are short ship-like interludes, open-air obstacles are sparse and move. Classic stays
one switch away and provably unchanged. Design: findings.md, "Second map: SKYWAY".
- 17a Guard: `npm run fingerprint` now covers HARD on the classic map too. Status: complete
- 17b Design written to findings.md. Status: complete
- 17c Generator (level/TrackSkyway.js), height, `npm run mapcheck`. Status: complete
- 17d Course: open-air dressing, movers, 3D sight; verifier extended. Status: complete
- 17e World follows height: builder, ship, camera, course view, effects. Open-air deck. Status: complete
- 17f Ship hulls for stations. Frame budget measured. Status: complete
- 17g Map switch (`?map=`, title chip). Status: complete
- 17h `npm run feel` on open-air bends; full verification both maps both modes. Status: complete (numbers in progress.md)
- 17i Browser check both cameras, build, commit, push branch, open in Chrome, hand-over. Status: complete
- Status: complete. Merged into `main` on 2026-11-18 on Adrian's word ("Merge to main"), fast-forward, before he had
  played it: SKYWAY is the default map on the live site from that push. Real hands on the new map still to come.

### Phase 18: Twice the speed, as a test (Adrian, 2026-11-18)
His words: "make the base movement speed a lot faster like twice as fast, I just want to see how that feels".
- `?speed=2` test hook (game) and `--speed 2` (tools). The game's own numbers are unchanged. Measured: progress.md.
- Went to `main` with Phase 19 (the hook works on the live site too).
- Status: complete.

### Phase 19: Fast open air, normal ships (Adrian, 2026-11-18, after playing `?speed=2`)
His words: "the map is already nicely scaled for that speed specifically for the open air parts, but the station
parts are not, make it so when you start approaching the station parts it slows you down back to our previous
speed, and when you're exiting the station it speeds you up".
- SKYWAY in HARD: open air at 2x the ships' speed (`SHIP.AIR_SPEED` in core/Maps.js). The road brakes the ship
  over the run-in to a mouth and launches it over the run-out (`Track.F`, `Pace.airFactor` / `airRamp`,
  `SKYWAY.SLOW` / `LAUNCH`). Amber bars on the deck for the brake field, running chevrons for the launch.
- EASY and the classic map: unchanged, proved (fingerprints; verify output identical).
- Course and proof use the speed of the stretch a thing stands on; the bots are held to the laid-out speed.
- Merged into `main` on 2026-11-18 on Adrian's word ("Merge to main"), fast-forward: live from that push.
- Open: at this speed almost no movers can be placed fairly in open air (one per 16 km). His call.
- Status: complete.

### Phase 20: Downward spirals (Adrian, 2026-11-18)
His words: "is it possible for us to add downward spiral sections where you could keep a drift held for a full
360 degrees, and just in general could we add sections where the track curves under or over itself?" Then:
"Build spirals first".
- `air-spiral` piece in level/TrackSkyway.js: once round (15%: twice), R 82-104 m, a steady 5-8.5% down, at
  most one per stretch of open air. Checked in 3D by the generator (`fits`) and, separately, by `npm run mapcheck`.
- Course dresses it (coins on the inside third, boards all the way round); the feel tool has rows for it; the
  HUD says SPIRAL / HOLD THE SLIDE; the whole spiral stays built while it is near.
- Not built: other crossings (flyovers, figure-8s), upward spirals. They need the heading rule replaced.
- Merged into `main` on 2026-11-18 on Adrian's word ("Merge to main"), fast-forward: live from that push.
- Status: complete.

### Phase 21: A darker look, concepts only (Adrian, 2026-11-18)
His words: "it looks a little too colorful ... reducing the amount of colors so that we only use a specific color
scheme ... reducing debry and clutter so it looks a bit cleaner ... make it feel 'darker' not just visually but in
the vibe of the game, so that it feels like a wavephonk album cover ... generate 10 images with AI ... so I can
pick a vibe that I like, don't actually change the game yet".
- Research in findings.md. Ten AI concepts made from one real frame of the game (a Gemini image model), each a
  strict two or three colour scheme with the clutter gone: 1 Violet Haze, 2 Blood Moon, 3 Cold Chrome, 4 Noir
  Tape, 5 Toxic Night, 6 Midnight Teal, 7 Duotone, 8 Ash and Ember, 9 Void, 10 Sodium Rain.
- The game is not changed. The images are not in the repo (kept outside it, with the prompts).
- Status: complete. He picked (Phase 22).

### Phase 22: The dark look, built (Adrian, 2026-11-18)
His notes on the ten: favourites Toxic Night and Noir Tape, because "they keep the dark duotone feel but you can
still make out details of the track easily"; Duotone (7) lost every detail "because it was strictly black and
pink"; "randomize the color for the duotone when you start the game"; "some sort of haze going through the air
... but it shoudn't make it hard to see the track"; the "ton of haze at the space station" in Violet Haze,
"but also show up in other places or just throughout like a subtle fog"; keep "the planets and asteroids like in
violet haze, but they shouldnt' be too distracting"; make a reference image first and build toward it.
- Reference image made first (the real frame plus the three concepts he named, in green, crimson and noir).
- Built in `src/systems/Look.js`: a haze pass (depth-aware banks round ships, thin banks along the road, a faint
  fog) and a grade pass (brightness onto a ramp of one colour; scanlines, grain, vignette). Ten colours; a new one
  each run. Backdrop turned down, not removed. HUD and menus take the colour through CSS variables.
- `?look=classic` is the old look, untouched. Gameplay code untouched: both fingerprints match.
- Status: complete. He looked and said "merge to main I like the new dark mode design" (2026-11-18).

### Phase 23: One game, a simpler start screen (Adrian, 2026-11-18)
His words: "make skyline the only track type, we can get rid of classic, keep it in the code but don't show it in
the UI, and also make hard mode the only option and get rid of easy mode in the UI, that way our starting screen
can be more simple, push to main immediately after making those changes". ("skyline" read as SKYWAY: it is the
only other map.)
- The title and game-over screens lose the map and mode pickers; the key list loses "TAB easy / hard".
- TAB, E and H no longer switch mode (they did, on the title and game-over screens). No key gained a meaning.
- The game always starts as HARD on SKYWAY. A map or mode saved by an earlier visit is no longer read, so
  nobody is left in a game the page gives no way out of. Bests are kept where they were, per map and mode.
- EASY and CLASSIC are still built and still checked by the tools. `?mode=easy` / `?map=classic` reach them for
  one page load; such a game is named next to the score ("CLASSIC", "EASY") and on the title's best line.
- The "HARD" tag next to the score is gone: with one game there is nothing to tell apart.
- Gameplay code untouched: both fingerprints match.
- Status: complete, merged into `main` with the dark look on his word.

### Phase 24: A new soundtrack (Adrian, 2026-11-18)
His words, with a beat of his attached: "Make a new soundtrack for the game inspired by the chords from this beat,
basically copy the chords but make your own beat that fits the game".
- The beat, measured (not guessed): 136.00 BPM; a two-bar loop in D; D add9 for five beats, then F6 for three (the
  change falls on beat two of the second bar); the bass goes D2 down to F1; some pairs of bars lean on the
  sevenths (D7, then F7).
- Built in `src/systems/Music.js`: those chords and that placement, and around them this game's own drums, bass
  line, cowbell melody, arpeggio and sounds, all synthesized. Three states that follow the run: idle between runs,
  half-time inside a ship, the whole beat in open air. A 32-bar form.
- `tools/audio/render.html` renders the track offline through the game's master chain and reports its levels.
- The beat itself is not in the repo and nothing was sampled from it.
- Status: superseded by Phase 25. He heard it: the chords were not the reference's and it sounded 8-bit.

### Phase 25: The soundtrack, remade (Adrian, 2026-11-18)
His words: "copy the cords exactly, right now it doesn't sound quite like the original chords I can't tell if it's
because some notes are different or because it's inverted"; "more like a typical phonk track instead of a 8 bit
videogame style track"; "The melody on top of the chords should be much more simple and dark sounding and match
the chords very well"; "Make the drums hit hard and make them loud, but not overly aggresive or distored, and do a
laid back rap type beat with heavy drums rather than a edm type beat"; "Make sure the bass also matches the
reference track I sent you exactly"; "Feel free to change the instruments a bit for the bass and chords but make
the actual notes line up exactly".
- He was right about the chords. Phase 24 read them from pitch classes, and three of the "chord tones" were the
  bass's own harmonics. Transcribed again from exact pitches, with the centre and the sides of the stereo image
  taken apart: the chords are D4 A4 E5 (no third) and D4 F4 A4 C5; the bass is D1 sliding up to F1, one octave
  lower than Phase 24 had the D and moving the other way. There is no D7 or F7.
- `src/systems/Music.js` rewritten: those notes and their timing held in one block marked as the transcription;
  a clean heavy kit in half time (snare on three, a little late; swung hats; a roll every eight bars); a four-note
  bell line made only of chord tones; a room reverb; a slow tape drift. Gone: the square-wave cowbell, the
  sixteenth-note arpeggio, the saturation on the whole mix, the kick ducking the chords, the risers.
- Status: built and pushed to the branch, NOT on `main`. Waiting for him to hear it.

### Phase 26: The soundtrack round a drum loop (Adrian, 2026-11-18)
His words: "remake the beat aroudn that drum loop, make sure to filter it so it can fit in with other drum sounds,
but add a kick and bass to it, and this time use a reese bass. Keep the notes for the chords and bass the same
but feel free to adjsut the rhythm to better fit the drum loop. I like the melody but also feel free to tweak it
to fit the drum loop, it could definitely be a little more rhthmic but you have the right idea with the notes".
- The loop he supplied, measured: an amen break, 6.000 s, exactly four bars at 160 BPM, every hit on the grid.
  Kick on 1 and the "and" of 3, snare on 2 and 4, ghost notes between, a ride on the eighths.
- The track moved to the loop's tempo (160 BPM) so the loop plays untouched in time. The notes did not move:
  chords D4 A4 E5 and D4 F4 A4 C5, bass D then F, the change still on step 20 of 32 (the loop's snare).
- The loop is filtered before the game sees it: everything under 150 Hz cut hard, so the added kick and the bass
  own the lows; a little off the very top. In the game its cymbals are turned down a further 4.5 dB.
- Added: a kick under the loop's own two kicks in every bar. A reese bass: a sine at the note, and an octave above
  it two saws 28 cents apart through a low filter that opens on each strike and breathes slowly. The bass is
  struck again with each kick and with the snare the harmony changes on.
- The bell keeps its notes (A E, F D; D E F C the fourth time round) and says each one twice, on the loop's
  accents.
- The loop is the first sound in the game that is a file. It is NOT in the repository: it came from a free loop
  library and whether it can sit in a public repository is Adrian's call. Without the file the track plays a
  plain synthesized kit in its place, so the pushed branch still runs.
- Status: built; the code is pushed to the branch, the loop file is local only. NOT on `main`.

## Next Step
Adrian listens to the loop-based soundtrack (a preview is in his Downloads; the dev server plays it in the game)
and says what to change, and whether the loop file may be published. Until he says yes, `public/audio/break.wav`
stays out of git (it is in this checkout's local ignore list) and nothing merges to `main`: without the file the
live game would play the stand-in kit. The transcribed notes are the block at the top of `src/systems/Music.js`
marked as the transcription. His to steer: the loop's level and top (`breakBus`, the shelf beside it), the kick,
the reese (`bass`), the bell line (`BELL`), `SONG.LEVEL`. Re-render with `tools/audio/render.html`. Test pages
are loaded with `?mute` and closed afterwards; audio for him goes to his Downloads as an .m4a.
Before that, still true: the live game is HARD on SKYWAY with the dark look.
Knobs for the look: the `LOOK` table and the `LOOKS` list in `src/systems/Look.js`.
His calls on SKYWAY, none of them made for him: how many movers (SKYWAY.CALM_EVERY); how tight the ships' corners
are (SKYWAY.SHIP_R / SHIP_A); the clock (PACE_SKYWAY_HARD in core/Maps.js); which end of a ship you fly in by
(`flip` in TrackSkyway.buildShip). Measure any change with `npm run mapcheck`, `npm run feel:skyway` and
`npm run verify:skyway:hard`; `npm run fingerprint` must still pass.
EASY and the CLASSIC map are out of the page but in the code (`?mode=easy`, `?map=classic`): keep them passing
their checks, do not put a picker back without his word.
Still open from before, not touched: the test bot's lane scoring (Phase 12; seeds 5147 and 139); SLIDE_ANGLE
0.45 -> 0.37 if a tap alone still feels sharp. Neither without his word.
THE REPO IS PUBLIC: every push to `main` goes live. Further changes go on a branch and wait for his word before `main`.
Keep secrets, private paths and other projects out of commits and out of these notes.

## Decisions Made
| Decision | Why |
|---|---|
| Speed cut from 66-128 m/s to 38-50 m/s cruise, boosts +12-20% | Map corners are car-scale (R 30-72 m, 15-21 m wide). At the old speed a corner lasted under a second; a drift needs 1-3 s to be felt and steered |
| Drift = hold SPACE: ship follows the bend by itself, steer only shifts your line; release = boost | Mario Kart / OutRun 2 lesson: direction lock, no spin-outs, road-following assist, reward on exit |
| Grip steering is lateral-acceleration limited (gets wider with speed) | Car intuition: too fast for a corner means run wide, so brake or drift. Early corners can be steered, later ones need the drift |
| No hull, no hop. Run ends when the checkpoint clock runs out | Walls and obstacles cost speed and combo, never instant death |
| Banked drifts add clock time; gate par rises past cruise speed; slack carried through a gate capped at 8 s | Measured: speed penalties alone barely move a clock (a player doing nothing kept 87-94% of cruise). Time earned by drifting is what separates skill levels |
| Layout budgets for a ship already sliding sideways at full rate when a row comes into sight | The verifier's exhaustive search found that case; zero-sideways-speed spacing was not enough |
| Set-pieces get depth only inside their own shadow, as one obstacle | Rows 30 m apart fail the strict check (cut-in behind the first), so density comes from depth, not from more rows |
| All obstacles are static footprints (boxes and posts) placed around a designed safe line | Passability is geometric, so it can be proved; no timing obstacles (doors, sweeping lasers, spinners) |
| Gameplay placement moved out of Track.js into src/gameplay/Course.js with its own RNG | Centreline stays a pure function of the seed; map generator untouched |
| Second map beside the first, chosen by `?map=` and a chip; the classic generator is not edited in behaviour | He asked to keep the old map; both fingerprints prove it |
| SKYWAY never turns more than 85 degrees from world forward; ships lie along world forward | One rule that keeps an always-turning endless track from crossing itself; checked over 620 seeds |
| Slope does not change speed | Keeps the handling, the pace and par maths and the proof exactly as settled; hills are for the eye and the line |
| Movers are proved as solid over their whole envelope, and the envelope is painted on the deck | Nothing depends on timing, and the player can see exactly what is out of bounds |
| Open-air obstacles stand on calm sweepers (R >= 400 m), not straights | Keeps the road bending; the proof gives away the turning the sweeper takes |
| Clock pace is per map; nothing else in the rules differs | Long bends bank twice the clock time per km, so the classic pace never ran out |
| Every ship is entered between its engines | Bow-first and against the light a ship read as a gate |
| The track runs at the drum loop's tempo (160 BPM); the loop is never stretched | Adrian asked for the beat to be built round the loop and freed the rhythm; stretching a break to 136 would smear it |
| The drum loop file stays out of the public repository until Adrian says it may go in | It is a third-party loop; publishing it as a file is his decision, and hard to undo in git history |
| Chords and bass are transcribed from exact pitches (peak frequency to the cent, stereo centre and sides apart), never from pitch classes | A bass note's fifth and seventh harmonics read as a major third and a minor seventh; Phase 24 built D add9, D7 and F7 out of them |
| The soundtrack keeps a reference beat's chords, tempo and chord placement and nothing else | Adrian's brief: "copy the chords but make your own beat". Chords are measured from the beat; every sound is synthesized here |
| The track's level is set by measurement against the old track, not by ear | Nobody in the session can hear it. A-weighted, it sits about 6 dB over the old one in open air |
| The game is one map in one mode (HARD on SKYWAY); the others stay in the code behind `?mode=` / `?map=` | Adrian's call, 2026-11-18: a simpler start screen. A saved pick is not read, so no visitor is stuck in a game the page cannot leave |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
| First verifier run: hundreds of 'no way through' with large sideways speed | 1 | Placement used worst position but zero sideways speed. Added worstTime() (kill the slide, then move) and cut top speed (cruise 50, boost +20%) |
| Single hauler in the middle lane of a narrow corridor left 5.0 m openings | 1 | Block a side lane instead when the middle would leave less than FAIR.OPEN |
| Holding SPACE + inside key clipped the inside wall at bend exit (1.4 hard hits/km) | 1 | A slide cannot turn away from its own inside on a straight: guard now looks 0.44 s ahead for the bend ending, hook delayed, wall saves added. Now 0.00/km |
| Shadow rows at 30 m never placed | 1 | Correctly rejected by worstTime (cut-in case). Replaced with deep set-pieces laid as one obstacle |
| In-app browser screenshots stale or from the wrong page | 2 | One navigation per screenshot, `?stopat=<m>` hook, step frames by hand |
| Extra seeds (5001-5080) found 1 failure: a lone bollard 22 m after the corridor narrowed, unreachable for a ship being squeezed inward | 1 | Class, not a one-off: the layout maths treated corridor width as constant. Moves are now counted only from where the walls stop closing (`settledStart`), a narrowing between two rows resets the set, and no set-piece stands where the width changes |
| No-drift bot hit a wreck on seed 351 (1 hit in 1,020 seeds) | 1 | Bot fault, not the course (the search proved a way through): it left an open lane for coins, then dithered. Autopilot now commits to a lane, weighs clearance above coins |
| Hard drift first cut: early-press player hit the inside wall 20 times in 48 km | 1 | Starting a slide while already steering inward leaves no way to turn back. The hard wall save now turns away at full grip |
| First hard verifier run flagged every fenced bend (sight, 'stands in a bend') | 1 | Fence segments curve out of sight by nature; only the cap is a decision. Verifier exempts `fence` from the sight rule; cap moved 5 m clear of the bend |
| zsh aborted a background chain on `rm -f h*.txt` (no matches) | 1 | No globs in rm inside && chains; the verification had simply not run |
| Hard, 600 seeds: search passed everywhere but both bots hit the same laser on 6 seeds | 1 | (a) Bots judged an obstacle seen by its box centre, which for a wall-anchored beam is inside the wall: now its end nearest the middle. (b) A gate's only opening lay outside a station's exit mouth: hard placement now also waits for a widening to finish. (c) Bot lanes stopped at the current wall: now span the widest the corridor gets within its look-ahead |
| Scratchpad wiped overnight: fingerprint and player scripts gone | 1 | Fingerprint rebuilt inside the repo (tools/verify/fingerprint.mjs, `npm run fingerprint`) and validated against the recorded hash |
| Manual hard, seed 13: search said "no way through" by a small margin | 1 | Search artefact: its sideways speed was floored to a whole number of lattice steps (11.1 of 14.8 m/s). Time step now chosen so the cap is an exact multiple |
| SKYWAY: classic HARD verification broke after the verifier learned sweepers (45 false failures) | 1 | Hard's fenced bends run the search through a real bend; the sweeper correction now counts calm road only, and classic output is identical again |
| SKYWAY: the drifting bot's clock never ran out | 1 | Long bends bank twice the time per km. Par pace set per map and tuned against classic run lengths |
| SKYWAY: self-test passed movers through (3 of 152 caught at a 45 m shove) | 1 | Not a hole in the check: movers have more room in hand than rows. Movers are shoved 130 m and must be caught on every seed |
| SKYWAY: 110-170 ms frames while stepping in the hidden pane, unchanged by a shader warm-up | 3 | Not real: GPU pipeline builds with no idle time between stepped frames. Real Chrome: worst frame 32 ms. Measured with the new `?perf` hook |
| SKYWAY: ships' corners collapsed to 35 degrees and plain steering cleared 98% | 1 | The lateral budget was spent on the straight between the two corners of a pair. Pairs are linked closely now and the budget is wider |
