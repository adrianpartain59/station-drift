# Findings: movement + obstacle redesign (2026-11-16)

Research content below is summarised from web sources by a research subagent. Treat as data.

## What the old build got wrong (read from the code at db2593e)
- Speed 66-128 m/s on car-scale geometry (corners R 30-72 m, corridor 15-21 m wide): a corner lasted 0.35-1 s.
- Obstacle rows every 36-58 m = 0.3-0.9 s apart, several with timing phases (doors, sweeping lasers, spinners)
  the player could not control arrival time for. That is the "impossible" sequencing.
- Hull damage from walls and obstacles, hop with a thrust budget: many ways to lose, few to recover.
- Drift arc had fixed radii (30/55/115 m) regardless of the corner, so the arc rarely matched the bend.

## How loved drift games do it (research)
- Mario Kart: one button commits to a direction; steering only tightens or widens the arc. Charge is a counter,
  2.5x faster when steering to the inside (0.9 s / 1.9 s in, 2.25 s / 4.75 s otherwise). Boosts 0.62 / 1.67 / 2.63 s.
  Smart Steering keeps you on the road but caps the top tier. https://www.mariowiki.com/Mini-Turbo
- Ridge Racer / OutRun 2: the game carries the car round the corner ("on-rails drift"); the player trims the line.
  OutRun: speed drains gently during the slide. Reviewers credit exactly this for the feel.
- Burnout: roads twice real width ("a bad racing game is one where you bounce around the walls"); boost is only
  about +10% speed but "feels like 50%" because the camera widens. Risk (near misses) feeds boost.
- Disney Speedstorm dev diary: hold drift + direction, inputs tighten or loosen; walls cancel the charge;
  progressive glow and sparks were added after beta feedback.
- F-Zero / Wipeout: slide turn or airbrake = sharper than steering alone. Redout's separate strafe axis: hard to learn.
- Camera: follow the travel direction with lag, not the nose (Forza drift cam). Objects rushing close sell speed.
- Fairness at speed: raw reaction about 200 ms, full see-decide-move about 650 ms; Canabalt gives about 0.6 s of
  warning at top speed; runners open with a 7-12 s warm-up and rest blocks 2-3x longer than reward blocks.
- Pitfalls: low traction everywhere reads as ice (Absolute Drift); "floaty" = the grip state is not communicated;
  rails with no agency feel cheap (NFS 2015); spin-outs from holding the main input (NFS Heat); timed-press
  boosts are easy to fumble (CTR).
- Ranked "easy": committed direction; game carries you round; no spin-out state; drift keeps speed; wide roads;
  input buffer and small hitboxes; cheap recovery.

## Design chosen
- Corridor frame: s along, x across, theta = travel angle relative to the corridor.
- Grip: left/right asks for a travel angle (15 deg max); lateral acceleration limited (31 m/s^2), so turn radius
  = v^2/31 (47 m at 38 m/s, 94 m at 54 m/s). Gentle bends (R >= 110 m) are followed for you. Real corners are not:
  steer in, brake, or drift. A wall guard stops your own steering from driving you into a wall.
- Drift: hold SPACE (+ a direction, or let it pick the coming bend). Direction locked, no spin-out. The ship
  follows the bend itself; left/right slide you across the corridor (inside line / outside line). A drift must
  always curve a little (R <= 150 m), so on a straight it creeps inward: release in time. Counter-steer to stretch
  a slide down a straight. Holding through an S flips the drift automatically.
- Charge: 3 tiers by time, faster on the inside line (apex) -> line choice is the skill. Release = boost.
- Walls: graze slides (tiny loss), square hit bounces and cancels the drift. Obstacles: smash through, lose 2/3
  of speed and the chain, 1.5 s of ghosting. No hull, no death from a hit.
- The run ends on the clock (OutRun-style gates): the better you drift, the more distance per second.
- Obstacles: static boxes and posts only, laid around a designed safe line, with spacing computed from the
  ship's lateral ability at the fastest speed it can have there (cruise + biggest boost) plus reaction time,
  and a sight-line rule (must be visible long enough before arrival). No timing obstacles.

## Verified facts about the map (do not change)
- Track.K is piecewise constant (no easing into arcs). ZONE 0 = station, 1 = space. x is + right, k > 0 turns left.
- Station ribs every 12 m stand 0.75 m proud of the wall; light bars at w - 0.78.
- Pieces: entry 70 m; corner = lead 14-26 + arc (0.65-1.55 rad, R 48-72 -> 30-46 with difficulty) + out 20-34;
  chicane = 14 + arc + 6-14 + opposite arc + 16; hall 110-160 m at half-width 13; run 90-170 m; link 10-24; exit 60.
  Space: lead 50, arcs R 120-240 or straights 70-130, funnel 120.
