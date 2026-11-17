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
