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

# Second map: SKYWAY (2026-11-18)

Adrian's brief: a new map where the open-air parts are the focus, much wider, nearly always bending (kart-track
style) so slides are wide and long; stations become short interludes that need controlled slides; the track rises
and falls on smooth curves, combined with the bends; open-air obstacles are sparse and move; stations read as
ships you fly through. The background (sky, palettes) stays. The old map stays switchable.

## What the code does today (read at main @ 4acc798)
- `Track.H` is HEADING, not height. There is no height anywhere: every surface, the ship, the camera, coins,
  gates, obstacles, skid marks and sparks sit on y = 0. Height is new for all of them.
- `Track.K` is piecewise constant. A bend "counts" (arms a held drift, flips an S, pays the apex bonus) when
  |k| >= DRIFT.ARM_K = 1/125. In HARD, charge needs slip >= 0.08 rad the same way as a bend of |k| >= 1/250,
  otherwise it earns 15% (CHARGE_STRAIGHT). A slide carries a bend of radius R at speed v with slip = (v/R)/2.4.
- The classic map never turns more than 0.95 rad from world forward; that is the only thing keeping it from
  crossing itself.
- All fairness maths (Course.judge, the verifier's search) assumes obstacles stand on a dead straight.
- Windows work by a trick worth keeping: the hull is drawn single-sided, so from inside you look straight
  through it at the sky.

## Design
Two maps, `src/core/Maps.js`: `classic` (Track.js, untouched in behaviour) and `skyway` (level/TrackSkyway.js,
default on this branch). `?map=`, a title chip, saved pick. No new key.

Dimensions
- Open air: 64 m between the soft rails (half-width 32; classic 30 m). Sections 1,250-1,900 m.
- Stations: same corridor as classic (15-21 m, hall 26 m), 400-620 m. Open air is about three quarters of the distance.

Bends in open air (all piecewise-constant k, all |k| >= 1/118 so every one arms and charges)
- sweeper: R 84-118 m, 55-115 degrees          - hairpin: R 66-84 m, 140-170 degrees
- esses: 2-4 linked arcs, R 72-110 m, 45-85 degrees each, 8-14 m neutral between
- calm sweeper: R 420-640 m (or straight), 210-290 m: the only place a mover may stand
- at cruise the centreline asks 0.32-0.76 rad/s (easy) and 0.39-0.91 rad/s (hard); the inside line up to ~1.5.
  A hard slide gives 1.1 rad/s at the flick angle and 2.28 at full angle, so every line across the road can be held.
Bends in stations: R 44-60 m easing to 30-42 m with distance, 29-57 degrees, always in left-right pairs.

Not running into itself
- Heading never leaves +-85 degrees from world forward, so the track never travels backward. Reversing sideways
  direction means turning through forward on an arc of R >= 66 m, which puts anti-parallel legs >= 131 m apart
  centre to centre (64 m of road).
- Stations lie along world forward: approach, hull and run-out are a straight line, the path inside swings at
  most +-46 m off the axis, and the hull is built from the path's real extents.
- No over/under passes. `npm run mapcheck` asserts no two stretches come within road + hull clearance, over many seeds.

Height
- Grade cap 13%. Crest radius >= 700 m, sag radius >= 420 m. Grade is a cosine blend between knots at piece
  boundaries, so slope and vertical curvature are both continuous (curvature is zero at every knot).
- Knots are chosen with a magnitude of 5-13%, so bends are climbed, descended or crested, not flat.
- Calm sweepers never crest (movers must stay in sight). Stations are level; the approach and run-out are level.
- Slope does not change speed. The ship follows the surface; pace, par and the proof are unchanged by height.
  The proof does account for crests hiding things (sight is checked in 3D).

Obstacles in open air: sparse, moving, proved as solid over their whole sweep
- orbit (rocks circling a beacon), patrol (drones sweeping across a marked band), beacon (rotating beams),
  shuttle (a hauler running up and down a marked lane). One group per calm sweeper, at most two late in a run.
- Layout and proof treat the mover's envelope (a disc or a box painted on the deck) as solid. The verifier also
  samples every mover's real motion and asserts it never leaves its envelope.
- On a calm sweeper the proof gives away the turning the sweeper itself needs: usable sideways acceleration is
  share x ability - v^2/R at the inside rail, and time is counted at the inside rail's faster closing speed.
- Stations keep the static rows, through the existing code paths.

Stations as ships
- One rigid hull per station, lofted along the axis: prow prongs either side of a lit hangar mouth, tapered
  bow, mid-body, bridge tower, fins, engine nacelles with glowing bells at the stern exit, name on the flanks.
  Interior: bulkhead frames, the existing ribs / windows / skylights.
- One or two draw calls per ship instead of per-chunk hull strips.

## SKYWAY: what building it confirmed (2026-11-18)
- A map that is nearly always turning stays clear of itself with one rule: heading within +-85 degrees of world
  forward. 620 seeds: the nearest two different stretches ever come is 58 m between footprints.
- Bend length is capped by two things at once: the heading rule caps the angle, and DRIFT.ARM_K (R <= 125 m)
  caps the radius if the bend is to charge. That puts the median open-air bend at 128 m: 2.3 s at hard cruise,
  2.8 s at easy cruise; hairpins about 205 m.
- Long bends bank far more clock time than the classic map's (twice as much per km for the drifting bot), so
  the clock never ran out. The par pace is therefore set per map (core/Maps.js), nothing else is.
- Movers placed by the layout's own bar sit with far more room in hand than the proof asks for (the layout
  assumes half to two thirds of the ship's ability, the proof three quarters to nine tenths, and on a sweeper
  the turning it takes comes off both). A 45 m shove therefore does not make them unfair; the self-test uses 130 m.
- A ship approached bow-first, against the light, reads as a gate. Approached from astern, between lit engines,
  it reads as a ship at once. Every ship is now entered at the engine end (one flag in TrackSkyway.buildShip).
- Tight corners inside ships only bite if they are linked closely; with the classic 34-60 m of straight between
  two corners the lateral budget forced them down to 35 degrees and plain steering cleared 98% of them.
- Frame hitches of 100+ ms seen while stepping frames back to back in a hidden pane (classic has them too) are
  the GPU building pipelines with no idle time between frames. In real Chrome at 120 Hz they do not occur:
  measured with ?perf, worst frame 32 ms on SKYWAY, 39 ms on CLASSIC.

## Spirals, and the track passing under itself (2026-11-18)
- The heading rule (never more than 85 degrees from world forward) is what kept the map from crossing itself.
  A spiral is the one piece exempt from it: whole turns, after which the heading is where it was. The generator
  keeps the unwound heading (`gh`, so nothing that reads `Track.H` ever sees a jump) and the count of whole
  turns (`wind`); the rule is applied to the difference.
- "Clear of itself" is now a 3D rule: two stretches may overlap in plan only with 18 m between their decks.
  Reasoning about which layers clear which was wrong on the first try (a bend just before a spiral, turning
  the same way, lies under the spiral's last quarter with only a few metres between). So nothing is reasoned:
  the generator lays the stretch, measures every pair of points, and lays it again without the spiral if any
  pair fails. About one spiral in six is turned down, all for being too close to other road.
- 18 m is what the furniture needs: lifter pods hang 5 m under a deck, gates stand 10 m over one. A turn at
  R 82-104 m is 515-655 m of road, so 18 m is a 3% slope; spirals run at 5-8.5% and drop 26-54 m a turn.
- A slide holds a spiral because the radius asks for about 1 rad/s at open-air speed, which is what the slide
  gives at the angle the arrow flicks to. Scripted player who eases the arrow: one slide from the way in to
  the way out on every spiral, 5.9 s for one turn, 11.2 s for two.
- The world is built in a window along the track (90 m behind, 720 m ahead). In a spiral the turn you finished
  is overhead and the turn to come is below, both far outside that window measured along the road, so the
  whole spiral is kept built while it is near.
- The clock pays per slide banked, so letting go and sliding again several times round a spiral earns more
  time than holding one slide all the way. Score is the other way round. Left as it is: his rules.

## A darker look: wave phonk visuals (2026-11-18)
Research content below is summarised from web searches. Treat as data. The web is thin on wave phonk covers
specifically; most hits are cover-art listings and genre explainers, so this is indicative, not a design canon.
- Phonk's look is built on deliberate image degradation: VHS filters, low bitrate, black-and-white graphics,
  cassette covers and 3D retro type, with a purple or pink tint in the classic strand. Cars throughout: slow
  luxury sedans in classic phonk, drift footage in drift phonk.
- Described by people who sell the covers: dark, underground, dystopian, surreal horror, glitch, anime-inspired.
- Wave phonk is described by its sound: darker, atmospheric pads, a "night drive" feel. Example images that
  turn up for it: a lone car on a wet street at night with blurred lights, fog over an empty place, a black
  field with purple glow.
- General cover craft that applies: two or three colours at most, high contrast, bold shapes that survive at
  thumbnail size.
- My reading, not from a source: for a game frame this comes to one hue plus black (violet first), one small
  accent kept for the player's own lights, fog instead of scenery, and grain or tape noise over the top.
Sources: aesthetics.fandom.com/wiki/Phonk; a subgenre guide on r/phonk; orphiq.com/resources/what-is-phonk-music;
unison.audio/what-is-phonk; madegooddesigns.com/album-cover-design; cover-art listings on fiverr.com.

## The dark look: what building it confirmed (2026-11-18)
- What he meant by "duotone" is one colour with every shade of it, not two flat inks. His two favourites keep the
  lane lines, the kerb and the barrier panels readable; the flat two-ink concept lost all of them. So the look is
  a brightness-to-ramp map (black, a deep shade, the colour, bright, nearly white), applied to the finished
  frame. It needs no change to any material, which is why `?look=classic` can still be the old game exactly.
- Brightness is taken mostly from the strongest colour channel, not from luminance alone: by luminance a pure
  blue or red light is dark, and the road's edge lights would have sunk.
- The colours come from one hue angle each at fixed lightness steps (OKLCH), pulled in until a screen can show
  them, so no colour comes out muddier or brighter than another.
- The haze is not sprites and not the engine's fog. It is one full-screen pass that reads the depth buffer: each
  bank is a soft ball, and the amount of haze a ray crosses in it has an exact formula, so there is no stepping
  and no banding. It starts no nearer than 26 m from the camera and a ship's banks thin from 230 m before its
  mouth, so the way in and the corridor are clear. The engine's fog could not be used for a visible haze:
  see-through additive things (the rails, glows) would each add the fog's colour over their whole rectangle.
- Known limit of doing it after the frame is drawn: see-through things that write no depth (rails, sparks,
  speed streaks) take the haze of whatever is behind them, so a rail in front of a far bank dims with it.
- Inside a ship every surface carries neon, and in one colour it all went to a single bright wash. Indoors the
  exposure drops to 58% and the bloom to 70%; the soft fill light is halved everywhere.
- The backdrop is turned down by numbers, not deleted: stars 22%, nebula 16%, asteroids 45%, dust 6%, planets to
  dark discs with a thin rim, the sun to a tenth. The reflections still use the full sky, so the lighting on the
  metal is what it was.
- Real Chrome, 20 s, same seed, 2419x1323 at 120 Hz: old look 119.2 fps (99th percentile 10.3 ms, worst 13 ms);
  new look 118.2 fps (99th percentile 12.1 ms, worst 17 ms). No frame over 20 ms in either.

## The soundtrack: what the reference beat is, and what building on it confirmed (2026-11-18)
- The beat: 136.00 BPM (onset envelope against a pulse; 135.99 and 136.01 both score lower). 119 bars. Tuned 3
  cents flat of A440.
- Its harmony is a two-bar loop in D: D add9 (D, A, E, F#; bass D2 with D1 under it) for five beats, then F6
  (F, A, C, D; bass F1) for three. The change is on beat two of the second bar, not on the bar line. In some
  bars C replaces E over the D (D7) and Eb appears over the F (F7). The last bar of eight walks the bass up
  through F#.
- Its sound: sub-heavy (20 to 60 Hz is its loudest band), eighth-note hats, a busy low end.
- What the new track keeps: those chords, the tempo, where the change falls, and the bass dropping from D2 to
  F1. What it does not keep: any sound, the drum pattern, the bass rhythm or a melody.
- Rendering Web Audio offline: scheduling every voice of a 58 s track before `startRendering()` left thousands
  of idle nodes in the graph and the render did not finish in a minute. Feeding the steps a second ahead from
  `ctx.suspend(t)` callbacks, as the live game does from a timer, renders the same 58 s in a few seconds.
- Peaks said the first mix matched the old track (-4 dB both). RMS said it was 13 dB louder: the old track is a
  loud kick over a quiet body, the new one has a sustained bass. Level was set from RMS and A-weighted RMS.
- The in-app browser pane cannot be used to hear anything; a render posted to a local receiver and analysed with
  the same script as the reference is how the chords were checked.

## The soundtrack: the first transcription was wrong, and why (2026-11-18)
- Pitch classes cannot tell a chord tone from a bass harmonic. The reference's bass is a harmonically rich D1.
  Its 3rd harmonic is an A, its 5th an F# (14 cents flat of the scale), its 7th a C (31 cents flat). Folded into
  twelve pitch classes they looked like a major third and a minor seventh in the chord, and the F1's 7th
  harmonic looked like an Eb. The chord instrument plays none of them.
- What separates them: the frequency of each peak to the cent (a harmonic sits where the series puts it, a
  played note sits on the scale), and the stereo image (the bass is centred, so L minus R removes it and its
  harmonics, about 20 dB down, and leaves the chord instrument).
- The reference, as now measured: 136.00 BPM; the music starts 0.1 s into the file. Chords D4 A4 E5 and
  D4 F4 A4 C5, the second arriving on step 20 of 32 and ringing two steps past the bar line. Bass D1 then F1,
  joined by slides. Its own drums: kick on steps 0, 14, 20, 30; snare on 8; a hat on every eighth.
- The chord instrument has little above 1 kHz: its second harmonic is about 10 dB under the fundamental. Two
  low-pass filters in a row at about 900 Hz were needed on detuned saws to get near it.
- A bass note at 36.7 Hz is carried by its harmonics on any small speaker. The reference's D1 fundamental is 12 dB
  under its F1 fundamental, so something in its chain rolls off under about 40 Hz; the game's bass does the same
  with a high-pass at 42 Hz.
- Peak level is a poor guide to how hard a drum hits: the snare measured 3.4 dB over the kick while the kick
  carried far more energy. Both were set from per-hit peaks after the master chain.

## The soundtrack with a drum loop: what it needed (2026-11-18)
- ffmpeg runs audio filters in the input's sample format. A 16-bit file through two high-pass filters clipped
  inside the chain (469 samples at full scale) even with the output turned down afterwards: a high-pass makes a
  drum loop peakier, here 1.93 times full scale. Putting `aformat=sample_fmts=fltp` first, measuring the true
  peak, then setting the gain, fixed it.
- A bar at 160 BPM is 1.5 s: a whole number of samples at 44.1 kHz (66,150) and at 48 kHz (72,000). Playing the
  loop one bar at a time therefore joins cleanly at either rate, and lets the loop run all the time behind a
  gate, so a run that starts mid-bar hears the break at once and in time.
- Chrome's compressor node delays everything by about 6 ms. It showed up as every onset in a render sitting
  6.4 ms after the grid; it is the same for every voice, so nothing is out of step.
- The loop cut under 150 Hz has a crest factor near 18 dB: very peaky. Its snares measure 4 dB under the added
  kick while it already carries most of the track's energy above 2 kHz. Loop level trades snare weight against
  cymbal brightness; a shelf on its top is the other knob.

## The soundtrack as an arrangement (2026-11-18)
- A reese needs oscillators that keep running. Starting fresh oscillators on every strike puts all of them in
  phase each time, so the slow beating that gives the sound its movement never gets going. Here the eight
  oscillators are built once; a strike moves their pitch, opens two gates and kicks the filter.
- Width and weight are separate jobs: the wide saws are high-passed at 90 Hz and panned; everything under that
  (the sine and two centred saws at the note) is mono.
- Two events on one audio parameter at the same instant take effect in the order they were scheduled. A note's
  closing gate and the next note's opening gate land together, and the opening wins: legato with no extra code.
- With the song as a table of blocks, checking the arrangement is a table too: energy per block in five bands
  (sub, low, chords, melody, cymbals) shows every drop, cut and breakdown at a glance.
- Rendering 193 s offline took about 80 s of wall time here; the browser tool's 45 s limit on one script call
  means waiting for it in two calls.

## Why the music was buried, and what loudness needed (2026-11-18)
- Measured alone, the music looked fine (RMS -17 dB, peaks near -3 dB). In the game it was buried because the
  jets and the slide hiss are broadband noise between 1 and 8 kHz, which the ear weighs heavily, while the track's
  energy sat under 250 Hz. Compare A-weighted levels, music and effects rendered through the same chain.
- A track that peaks at the ceiling can only get louder by lowering its crest factor. The kick set the peak; a
  soft saturation curve on the whole mix took the crest from about 13 dB to 8.7 dB, which is where most of the 6 dB came from.
- Chrome's compressor node adds make-up gain on its own (about 6 dB at the game's settings), so levels into it
  cannot be predicted by arithmetic; every level here was set from a render.
- Building the game's real audio object on an offline context needs one trick: hand it the offline context in
  place of `window.AudioContext` for the length of its constructor, then stop its scheduling timer.
- AAC encoding overshoots: a file whose peak was -1 dB before encoding read 0.0 dB after. Leave 2 dB.

## Lighting: what building it confirmed (2026-11-18)
- The chase camera sits about 13 m behind the ship and 2 m up, with a wide field of view at speed. From there
  the whole road ahead of the nose, from 5 m to 80 m, is about 7% of the screen's height. Headlights can only
  show as a fan of lit road in that strip and on whatever stands up in it; the big area of road on screen is
  behind the ship. So the beam is wide (about 33 degrees to its edge) and strong, and it fades by 110 m.
- A real spotlight is the wrong tool for it. The beam meets the road at a grazing angle, so the road gets
  almost nothing, while anything facing the ship (a hull, a wall, the ship's own nose) gets all of it. No
  setting lit the road without burning those out.
- The haze pass already rebuilds every pixel's place in the world from depth. Lighting from there costs a few
  sums per pixel in a pass that runs anyway, lands on road, walls and obstacles alike, and can be told to light
  only what was dark (so neon is left alone) and to stop at a ceiling.
- A light that is added in proportion to the surface's own colour does nothing on a black road. Most of the
  headlight is light added outright (`lift`); the proportional part (`gain`) only brings out detail.
- Looking down a beam from behind, a shaft of light in haze is a disc, not a beam. It either cannot be seen or
  it sits as glare over the road ahead. Taken out.
- A point light next to near-mirror glass (roughness 0.04) shows as a ball of glare in the pane, bloomed. At
  roughness 0.7 it is a faint sheen.
- Frame times can only be compared from runs where the browser was in front for the whole run. One run with
  another app in front read slower with the lights off than with them on.

## Tuning by hand: what measuring his changes showed (2026-11-18)
- A set of hand-made changes can be sorted by taking each one back out of the finished set and measuring how far
  the held picture moves. It separates the changes that carry the look from the ones that do nothing, without
  anyone having to remember why each slider was moved.
- Sliders that seemed independent were not. The headlights' added light was written as a multiple of the haze's
  brightness, so the haze slider was also a headlight slider. Any light the pass adds should be in its own
  units.
- Light added in proportion to a surface's own colour (`gain`) does nothing on a road that is black: raising it
  from 8 to 20 could not be measured.
- Whole-frame brightness is a poor way to compare indoors with outdoors, because half of an outdoor frame is
  sky. On the lower half of the frame (the road) the two are within 10% of each other.

## Surfaces: what building the grain confirmed (2026-11-18)
- One shared texture can serve every surface if it is laid by position (object space, in metres) along the axis
  the surface faces most, instead of by each model's texture coordinates. The join between two axes cannot be
  seen in a texture that is noise.
- The renderer's own bump mapping makes the pixel's footprint a unit length, so its relief gets weaker as the
  camera comes close. Leaving the footprint in metres gives the relief a real height that holds at any distance.
- Uneven shine has to average out to no change, or it brightens the picture: rough-and-polished patches reflect
  more on the whole than an even surface of the same average only when the average itself has moved.
- three.js: a material's `onBeforeCompile` runs when a shader is built for it, not when the material goes back
  to a shader it already had; the uniforms it is drawn with are the ones from the latest build. A test that
  flips a patch off and on again must force a new build each time (a new cache key), or it measures a shader
  with stale uniforms.
