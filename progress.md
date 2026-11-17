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
