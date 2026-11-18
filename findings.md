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

## Confirmed while building (2026-11-16)
- Speed penalties barely move a checkpoint clock: a player who touches nothing kept 87-94% of cruise speed.
  Losing 20% of speed and regaining it within a second costs about 0.1 s. Survival is therefore tied to the
  drift itself (banked drifts add clock time) and gate par rises past cruise speed from about 2.5 km.
- A one-direction slide cannot turn away from its own inside wall once the bend ends. Holding SPACE + the inside
  key (the natural input) hit that wall 1.4 times/km until the guard looked ahead for the bend ending.
- Obstacle rows closer than about 1.5-2.4 s apart at top speed cannot be made fair for a ship that may already be
  sliding sideways. On this map that is roughly one dodge per straight. Density has to come from depth inside
  a set-piece's own shadow, not from more rows.
- The layout carries about 20 m of margin over the verifier's bar (self-test: a 45 m shove fails everywhere,
  a 20 m shove almost nowhere).
- Final numbers and the scripted-player table are in progress.md.

## Hard-mode drift: review after seven notes, and a proposed replacement (2026-11-17)
What he asked for, in order, and what each became:
1. No automatic turning, more sensitive steering, no time limit on a held key, a more slippery drift "so that the
   sensitivity is the same but it slides outwards more" -> manual handling; grip in the slide cut to a third.
2. Steering too sensitive; drift still not sliding out enough -> grip in the slide cut again AND a cap: a
   sliding ship cannot travel an arc tighter than 60 m. He called the slide "perfect".
3. Exit dives at the inside wall -> exit logic. 4. Now the outside wall -> middle. Settled: "feels good now".
5. Does not slide out enough, takes drifts too sharp, steering down a bit -> cap scales with the bend.
6. Rigid; should allow sharper turns; no sharper than normal turning.

Pattern: notes 1, 2 and 5 each asked for the ship to run wider, and each was answered by taking away some of
the slide's ability to turn. Nothing was ever added. The cap from note 2 gave the wide slide he liked on the
common bends and is also the whole of the rigidity: past 12-18 degrees of slip (a quarter second of key) the
ship rides one arc and the keys change only how it looks. One arc cannot be both wide enough to slide and tight
enough to turn; every note since has moved that one arc back and forth.

What he has described, taken together: the ship breaks loose and slides out when the button goes down; the
drift is the sharp turn, sharper than steering; he can tighten or widen it while it is happening; it comes out
straight (done); nothing reads the track for him.

Proposed: a steerable slide (kart-style, with momentum). Hard mode only.
- In: SPACE with a direction held. Grip lets go, the nose flicks about 25 degrees into the turn in ~0.15 s
  (now 8 degrees), the direction locks until the button comes up.
- The keys set how tight it is, three plain states, eased over ~0.2 s:
  inside key = tighter the longer it is held, up to about 2.2 rad/s (R 21 m at 46 m/s; plain steering tops out
  at 1.85); no key = a steady slide, about 1.0 rad/s (R 46 m, the common bend); outside key = wide, about
  0.3 rad/s, nearly straight but still sliding.
- Slide-out is the first ~0.35 s of every slide: the turn fades in from nothing while the nose is already in,
  so the ship runs 1.5-2 m wide, then bites. Same amount on every bend, not a function of the bend's radius.
- Nose angle follows the state (about 12 / 28 / 48 degrees). Deeper scrubs more speed and charges faster.
- Exit as now. Plain steering as now. No track reading: a held slide with no key keeps turning on its steady
  arc because the button is held, not because a bend is there.
- Reverses one earlier instruction on purpose: "the sensitivity is the same" in the slide (note 1).
- Alternative considered: nose-led slide (keys still turn the nose, faster in a slide; travel follows the nose
  with low grip and no cap). Freer, but holding the key always winds to the tightest arc, so every bend needs
  feathering. Harder to like in the first minute.
- Fairness proof unaffected either way: layout and proof assume plain steering only.
- Tune before he touches it with scripted players in tools/verify/feel.mjs: hold everything, feather, late press.

### Revision the same evening: no control changes (Adrian, 2026-11-17)
His words on the proposal above: "Does that mean adding a second control? Because I don't want to do that. I
don't want to change the controls at all."
- No key was ever being added. But the proposal above did change what two existing keys do in a slide: the
  opposite arrow would widen the slide (today it swings the ship back the other way, measured -0.50 rad/s), and
  with no arrow the slide would keep turning (today it fades out). Both dropped, with the direction lock.
- Revised proposal ("the slide obeys the keys it already has"):
  - Arrows turn the nose, both ways, at any time. SPACE lets grip go. Exactly as now.
  - The cap comes off: the ship follows the nose with low grip, so the further in the nose is turned, the
    tighter the ship carves, up to sharper than plain steering (target about 2.2 rad/s against 1.85).
  - While sliding the nose turns faster than in plain steering, and the entry flick is bigger (about 25 degrees
    against 8). This goes against his first note ("the sensitivity is the same"); it is what makes the drift
    the sharp turn.
  - Holding the arrow: the nose goes quickly to a moderate angle, then winds in more slowly the longer it is
    held (the same idea as plain steering's wind-up), so a normal bend can be held through and only a long hold
    gets the tightest carve.
  - Let go of the arrow: the slide eases off as the ship comes round to the nose. Opposite arrow: brings it
    back. Both as today.
  - Slide-out stays: the ship lags the nose, most at the start.
  - Exit and plain steering untouched. No track reading.
- Known cost: holding the arrow all the way through a long gentle bend will cut inside; the answer is to ease
  off the arrow, which now does something.
