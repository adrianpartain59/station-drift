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
All phases complete and merged into `main`. Hands-on playtest by Adrian still to come.

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

## Next Step
Adrian plays it at http://127.0.0.1:5190/ and says what feels off; tune from Constants.js, then `npm run verify`.

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
