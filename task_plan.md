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
Phase 13 (new drift built; waiting on Adrian's hands), branch `hard-mode` from main @ e2e6eb5

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

## Next Step
Adrian plays hard. Likely first notes: how fast the angle deepens while the arrow is held (SLIDE_WIND), how far
it slides out when SPACE goes down (SLIDE_LOOSE, BITE_TIME), the exit tuck (EXIT_PULL). Measure any change with
`npm run feel` first. Still open: test bot's lane scoring (Phase 12). Merge `hard-mode` only when he says.

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
