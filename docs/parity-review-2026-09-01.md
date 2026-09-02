# Parity review against x264, 2026-09-01

Fresh, unbiased pass over the whole project. Every number below that is not marked as a record from the tree was measured this session on a worktree at `cf0ca18` (main after PRs #94 and #95), built and installed under a private prefix so no owner install was touched. Raw logs: the session scratchpad, `q/`, `q2.log` through `q5.log`, `band.log`, `speed.log`, `rc/`.

Goals as of this review: **G1 open** (pure C, 1 thread: 1.05x on the 09-01 board against a 1.00x bar, 0.95x on 08-27, spread ~0.10), **G2 met** (0.93x), **G3 open** (as-shipped SIMD auto-threads: 0.99x on the legacy six, 0.98x on ten HD clips this session, max 1.09x; the worst-clip leg passes, the median leg is inside the day-to-day spread). All three fail the 0.5 dVMAF leg at rate-matched ABR on the 09-01 board (-0.93 / -0.59 / -0.59), which nobody has said out loud. **Quality has no goal with legs at all**, and that turns out to be the story.

## 1. The scoreboard

Speed parity and quality parity separated, per resolution, per rate-control mode. Each cell names its harness and band.

### 1a. Quality: BD-rate VMAF-NEG vs x264 medium (negative = we need fewer bits)

Harness: `scripts/bdcompare.py --vmaf --no-cache --subsample 1`, 150-frame windows, `--threads 1` both sides, x264 `0.164.3108` from PATH (the quality reference every gate uses), ours `--preset medium --cabac --transform-8x8`. CRF band: fixed points per class (CIF 26-44, 720p 26-38 or 22-34 for the high-rate pair, 1080p 30-42 or 24-36 for riverbed/crowd_run), spanning VMAF-NEG roughly 35-95. ABR band: `--bitrate` at x264's achieved rates from those same CRF points, so both modes cover the same rate range on the same clip.

| class | n | CRF median | ahead | ABR median | ahead |
|---|--:|--:|--:|--:|--:|
| CIF | 7 | **-5.7%** | 5/7 | -0.4% | 4/6 |
| 720p | 13 | **-14.0%** | 11/13 | **+11.6%** | 2/13 |
| 1080p | 9 | **+0.2%** | 4/9 | **+7.9%** | 2/9 |

Per clip (CRF / ABR): foreman -5.7/-2.0 · bus +5.9(sat)/+8.7 · stefan +1.3/0.0 · akiyo -15.7/n.a. · mobile -0.8/+2.2 · coastguard -21.1/-7.5 · tempete -8.3/-0.9 · ducks -5.8/+3.7 · park_joy +0.2/+9.8 · samsung -5.0/**+40.6** · shields -14.0/+23.9 · in_to_tree -24.4/-8.6 · parkrun -1.2/+11.6 · old_town -14.9/+0.5 · stockholm -20.9/+14.8 · fourpeople -17.2/-25.7 · sintel -26.5/**+67.6** · sita +12.4/+35.7 · bbb_720p -18.6(sat)/+15.2 · perseverance_720p -3.3/+7.7 · blue_sky +17.6(sat)/+27.1 · station2 -9.3/+7.9 · sunflower -6.2/+13.1 · pedestrian +0.2/+11.2 · riverbed +3.4(sat)/-8.4 · crowd_run +0.4/-3.8 · perseverance_1080p -12.2/+4.2 · bbb10s_1080p +8.3/**+57.7** · touchdown_420 -7.5/+4.6. "(sat)" = bdcompare's near-saturation flag; read those as direction only.

The CRF column reproduces the 08-31 record (720p -13.9% 6/6, 1080p +0.4% 3/6) on the fixed encoder, with six more clips. The ABR column is new: **nobody had measured ABR quality against x264 as a curve at any resolution**. It is robust to the window and to threads: samsung reads +40.6 at 150 frames, +49.2 at 300, +37.0 at 12 threads; shields +23.9 / +36.0 / +15.8; station2 +7.9 / +23.1 / +8.8; sunflower +13.1 / +15.2 / +14.9; in_to_tree stays ahead at -8.6 / -5.1 / -9.3. It also shows on the in-process speed harness at 6-second windows (section 1b: rate-matched ABR dVMAF median -2.4, stockholm -6.9, blue_sky -5.0).

**The ABR tax, each encoder against its own CRF at the same bits** (BD-rate of the ABR curve against the CRF curve, same clip, same window):

| class | ours | x264 |
|---|--:|--:|
| CIF median | +11.5% | +3.5% |
| 720p median | **+33.3%** | +4.4% |
| 1080p median | **+18.4%** | +3.8% |

x264's ABR is its CRF plus a slow rate-factor correction, so it costs it 3-4%. Ours costs 11-33%, and up to 154% on sintel, 109% on stockholm, 53% on samsung. That single table explains why the 720p lead in CRF becomes a 720p deficit in ABR: the compression engine is ahead, the ABR allocator throws it away.

**Mechanism, traced** (`Y264_RC_TRACE=1`, samsung at 448 kbit/s and stockholm at 511 kbit/s, 150 and 300 frames, versus our own CRF at the same total size and x264 ABR at the same target):

- our CRF: base QP flat at 34 for every frame, coded I/P/B 31/34/36, per-type QP standard deviation 0-0.9;
- our ABR, same bits: I frame coded at **QP 47** (10 kB where CRF spends 33 kB and x264's ABR 15 kB), P frames QP 29-51 with standard deviation **4.7**, B frames 28-51 with 4.5, the sequence oscillating 47, 51, 50, 48, 44, 43, 40, 38, 34, 35, 40, 46 over the first twelve frames; B frames take 38% of the bits where CRF gives them 17% and x264 21%;
- stockholm pins at QP 51 for its first ~20 frames (VMAF-NEG in the 30s there), then hunts; over 300 frames the 30-frame QP means run 47.9, 44.6, 43.4, 39.8, 40.6, 41.3, 40.9, 43.5, 46.1 while x264 descends monotonically 49.6 to 42.3 and holds;
- `Y264_ABR_RF=1` (the gated-off x264-style rate-factor model) halves the samsung damage (-20.3% vs our default, still +10.2% behind x264) and fixes sintel (-53.9%, -29.5% vs x264) but overshoots stockholm's target by **67%** (536 kB for a 320 kB budget) and loses on in_to_tree (+13.7%) and foreman (+10.2%).

So the ABR deficit is a controller problem, not a compression problem: a noisy per-frame QP loop with a starved first I frame and a windup at start. The shortest credible path is not to tune it but to make ABR what x264's is, the CRF path with a slowly adapted rate factor, and gate it on rate accuracy per clip (the `rf` arm's own gate record already names sintel-900 +48% → +12% as the accuracy history; stockholm +67% here says the accuracy half is not done).

**Standing band gate** (`scripts/run_band.py`, ladders.json, VMAF-NEG 88-94 band, 120 frames; only the ten clips it can still run, see section 6): CRF: foreman +0.0, bus +5.7 (sat), stefan +2.2, akiyo -9.3, mobile +1.1, ducks -4.6, park_joy -1.9, samsung -6.0, sintel -20.7, touchdown -40.3 (a clip the tree declares unquotable). ABR: foreman +3.3, bus +10.4, stefan +6.2, akiyo +7.7, mobile +1.9, ducks -5.2, park_joy -0.2, samsung +21.4, sintel -14.1, touchdown -19.8. At the published band the CIF CRF median is **+1.1% behind**, and every CIF ABR cell is behind. The "-0.85% corpus median" and "-2.76% ahead" headlines are wide-band, CIF-weighted numbers; at the band the site quotes, CIF is not ahead.

**Direct mode at 1080p** (all nine 1080p clips plus seven 720p, this session, fixed encoder, 150 frames, t1, BD against our own spatial default; x264's own temporal-vs-spatial swing measured beside it as the control):

| clip | x264 temporal vs its spatial | ours temporal vs our spatial | ours `Y264_DIRECT_AUTO` vs our spatial |
|---|--:|--:|--:|
| station2 | -11.8 | **-32.7** | **-30.9** |
| blue_sky | -4.5 | -18.2 (sat) | -14.6 (sat) |
| sunflower | +16.8 | **+35.8** | +2.8 |
| pedestrian | +4.6 | +7.9 | -0.6 |
| crowd_run | +0.3 | +2.7 | -0.1 |
| riverbed | -0.1 (sat) | +2.3 (sat) | +0.1 (sat) |
| perseverance_1080p | +3.8 | +5.4 | -0.6 |
| bbb10s_1080p | +1.4 | +0.3 | -2.0 |
| touchdown_420 | +1.9 | +6.1 | -1.8 |
| in_to_tree | -7.3 | -9.3 | -8.4 |
| old_town | -3.0 | -4.9 | -3.2 |
| stockholm | -3.7 | -3.8 | -6.4 |
| park_joy | +2.0 | +4.1 | +0.3 |
| samsung | +3.3 | +5.0 | -0.6 |
| sita | -0.8 | -3.8 | -4.7 |
| sintel | +4.5 | -1.4 | (not run) |

Two facts. x264 has the same content sensitivity (sunflower +16.8, station2 -11.8), so the swing is partly the content; **ours is about twice x264's on every 1080p clip**, which says each of our two direct derivations is weaker than x264's on the content that favours the other. And x264's per-slice auto rule, already built here as `Y264_DIRECT_AUTO`, is never worse than +2.8 on sixteen clips and takes the two big wins. It is refused above one thread because the running score is coding-order dependent across GOP workers. Applying it to the CRF column moves the 1080p median only from +0.2% to about -0.3%, but the worst clip goes from +17.6 to +6.4 and station2 to about -40.

### 1b. Speed: wall ratio vs x264 (above 1.00x = we are slower)

| cell | harness / clips | CRF | rate-matched ABR | notes |
|---|---|--:|--:|---|
| G1 pure C, 1 thread | ffboard.py, legacy six (3 CIF + 3×720p), 6 s, median of 3 | 0.95x (08-27) / **1.05x** (09-01) | 1.09x (09-01) | record; spread ~0.10 on the same build |
| G2 pure C, auto threads | same | 0.85x (08-27) / 0.93x (09-01) | 1.26x | record |
| G3 SIMD, auto threads | same | 0.96x / 1.01x / 0.99x (08-27/31/09-01), max 1.14x | 1.40x, max 1.48x | record; dVMAF at matched bits -0.59 |
| **G3 SIMD, 12 threads, HD** | **ffboard.py, this session, 6 × 1080p + 4 × 720p, 1.2-22 Mbit/s, 6 s, median of 3** | **0.98x, max 1.09x**, dVMAF +0.60, dsize 0.0 | **1.13x, max 1.29x**, dVMAF **-2.38** | our CPU work is **1.35x** x264's (11.5 vs 8.3 cores) |
| SIMD, 12 threads, HD | CLI board (perf-comp), 08-31 record, 10 HD clips | 1.12x, max 1.22x | not measured | CLI board reads ~0.1-0.2 worse than ffboard on the same question |
| SIMD, 1 thread, HD | CLI board, 08-31 record | 1.30x, max 1.55x | not measured | held to one thread we are 1.1-1.5x slower at every HD clip below 3 Mbit/s |
| any board, 1080p ABR, 1 thread | nobody | — | — | unmeasured; the streaming operating point on a small box |

Per clip, HD t12 CRF this session: blue_sky 1.06, station2 1.06, sunflower 1.09, pedestrian 0.99, riverbed 0.72, crowd_run 0.75, shields 1.03, stockholm 0.93, in_to_tree 0.83, samsung 0.97. Rate orders this table, not resolution: the two fastest cells are 1080p at 12 and 22 Mbit/s, the slowest are 1080p at 1.5 Mbit/s. "Noticeably slower at 1080p" (README) is a rate reading wearing a resolution label, and it is not true at all on the in-process harness at twelve threads.

What the speed board actually says about the shipped tier: wall parity bought with 35% more CPU. Held to one thread (G1's tier or the CLI board at t1), the per-core deficit is 1.2-1.5x. No published goal figure has ever included a 1080p clip, because `scripts/ffboard.py` still hardcodes the six legacy clips that `scripts/parity-clips.sh` replaced on 08-31.

## 2. The real gaps, ranked and sized

1. **ABR allocation** (quality, every resolution, the streaming mode). Size: 720p goes from -14% ahead in CRF to +12% behind in ABR, a 25-point swing; ABR tax 11/33/18% against our own CRF where x264 pays 3-4%. Evidence: section 1a, 29 clips, three windows, two thread counts, two harnesses. Mechanism traced to the controller (QP noise, starved I frame, startup windup). This is the largest gap in the project and it is absent from the brief, the task list, the work queue, the site and every goal.
2. **Direct-mode variance at 1080p** (quality). Size: worst clip +17.6 → +6.4, two clips -15 and -31, median barely moves. Evidence: section 1a's table, sixteen clips, x264 control. The lever exists (`Y264_DIRECT_AUTO`) and is blocked on thread safety of a per-slice running score, an engineering item with a known shape (x264 solves the same order dependence across frame threads by lagging the score).
3. **Per-core CPU deficit on the SIMD tier** (speed, low-rate HD and CIF). Size: work ratio 1.35x at t12 on HD; 1.2-1.5x wall at one thread; 1.12x median on the ten-clip CLI board. Evidence: section 1b. The unmeasured item that decides whether this is closable was named on 08-20 and never run: split our uncovered C time (1733 ms vs x264's 755 on the coverage profile) into vectorisable pixel work versus control flow. Until that split exists, every SIMD-coverage plan is a guess.
4. **Hand-drawn animation and CGI at 1080p** (quality, content class). Size: sita +12.4% CRF, bbb10s_1080p +8.3% CRF (its 720p cut is -18.6%), and both are far worse in ABR (+35.7, +57.7). Evidence: section 1a. The work queue had sita as the owner's #1 item on 08-26; the brief dropped it.
5. **ABR wall at auto threads** (speed). Size: 1.13x vs 0.98x CRF on HD, 1.40x vs 0.99x on the legacy six. Evidence: section 1b, board 09-01. Cause is known (width refuses to launch under a zero-lag decide). `Y264_RCP_LAG=1` buys 46% of it and was measured this session on ABR curves at 12 threads (section 3, item 1): it costs +9 to +206% BD at QPD 0 and is still mixed at QPD 6. This gap is a consequence of gap 1: a controller that needs actuals from the previous frame cannot tolerate lag; a rate-factor controller tolerates it by construction. Fix 1, then this reopens with a different answer.
6. **Deep-band and G1 claims resting on a CIF-weighted corpus.** Not a gap in the encoder, a gap in the evidence: the deep-band "9 of 10" counts a clip declared unquotable and is 7/10 CIF; the "-0.85% corpus median" is CIF-weighted; at the published 88-94 band CIF CRF reads +1.1% behind (section 1a). Size of the correction: the public quality claim should be "720p ahead in CRF, CIF at parity, 1080p at parity, ABR behind everywhere".

Sizes marked as guesses: none above; every number is in a log. What is a guess is the cost to close each: gap 1 is a rate-control rewrite (weeks, gated on accuracy); gap 2 is a thread-safe score (days); gap 3 is unpriced until the split is run (one session to price); gap 4 is unpriced.

## 3. The six-item task list, judged

1. **`Y264_RCP_LAG=1` accuracy half.** Ran it: ABR BD at `--threads 12` (where the lag engages, verified with `Y264_STAIR_STAT`: 68 recycles served vs 0), same targets as section 1a, 13 clips. QPD 0: foreman +9.2, akiyo +10.9, bus +0.1, coastguard +28.6, samsung +15.0, park_joy +44.7, ducks +23.1, sintel **+206**, stockholm +5.9, touchdown +22.5, station2 +7.6, crowd_run +3.9, sunflower +9.3. QPD 6: +8.2, **+21.9**, -2.3, +5.5, -10.2, +0.8, -0.9, no overlap, -11.6, +4.2, -3.4, +3.9, +2.9. Rate accuracy alone: park_joy at 8000 kbit/s overshoots 15% at QPD 0. **Closed as a flip.** It reproduces what `docs/rc-parallel-design.md` recorded on the pre-fix encoder. Mis-ranked at #1: it is a symptom of gap 1.
2. **1080p quality reopened.** Right question, answered: the 1080p median is at parity in CRF (+0.2%), the tail is direct mode on two clips plus CGI on one, and the lever is the per-slice auto rule. Re-rank as gap 2, and stop quoting "1080p deficit" as a mean.
3. **Eventual-skip, ME side.** Survives as a t1 item (6.0% B + 5.3% P of t1 wall) but the tree's own rule is that t1 does not predict t12; price it at t12 before building. Below gaps 1-3.
4. **Re-measure the `Y264_DIRECT_SCORE` tables.** Dead. The selector those tables fed is closed negative, and the per-slice rule in this review's table already delivers what a predictor would; there is no decision left that a re-measured SCORE table would change.
5. **The unattributed 54% of ABR pool-idle.** Dead as stated: it attributes the idle of a controller that gap 1 replaces. Re-measure after the controller changes.
6. **Base-path leads** (aq by content, `--ref 1` on crowd_run). Screens inside the band noise (the tree's own 08-31/09-01 records read them at +1 to -4 on different bands). Hold.

Missing from the list and belonging above all six: the ABR allocator (gap 1); repairing the gates that no longer run (section 6); the integration-test matrix the owner requested on 08-22 and the queue carried; sita.

## 4. Structural questions nobody here has asked

1. **Why does yah264 have an ABR controller at all, rather than a CRF with feedback?** The lookahead, mb-tree and AQ are shared; the only thing ABR adds in x264 is a rate factor that drifts slowly with `cplxr_sum / wanted_bits`. Our default ABR is a separate per-frame QP loop, and its output at matched bits is 11-33% worse than our own CRF. Merging the two modes would carry the CRF lead into the streaming mode, make ABR width-tolerant (gap 5) and delete a whole family of ABR-only knobs. The `rf` arm is a half-step in this direction and its remaining defect is rate accuracy, which is the one thing a feedback loop is for.
2. **Why is our spatial-versus-temporal direct swing twice x264's on every 1080p clip?** Both modes exist in both encoders; ours loses more on each mode's bad content. That says the derivations themselves, not the choice between them, carry a per-mode deficit worth up to 15-20 points on specific content. Nobody has compared our spatial-direct MV field against x264's on station2, or our temporal on sunflower.
3. **Is x264 pinned?** The quality gate calls `x264` from PATH (0.164 r3108, built October 2023); the speed board links libx264.165 built from `../x264` at r3223, a tree that carries an uncommitted measurement patch. No doc records either version. Two references, unpinned, in a project whose entire claim is a ratio against one of them.
4. **Why does the quality goal have no legs?** Speed has four metrics to two decimals, a pinned operating point, a worst-clip leg and an owner rule against moving the bar. Quality has "BD ≤ 0, corpus-wide", in an archived July plan that is not in the live tree, over a CIF-weighted corpus, CRF only. Every gap in section 2 that is not speed was invisible to the gate by construction: ABR is never gated ("BANDS=crf runs only the band the standing rule gates on"), 1080p has one unquotable clip in the ladders, content class is not a reporting axis. The fix is a quality bar with the same shape as the speed bar: per resolution, per mode, median and worst clip.
5. **Why do the timed boards write bitstreams inside the timed region?** `docs/instruments.md` says all timed runs write to `/dev/null` and warns that a timed write once fabricated a resolution-shaped finding. Both `perf-comp.sh` and `ffboard.py` write the bitstream they time. On this box the HD cells reproduced within their spread, but the instrument contradicts its own catalog.

## 5. Owner-gated items, with their numbers (no decisions taken)

- **`Y264_DIRECT_AUTO`** (x264's per-slice rule): sixteen clips, never worse than +2.8%, station2 -30.9, blue_sky -14.6, stockholm -6.4, sita -4.7. Threads-1 only today. The decision is whether to fund the thread-safe form; not a flip.
- **`--direct temporal` as default**: no. sunflower +35.8, pedestrian +7.9, touchdown +6.1.
- **`Y264_ABR_RF=1`**: on this session's ABR curves vs our default: samsung -20.3, sintel -53.9, sunflower -5.7, stockholm -5.1, bbb10s -3.5, station2 -0.4, shields -1.8, foreman +10.2, in_to_tree +13.7; vs x264 still +6 to +46 on six of ten. Rate overshoot on stockholm 300 frames: +67%. Not a flip; the direction of gap 1's fix.
- **`Y264_RCP_LAG`**: closed by the numbers in section 3 item 1.
- **`Y264_RC_PIPE_VBV`**: nothing to decide. It has been default ON (`src/encoder/encoder.c:1548`); the brief, `docs/rc-parallel-design.md` and memory say it is gated off.
- **Promoting the twelve HD clips**: section 1a is the re-medianed picture on 29 clips. Promotion changes the CRF headline from "CIF -0.85%" to "720p -14 / 1080p +0.2" and makes the ABR deficit visible.
- **`scripts/ffboard.py` clip set**: still the legacy six; the ten-clip set would move G3's CRF median from 0.99x to about 0.98x on ffboard (this session's HD read) and the CLI board reads 1.12x. Fix after the goals are re-established, per the standing rule.
- **CI**: manual only; every doc that says "per commit" is wrong (section 7).
- **Attribution**: the harness asks for a Co-Authored-By trailer; memory says the owner forbids it; twelve commits on 08-26/27 carry it, none since. This review committed nothing.

## 6. Instruments that do not do what the docs say

- `scripts/run_band.py` crashes on its default invocation (`KeyError: 'coastguard_cif'`): `ladders.json` gained coastguard and tempete on 08-27 (`47f94c5`), `scripts/curves.json` was never committed, and the pasted fallback curve covers ten clips. The standing quality gate has not run as documented since 08-27 without a `CLIPS=` override.
- `scripts/ffboard.py`: default `FF` points at an ffmpeg with neither encoder; `CLIPS` is the legacy six; it measures whatever is installed at `Y264LIB`, and `/tmp/y264inst` was a day behind HEAD. Timed encodes write bitstreams.
- `scripts/perf-comp.sh`: usage text names the unfair `x264-noasm` as the default pure-C reference; the code uses `x264-noasm-autovec`. Scores plain VMAF while ffboard scores NEG, so the two boards' dVMAF columns are different metrics.
- `docs/instruments.md`: names `curves.json` (absent), `Y264_LED` (a compile-time flag, not an env knob), "254/254" conformance (the gate now computes 303 fast / 573 full), a census of 262 knobs (298), an `nm -gU` recipe that returns 0 on the dylib (hidden symbols; 67 NEON kernels in the static lib, not ~53; x264 412, not 198).
- `tests/corpus/CLASSES` lists 9 of 35 clips, none of the HD ones, so `bdcompare --class` cannot select any HD class.
- `tests/corpus` is a symlink into `../yah264old`; a fresh clone has no corpus.

## 7. Doc claims that turned out to be wrong

Grouped by file, so the corrections can land. Verified by five parallel auditors plus this session; the three already in the brief are not repeated.

**CLAUDE.md** · "199 knobs" (311 getenv readers; four different counts across the tree) · "100+ result docs" (46 in docs/, 33 in local/records) · the three cited authorities never existed in this repo (they live in `../yah264old/docs`); `docs/archive/` does not exist here and 13 scripts plus `docs/knobs.md:5` cite it.

**README.md** · "we lead with pure C" (G1 reads 1.05x on the newest board) · "noticeably slower at 1080p, mainly SIMD losing to hand asm" (no goal figure has ever contained a 1080p clip; the axis is rate; this session reads 0.98x at HD t12; `hygiene_check.sh:56` and `CONTRIBUTING.md:56` say our intrinsics tie hand asm 3.68 vs 3.66 ns) · "with with".

**CONTRIBUTING.md** · :72 hand-written asm NASM/GAS (zero `.S`/`.asm` in tree; the hygiene gate fails on any) · :81 "every encode in CI decoded" (CI is `workflow_dispatch` only).

**docs/STATUS.md** · whole document is the pure-C-floor era; :90 cross-thread byte identity (only with `Y264_STQ=0`; abandoned as a goal) · :96 249/468 conformance (dynamic count; 227/249/254/476/518/602 all appear in the tree) · :87 "4.4-5x on 8 threads" unverifiable · :111 `YAH264_NO_ASM` is presence-based (`=0` forces scalar).

**docs/plan.md** · :12 VMAF v1 primary gate (tools hardcode `vmaf_v0.6.1neg`) · :231 three-decoder conformance (ffmpeg only) · :232-234 per-commit determinism, checkasm, continuous fuzzing (CI manual, no fuzz harness) · :35 corpus by hash (19 of 23 rows have none) · phases 5-8 carry no status.

**docs/story.md** · :34 "7-23% behind x264" vs `docs/advantages.md:5` "-2.76% ahead", opposite signs, neither dated · :9/:52/:186 CI runs the gate (manual) · :87-92 wavefront "in progress", bit-exact at any thread count (shipped; goal abandoned) · :162 aq-strength 0.3 (code 0.4; four values across the tree) · :95 TPL as the fix (mb-tree gap closed).

**docs/advantages.md** · :5 -2.76% over a 7-clip corpus, undated, no harness; at the published band CIF reads +1.1% · :22 468/468 · :15-18 per-kernel ns and op-ledger numbers unverifiable in tree.

**docs/rate-control.md** · :394/:168 `Y264_CRF_CPLX` "off, not shipped" (default ON, `encoder.c:391`); :395 `CRF_FPS` "so off" (on) · :127-161 the "CRF 1.3-3.5 VMAF below x264" and equal-CRF spread tables are pre-flip · :220 "clean on all 36 cells" (gate reads 34/36).

**docs/rc-parallel-design.md** · :146/:158/:227/:1019 `Y264_RC_PIPE_VBV` default OFF, gated off (ON) · :649/:874 `Y264_ABR_EARLY` default 0 (2, shipped) · :537 `STAIR_WIDE_REF` off (on) · :788 `MT_POOL_MIN` 8 (2, `encoder.h:68`; the engagement grid and the `8*ceil(frames/keyint)` rule rest on it; same stale 8 in `encoder.c:826,:1453,:3434,:3468`) · :860-895 four gate scripts exist only in the old tree · :214/:857/:882 three conformance totals in one file.

**docs/rc-mode-matrix.md** · :293 says the source comments claim PIPE_VBV off (they say ON now) · :63/:74/:189 ducks ABR error +11.7/+8.4/+14.8 for the same cell · :239 -23.0 vs table -23.2.

**docs/b-8x8.md** · :8 "default OFF" (B_8X8=1, `macroblock.c:5725`) · :197 "two knobs inert" (B8_RATE=1, B8_QGATE=10) · the knee table stops at 6, the ship is 10.

**docs/b-direct-mode.md** · :499-511 coherence narrative unmarked though retracted at :667 · :518-548 SCORE tables void, unannotated · :454 pedestrian/riverbed/crowd_run rows still pre-fix · :468 vs :556 1080p median +0.70/-3.86 vs -5.5/-8.6.

**docs/fable-b-path-brief.md** · :68-79 "temporal legal on 11-24% of B frames" and the -6.39% blue_sky are the frame-wide-gate artefact, no update note · :151 riverbed/crowd_run "3-4% behind without B" contradicted by b-direct-mode.md:836 (+1.0/-2.2) · blue_sky quoted +14.17/+14.24/+14.40 and the 1080p median +0.43/+0.70 across docs.

**docs/fable-parity-review-brief.md** (this review's own brief) · :157 `Y264_RC_PIPE_VBV` "gated off" (ON) · :129-131 "parity-clips.sh still describes the old corpus" (four HD clips promoted on 08-31, `b9cbb1c`) · the handoff-state paragraph was correct; the prompt that launched this review was not (main is `cf0ca18`, #94/#95 merged).

**docs/shot-based-plan.md** · :38-40 two-pass "3.7-34.4 VMAF worse" (sign inverted; retracted in rc-mode-matrix.md:216) · :42-47 CRF complexity term "dropped" (ships) · :48 capped VBR underflows 5/6 (34/36 now) · :189 six-clip corpus (ten).

**docs/adaptive-me-design.md** · :127 partition early-term "reverted" (`Y264_PART_EARLYTERM` ships at mode 4) · :90-98 `Y264_ME_GATE` never existed.

**docs/rate-aware-lookahead-design.md** · :534-539 five knobs with defaults that have no reader (`LR_QP`, `LR_RATE`, `LR_RATE_BADAPT`, `RC_LACOST`, `RC_LEGACY`), `Y264_TPL` likewise; "deleted" knobs still exist.

**docs/animation-content.md / animation-plan.md** · bbb "in CLIPS_CALIB" (it is in REVIEW_CLIPS at 4000) · sita post-flip +7.76 vs +5.89 · "both animation clips are CGI" (sita exists, arm C done).

**docs/content-adaptivity-plan.md** · :153/:156 `Y264_B_TAIL33`, `Y264_FAST_INTRA_GATE` never existed.

**docs/ml-track-synthesis.md** · :25-42 M0 "nobody has run that A/B" (answered 08-27, wash, `Y264_LR_IPEN`).

**docs/m4-selector-method.md** · :74/:77 line numbers point at unrelated code.

**docs/options.md** · "no `--trellis`" (exists 0..2, default 1) · psy-rd default 1.0 (2.0) · `Y264_CRF_CPLX` off (on) · "param.threads does nothing in the library" (threads=8 gives a wavefront of 8) · aq 1.0/0.3 (0.4) · `--abr-model`'s second value is `rf` · :742-750 stale section.

**docs/knobs.md** · 13 knobs invisible to its generator (`MBT_PLAY`, three `NTP_SPIN_*`, five `ABR_*`, four `CRF_*` through wrappers); `--check` passes anyway; 27 line numbers off by +20; `TP_CORR`, `TP_DBG`, `SKIP_ORACLE_AT` defaults scraped from the wrong line; :5 dangling.

**docs/threading-wavefront-design.md** · :125 cap formula is not the shipped one (`frame_thread_cap_k`: CIF 12, 720p 21, 1080p 32) · :299 `src/threadpool/` (it is `src/common/threadpool`) · :296 `ntp_pool_open` (`ntp_pool_create`) · :293 `Y264_WAVEFRONT` gone · :326 "verified" wins with no citation.

**docs/threading-ownership-plan.md** · 14 API symbols (16) · 476/476 · S0c medians stale. **docs/sync-lookahead-design.md** :144 249/249.

**docs/board-2026-08-28.md** · "four 1080p rows" (perseverance_720p is 720p) · "1.44x here" is one of four rows · CRF 25 (25.34) · bbb15s is in no harness list · "pure-C t1 0.91-1.04 on these same clips" (neither clip is in that table; range is 0.78-1.04).

**docs/board-2026-09-01.md** · no MAX column, so the worst-clip leg is unreported for nine cells. Otherwise arithmetic verified.

**docs/openh264-comparison.md** :7 goal figures 0.96/0.91/1.06 stale. **docs/ffmpeg-integration-plan.md** :37-48 "what is missing" all shipped; :157 1.06x stale; goals quoted at 12 threads here and auto (16) elsewhere. **docs/chroma-format-plan.md** :65 4:2:2 serial-only (GOP-parallel since 08-13). **docs/high-bit-depth-plan.md** :22 "CLI dispatches" (same soname, runtime check). **docs/gpu-acceleration-plan.md** names `src/encoder/lookahead.c`, `src/dsp/scale.c` (absent); "not started" (gpu.c exists, route recorded closed in instruments.md). **docs/gpu-shared-library-design.md** :7 "no code ships" (it does). **docs/corpus-sources.md** :14 `fetch_train_corpus.sh` (old tree only) · :18 sixteen clips (35) · :19 six speed clips (ten). **docs/ideas.md** :79 `scripts/op-ledger-x264.patch` (absent and forbidden by CONTRIBUTING:52). **docs/innovations.md** §9 per-shot classification "low risk" (closed negative); §4-5 ML items (M4 closed negative). **docs/research.md** :101 recommends bit-identical threading (reversed). **docs/parity-workflow-methodology.md** :57 "≥5 points" vs the tool's 4. **docs/satd-decide-design.md** :151 2.65x baseline undated. **bench/README.md** untracked; libvmaf 3.0.0 (3.2.0); v1 model paths dead.

**site/** · start.md:93 "threaded path reads the whole clip, 111 GiB per hour" (streaming shipped; the CLI `--threads` help carries the same stale text) · results.md:104 vs :48 1.01x vs 0.96x, and :108 explains it backwards (1.01x is the later read) · results.md:48/:66 "33% of runs" unverifiable · results.md:46-48 publishes G1 0.95x passing; newest board 1.05x · design.md:91 29/36 (34/36) · README.md:34 "copied untouched" (adopt() rewrites them) · results.md:106 openh264 -9.3 VMAF unverifiable · spread 0.07 vs 0.10.

**Memory index** · `session-state-0901` body says uncommitted/77c8b46 · `abr-serialization-is-the-w2-drain` was retracted 33 minutes after being written (`8406b76`) and the real arm is absent · `speed-parity-goals` index line quotes numbers not in its file · `two-trees` misses a third tree (`../yah264-prepurge-backup`, 1,292 commits, local origin, holds the pre-08-25 record) · `b-intra-admit-margin` "owner flip" (shipped at 12, `52b5b9b`) · `speed-track-status` W2 "off by default" (`encoder.c:4619` is on; `encoder.h:892` comment is the wrong one) · `mt-scaling-real-numbers` index contradicts body · six knobs renamed at the rename and never updated in memory · MEMORY.md is 25,830 bytes and loses its last four entries at load.

**Old tree (`../yah264old/docs`)** · the live repo shares no history with it (fresh root 08-25); 18 docs, 131 archive files and 55 scripts stayed behind, including the canonical goal definition, the work queue, the provenance gate and the ABR/RCP instrument family; `8406b76` records a round lost to one of them · `hf-mechanism-portfolio.md:164` deep-band "9 of 10" counts touchdown_420, declared unquotable · `x265-threading-study.md:11` "720p at parity" is a rate reading · `remaining-work.md:22` complexity-weighted allocation "deferred" (built as `ABR_RF`) · `mt-frame-pipeline-plan.md` four headings announce OFF gates that ship ON (`FPIPE`, `STAIR`, `STAIR_DEPTH`, `STAIR_BDEPTH`).

## 8. Method and provenance

Worktree at `cf0ca18` under the session scratchpad, `meson setup` defaults, installed to a private prefix for ffboard; the owner's `/tmp/y264inst` was not touched. Quality: `bdcompare.py`, 150 frames unless stated, `--threads 1`, VMAF-NEG via libvmaf 3.2.0, x264 0.164 r3108. ABR points are x264's achieved rates at the CRF points; stefan (90 frames) and akiyo at the 50 kbit/s floor are unreliable ABR cells and were left in with their flags. Speed: `ffboard.py` with `FF=/tmp/ffmpeg-yah264/ffmpeg`, `X264LIB=/tmp/x264asm` (libx264.165 r3223, fair-build status unprovable, `/tmp/x264src` is gone), `THREADS=12`, private `WD`, run on a box at load 3-5 after the quality runs drained; the library load was verified with `DYLD_PRINT_LIBRARIES`. Load during the quality runs reached 37; BD reads are load-immune. Nothing was committed; `docs/knobs.md` was rewritten by an auditor's census run and restored with `git checkout`. The five auditors ran on the default capable tier, not the frontier tier.

## 10. Step 1 result: the ten-clip board, three tiers, three same-day rounds (2026-09-01 evening)

`scripts/ffboard.py` on the ten clips of `scripts/parity-clips.sh` (3 CIF, 4 × 720p, 3 × 1080p), CRF at matched achieved bitrate, 6-second windows, median of 3 samples per cell, three full rounds in the order G3, G2, G1 each round. Timed encodes written to `/dev/null` (a one-line patch to the worktree copy of ffboard, files for size and VMAF produced once untimed). Pure-C reference `/tmp/x264noasm` (libx264.165 r3223, autovectorised build), SIMD reference `/tmp/x264asm`. Auto threads means 16 for us and ffmpeg's own auto for x264. G1's CRF solve ran at 12 threads to keep the round under an hour; the dsize column carries the landing error (worst +1.4% on sunflower). Zero spread warnings across the 90 cells. Raw log: `local/records/board-ten-3tiers-3rounds-2026-09-01.log`.

| tier | median (rounds) | median of rounds | max (rounds) | CPU work | dVMAF median | dsize |
|---|---|--:|---|--:|--:|--:|
| G1 pure C, 1 thread | 1.10 / 1.10 / 1.09 | **1.10x** | 1.46 / 1.45 / 1.46 | 1.10x | +0.15 | +0.3% |
| G2 pure C, auto | 0.98 / 0.97 / 0.97 | **0.97x** | 1.37 / 1.37 / 1.35 | 1.29x | +0.14 | +0.1% |
| G3 SIMD, auto | 1.04 / 1.07 / 1.04 | **1.04x** | 1.40 / 1.42 / 1.40 | 1.40x | +0.16 | +0.1% |

Against the bar (median ≤ 1.00x, max < 1.15x, dVMAF within 0.5, dsize within 1.0%): G2 passes the median leg and fails the worst-clip leg; G1 and G3 fail both speed legs; every tier fails the worst-clip leg by 0.2 to 0.3, not by noise. bus_cif fails the dVMAF leg (-0.76) on every tier.

Per clip, median of three rounds, ± half the round-to-round range:

| clip | kbit/s | G1 wall | G2 wall | G2 work | G3 wall | G3 work |
|---|--:|--:|--:|--:|--:|--:|
| foreman_cif | 380 | 1.07 ±0.01 | 0.88 ±0.01 | 1.29 | 0.99 ±0.02 | 1.45 |
| bus_cif | 422 | 1.13 ±0.00 | 1.00 ±0.01 | 1.39 | 1.06 ±0.02 | 1.58 |
| stefan_cif | 401 | 1.03 ±0.01 | 0.89 ±0.02 | 1.31 | 0.95 ±0.01 | 1.50 |
| ducks_720p | 24337 | 0.85 ±0.00 | 0.72 ±0.01 | 0.90 | 0.81 ±0.01 | 1.01 |
| park_joy_720p | 12232 | 1.03 ±0.01 | 0.95 ±0.01 | 1.08 | 1.04 ±0.02 | 1.15 |
| samsung_720p | 1209 | 1.17 ±0.00 | 1.10 ±0.02 | 1.30 | 1.15 ±0.01 | 1.40 |
| shields_720p | 2258 | 1.43 ±0.01 | 1.33 ±0.02 | 1.40 | 1.32 ±0.03 | 1.39 |
| sunflower_1080p | 1485 | **1.46** ±0.01 | **1.37** ±0.01 | 1.48 | **1.40** ±0.01 | 1.51 |
| pedestrian_1080p | 2919 | 1.27 ±0.00 | 1.25 ±0.01 | 1.27 | 1.25 ±0.00 | 1.30 |
| riverbed_1080p | 12374 | 0.73 ±0.00 | 0.75 ±0.01 | 0.71 | 0.83 ±0.01 | 0.80 |

What the three tiers say together. The four clips that fail the worst-clip leg are the four HD clips below 3 Mbit/s, and their ratio is the same in every tier: sunflower 1.46x with no SIMD on one thread, 1.40x with SIMD on sixteen threads. So at low-rate HD the deficit is not SIMD coverage (G1 has none on either side and shows it), not threading (G1 is one thread and shows it), and not the machine (round spread ±0.01). It is work volume per macroblock at high QP: at these rates x264 resolves most macroblocks as skip early, and we run the tournament. The CIF and high-rate cells, where the median comes from, are at or under parity in G2 and G3. That is consistent with everything the tree recorded about the gap being a rate curve, and it points every tier at the same lever: the skip-path economy at high QP, priced at t12 and gated by the CRF band. Two further facts from the board: our CPU work at auto threads is 1.29x (pure C) to 1.40x (SIMD) x264's for the same wall, and the auto thread budget hands x264 more threads than us (its 1080p cells run 12.8 to 13.2 cores against our 13.9 to 14.0 at a lower wall), so the goal definition's "12 threads" and the board's "auto" are not the same experiment and read 0.3 apart on sunflower in G3.

Step 2 as planned still applies, sharpened: the split of uncovered C time into pixel work versus control flow should be taken on sunflower and shields at their board CRFs, not on the legacy clips, and beside it a per-verdict tournament profile (`Y264_BPROF`) on the same cells against x264's (`X264_BPROF` from the measurement patch), because the low-rate work volume, not the kernel coverage, is what all three goals now hinge on.

## 11. Step 2 result: where the low-rate HD work goes (single thread, board CRFs)

Cells: sunflower_1080p crf 27.66 vs x264 27.95 (150 f), shields_720p 26.50 / 25.63 (300 f), samsung_720p 25.34 / 25.42 (180 f), and riverbed_1080p 28.81 / 27.58 (150 f) as the control where we win. Instruments: `Y264_BPROF=1` (ours, per-verdict tournament wall), `X264_BPROF=1` from `xbprof.patch` on a scratch x264 r3223 with `-fno-tree-vectorize` stripped, `Y264_THREAD_PROF=1`, decoder-side macroblock census, and the skip oracle (`Y264_SKIP_ORACLE` record, replay at `AT=post`). Logs: `local/records/parity-push-step2-2026-09-01.log`.

| sunflower, ms | ours | x264 |
|---|--:|--:|
| wall | 7100 | 4730 |
| B tournament | 2191 | 2271 |
| **P tournament** | **2680** | **1121** |
| of which on macroblocks that end SKIP | 1181 (906 of it motion search on 118k of 185k skips) | 92 (0.5 µs per skip) |
| of which on INTER verdicts, per macroblock | 11.7 µs | 6.2 µs |
| lookahead + mb-tree | 1414 (lowres 254, lookahead ME 452, mb-tree 708) | not separable here |
| everything else | ~900 | ~1340 including the lookahead |

Same shape on shields (P 2646 vs 1257, B 2637 vs 2418) and samsung (P 1008 vs 776, B 842 vs 866). On riverbed x264 is the one doing extra work (it codes 46% of P macroblocks intra with a full search on each).

So at low-rate HD the B tournament is at parity and the deficit is three terms: the P tournament (65% of the gap; half of it search on eventual skips, the other half a 1.9x per-macroblock search cost on inter verdicts), the lookahead (20% of our wall; the tree's own record says our propagation walk is 11x x264's because Phase A re-runs a lowres search the lookahead already did), and the rest.

**The skip half of the P term is not deletable band-neutrally, and the tree had already found this.** Our probe is a zero-residual test like x264's; on sunflower 64% of our eventual skips fail it and are chosen skip later by RD, a class x264 does not create (its P_SKIP is the probe's set plus the searched-MV-equals-skip-MV case) and part of why we are ahead in CRF quality on these clips. Priced on the low-rate cells this session:

| arm | t1 wall | t12 wall | CRF BD vs default (10-12 clips) |
|---|---|---|---|
| `Y264_P_SKIP_EXIT=1` | −0.5% | — | −0.4 to +0.9, median +0.3 |
| `Y264_P_SKIP_EXIT=2` | −4 to −7% | — | **+2 to +12** (park_joy +10.4, shields +11.8) |
| `Y264_SKIP_DECIMATE=1,0` | −1% | −0.5% | median +0.2 |
| `Y264_SKIP_DECIMATE=3,0` (x264's decimate-6 probe) | −5% | −2 to −3% | +0.2 to +2.5, median +0.6 |
| same + `Y264_SKIP_MVAGREE=4,0` | −4% | −1% | median +0.1, worst +1.7 |
| skip oracle, replay at post (ceiling) | −23% | — | byte-identical on 3 of 4 cells; changed shields (instrument defect, noted) |

The oracle bound says a perfect predictor would buy 23% of single-thread wall on sunflower; every admissible or x264-shaped predictor reaches a fifth of that. What is left on the P side is the per-macroblock search cost on inter verdicts (1.9x x264's on this content), which is the ME-economy question the tree's ME early-out memory calls exhausted on the legacy clips and which has never been priced on these.

## 12. Step 4 result: `Y264_DIRECT_AUTO` at every thread count, built and gated

Branch `parity-push`, commit `0afbb19`, unpushed. The per-slice rule was threads-1 only because its counts lived in a process-wide global; they now belong to the frame (atomic adds from the wavefront rows) and the score to the encoder instance. Two threaded paths, both deterministic by construction: on the frame pipeline (what runs when auto is armed, because arming auto excludes the staircase) the fold at each B prep sees exactly the frames whose analysis is complete, in coding order; under the staircase (`Y264_STAIR_TDIR=1`) a launch folds every burst up to seq−K−1, all of which drained before the previous launch could take a slot. `--direct auto` on the CLI arms the same knob.

Gates: station2 100 f at 12 threads under six spinners, six runs, one md5 on both paths; t8 == t12; default path byte-identical to `cf0ca18` at 1 and 12 threads on three clips; `make test` green; conformance fast 317/317.

| path | t12 wall vs default | t12 BD vs spatial default |
|---|--:|---|
| frame pipeline (staircase excluded) | **+46 to +52%** (+4 to 6% at t1) | station2 −31.5, blue_sky −14.0, stockholm −6.4, sintel −5.2, pedestrian −0.3, park_joy +0.5, sunflower +4.8 |
| staircase, `Y264_STAIR_TDIR=1` | +7 to +9% | station2 −26.2, stockholm −5.9, blue_sky −1.5, sunflower +0.1 |

Neither is a flip yet, and the flip is the owner's. The frame-pipeline form has the quality but pays the staircase's whole concurrency; the staircase form keeps the wall but its clamps cost temporal derivations, so the scores run closer and blue_sky's win shrinks from −14 to −1.5. The two follow-ups are sized by the table: cut the scorer's own cost (the alternate derivation plus probe per macroblock, 4–6% at t1, x264 pays the same), and relax the staircase's temporal-direct clamps so the stair form keeps blue_sky.

## 13. What is next, re-ordered by this session's numbers

1. **ME economy on inter verdicts at low-rate HD** (speed, all tiers). 1.9x x264's per-macroblock search on sunflower/shields inter verdicts; never priced on these clips. Instrument first: `Y264_ME_STATS` (8.1M searches on sunflower 150 f, subpel budgets 45/40/14% and 34/37/29%) against an x264 op-ledger build (the `op-ledger.patch` no longer applies to r3223; port it).
2. **Lookahead Phase A reuse** (speed, all tiers, 5–7% of wall on HD, design in memory `mbtree-phasea-duplication`): the leaf-vs-reference-B lowres pair the walk recomputes.
3. **DIRECT_AUTO follow-ups** (quality leg at 1080p): scorer cost, staircase clamps; then the flip decision.
4. **ABR as CRF plus a slow rate factor** (the streaming mode; section 1a): the largest quality gap, weeks.
5. **NEON coverage** for G3 only, after the ME-economy split says how much of the remaining C is pixel work.

Not on the list any more: the P-side skip exits (section 11), `RCP_LAG` (section 4), `DIRECT_SCORE` re-measurement.

## 14. Step 3 result: the P search volume, sized and one arm shipped on the branch

Op ledgers on both sides (scalar kernels, both fair builds; `local/records/parity-push-ledger-2026-09-01.log`), sunflower at the board CRFs: with B frames our SAD volume equals x264's and our SATD is 1.55x, of which the lookahead alone is 9.5G pixels, more than x264's whole SATD budget (11.6G). P-only (`--bframes 0`) isolates the P search: our SAD is 4.2x x264's and our SATD 2.2x. Per search the two encoders spend the same (about 15 SADs); the excess is the number of searches per macroblock, about 20 against x264's 12: we search 78% of P macroblocks where x264 searches 51% (the RD-chosen skips again), and in the threaded partition order every 16x8 and 8x16 partition ran on every reference, twelve searches per macroblock where x264 spends at most eight and the rect gate never pruned on this content.

Shipped on `parity-push` (`820a975`): rect partitions search only the references their 8x8 halves chose, x264's rule, default on. The single-thread quality order never reaches the gate, so `--threads 1` is byte-identical to `cf0ca18`; `Y264_RECT_REFS=0` reproduces `cf0ca18`'s 12-thread output.

| cell | rect searches | P tournament (threaded order, t1) | t12 wall, median of 5 | CRF band (both arms threaded order) |
|---|--:|--:|--:|--:|
| sunflower_1080p | −63% | 2024 → 1579 ms | **−7.5%** | −0.00 |
| shields_720p | | | −3.5% | −0.29 |
| pedestrian_1080p | | | −3.1% | −0.43 |
| park_joy_720p | | | −3.5% | +0.27 |
| samsung_720p | | | −3.0% | −0.15 |
| foreman_cif | | | −3.0% | +0.08 |
| 14-clip band median / worst | | | | +0.06 / +0.72 (bus, saturated) |

Gates: eight 12-thread runs under six spinners give one md5; `make test`; conformance fast 317/317; `recon_thread_gate.sh` all pass.

On the ten-clip board (ffboard, CRF, auto threads, two rounds, timed to `/dev/null`) the arm moves the threaded tiers by less than the hand timings, because at sixteen threads the P search is not the whole critical path:

| tier | before (3 rounds) | with rect-refs (2 rounds) |
|---|---|---|
| G2 pure C, auto | 0.97x / max 1.37x | 0.94x, 0.93x / max 1.30x, 1.30x |
| G3 SIMD, auto | 1.04x / max 1.40x | 1.02x, 1.00x / max 1.36x, 1.37x |

G1 is unchanged by construction. The worst-clip leg is still 0.2 over its bar in both threaded tiers, and the next terms in the same table are the ones the ledger names: the lookahead's SATD volume (Phase A) and the searched-macroblock fraction.

The diamond subpel arms were not a lever: medium already selects the capped diamond (`params.c` preset row), and the ledger shows our SATD per search below x264's.

## 15. Step 3, continued: the mb-tree walk at 12 threads (2026-09-02)

The 12-thread profile on sunflower (`Y264_THREAD_PROF` + `Y264_NTP_PROF`) put the driver inside `compute_mbtree` for 389 ms of an 811 ms wall with the pool 82% busy, so the walk itself is the critical path at HD. `Y264_MBT_SPLIT` at 12 threads: Phase A 281 ms, Phase B 73, finish 22; and Phase A's reuse coverage collapsed from 111 sources at one thread to 17, with 150 sources declined as "unsettled" by the wide pipeline's fail-closed reach. Two changes on `parity-push`, both gated the same way as the rect arm (eight loaded runs one md5, `make test`, conformance 317/317, threaded recon-match, TSan 0 reports on park_joy t18 and sunflower):

- **`c2e3436` retained subpel sets.** The shared cache of an anchor's fifteen quarter-pel planes was emptied every call and capped at two sets per worker, so at one thread nothing ever fit and every source built both legs privately (231 ms of the 590 ms single-thread Phase A). Sets are now keyed by (lowres pointer, push index) and kept with LRU eviction. Byte-identical by construction and verified (`Y264_MBT_SUB_VERIFY=1` rebuilds beside every hit and compares the planes: 0 mismatches). Worth 1 to 1.5% at one thread, nothing at twelve. The first version aliased the current anchor, whose push stamp is unknown outside GPU runs, and changed the output; unstampable legs now rebuild. The plane builder also left the last row and column of the offset phases unwritten; it now clamps the edge (nothing shipped read those cells: output unchanged).
- **`aa4331a` deterministic deeper chain wait.** Before Phase A the driver waits for the lookahead chain through a fixed step (`pop_seq + la_depth − 1`, clamped), so the settled bound can drop the wide term while reuse stays a function of the launch sequence. Reuse at t12 rises to 82 sources; wall −2.7 to −3.7% on sunflower, shields, pedestrian, samsung against an unsafe ceiling of −4 to −6%; CRF band at t12 against the escape +0.11 to +0.36% (t12 moving toward the t1 decisions, which already reuse every leg). Single-thread output unchanged. It also fixes a race TSan found in my own PPART counters from the rect commit (now gated on `Y264_BPROF`, t1-only).

Ten-clip board after both (ffboard, CRF, auto threads, timed to `/dev/null`, two rounds; log `local/records/parity-push-board3-2026-09-02.log`):

| tier | session start | after rect-refs | after rect-refs + mb-tree |
|---|---|---|---|
| G2 pure C, auto | 0.97x / max 1.37x | 0.93x / 1.30x | **0.92x / 1.28x** |
| G3 SIMD, auto | 1.04x / max 1.40x | 1.01x / 1.36x | **1.00x, 0.98x / 1.31x, 1.32x** |

G3's median leg is at the bar; the worst-clip leg (sunflower) has moved from 1.40 to 1.31 against a 1.15 bar. G1 is untouched by all three commits (single-thread path byte-identical).

What is left on sunflower at 12 threads, from the same profiles: Phase A is one job per source (about eight sources per call on twelve workers, each row-serial because the predictor chains down the rows), Phase B is serial on the driver (73 ms), and the searched-macroblock fraction on the P side is the RD-skip class. The row-serial Phase A source is the next mechanical item: a wavefront over rows inside a source (the row above must lead by a couple of blocks) would use the whole pool on each call and is byte-identical by construction.

## 16. Negative result: a row wavefront inside Phase A (2026-09-02)

Built and measured, not shipped. Phase A was refactored into prepare / block / rows / finish so each source's block loop could run as a row wavefront on the pool (rows chain only through the left carry and the row above at the same column, so the wavefront rule covers it), with the per-worker path kept as the escape. At 12 threads the two paths produced identical bits, the walk's Phase A wall fell from 259 to 222 ms, and the encode got **slower**: sunflower +2.1%, shields +0.8%, samsung +3.1%, pedestrian +2.0% (medians of 5). The pool is 82% busy with encode rows while the driver sits in the walk, so shortening the walk's critical path only adds cell-claim overhead and preempts the frame pipeline; at 12+ threads the wall is the pool's total CPU, not the driver's wait. This is the same conclusion `mbtree-overlap-route-dead` recorded for the overlap route, now measured for the in-source split as well. The refactor also changed the single-thread output (inner candidate-loop `continue`s became returns in the block function), which the identity gate caught before anything else did. Reverted; log `local/records/parity-push-phaseA-wavefront-negative-2026-09-02.log`.

What that says about the remaining sunflower gap at 12 threads (1.31x): it is CPU work, so the levers are the ones that delete work everywhere. From the ledger, in order: the lookahead's own lowres search volume (9.5G SATD pixels, above x264's entire SATD budget; Phase A's 65 anchor-vs-anchor full searches per encode duplicate the lookahead's P-cost search), the RD-skip search class on the P side (a quality trade), and the threaded CPI loss the tree already measured (1.29 to 1.40x CPU for the same wall).

## 17. Step 3, continued: the lookahead's probe metric (2026-09-02)

With a site flag on the x264 ledger (kept outside the repo in `../yah264-measurement-patches/op-ledger-sites/`), the SATD volumes on sunflower at the board CRFs read: x264 11.6G pixels of which 2.3G lookahead; ours 18.1G of which 9.5G lookahead, and outside the lookahead the two are equal (8.6G vs 9.3G). The whole excess was the lookahead. Splitting ours by site (thread-local tags at each entry; the first attempt over-attributed because a tag is sticky until the next entry): the push-time search of every frame against its previous frame 4.8G, the pair-leg field search 3.5G, Phase A 3.0G. All three scored every probe of a diamond with SATD where x264 probes with SAD and pays SATD once for the winner. The push-time one (`blk8_inter`, a from-zero five-level diamond) alone was a quarter of all our SATD.

Shipped on `parity-push` (`7dacb39`): the x264 shape in all three, behind `Y264_LR_PREV_SHAPE`, `Y264_LR_SHAPE` (already built, priced at ~1% on the legacy clips and left off) and `Y264_LR_SADINT`, priced as one arm. SATD volume 18.1G → 10.0G, below x264's. Wall at 12 threads, medians of 5: sunflower −4.3%, shields −2.9%, samsung −3.5%, pedestrian −3.3%, foreman −3.4%, park_joy −2.2%; single thread sunflower −3.2%, shields −2.0%. CRF band, 16 clips at 150 frames: median −0.02%, range −1.26 (foreman) to +1.24 (sintel). Escapes reproduce main's single-thread output exactly. Gates: eight loaded t12 runs one md5, `make test`, conformance 317/317, threaded recon-match, TSan 0 reports after the two new statics were warmed (TSan caught their first touch on a pool worker; `env_gate_audit.py` also listed the rect-refs knob cold since its commit, now warmed).

Ten-clip board, one round each tier, all five commits (log `local/records/parity-push-board4-2026-09-02.log`):

| tier | session start (3 rounds) | now | bar |
|---|---|---|---|
| G1 pure C, 1 thread | 1.10x / max 1.46x | **1.02x / max 1.31x** | median leg 0.02 over, worst clip fails |
| G2 pure C, auto | 0.97x / max 1.37x | **0.83x / max 1.13x** | **both speed legs pass** |
| G3 SIMD, auto | 1.04x / max 1.40x | **0.97x / max 1.26x** | median passes, worst clip 0.11 over |

The pure-C tiers gain most because SATD is expensive without NEON; that is also why the single-thread tier moved for the first time in this branch. The G1 row's dsize column is the 12-thread CRF solve landing on a single-thread encode (riverbed +2.5%, park_joy −1.8%), a harness shortcut for time, not an encoder effect; a published G1 board should solve at one thread. dVMAF stays +0.15 median with bus at −0.66 to −0.75 on every tier, the one quality-leg failure left on the board.

Worst clip on every tier is still sunflower, then shields, then pedestrian: the low-rate HD trio, now 1.26 to 1.31x. What is left there, from the same ledgers: the RD-skip search class on the P side (a quality trade), Phase A's remaining 1.6G SATD (the reuse/scaled candidate evaluations and the 65 anchor-vs-anchor searches that duplicate the lookahead's P cost), and the threaded CPI loss.

## 18. Step 3, continued: Phase A reuses the lookahead's anchor field (2026-09-02)

`parity-push` `ff240f6`: an anchor source's Phase A search is its field against the previous anchor, which the lookahead already computed into `leg[LR_LEG_ANCHOR]`; the reuse path excluded anchors only because no entry recorded which anchor the field was against. The chain step now stamps that POC, and Phase A takes the leg through the same three-candidate evaluation as the leaf legs. At one thread all 65 anchor searches on sunflower reuse (Phase A 527 → 429 ms, wall −1.6% sunflower, −1.1% shields); at twelve threads 36 of 65 do, the rest sitting past the settled bound (wall −0.6 to −1.3%). CRF band on 14 clips: median +0.04%, range −2.01 (sintel) to +0.91 (foreman). Gates as before, TSan 0 reports. `Y264_MBT_AREUSE=0` escapes.

Board estimate from the hand timings (not re-run; the last full board is section 17): G1 about 1.00x / max 1.29x, G3 about 0.96x / max 1.25x. What is left in the walk at twelve threads is the settled bound itself (29 anchors and 85 leaves per encode still past it), Phase B's serial 73 ms, and the reuse evaluations' own SATD; on the P side, the RD-skip search class.

## 19. Null result: the settled bound, and where this leaves the walk (2026-09-02)

Tried: wait the lookahead chain through everything pushed before Phase A and trust every leg that exists (deterministic by construction: which legs exist is a function of what was pushed). Every source then reuses (0 full searches, Phase A 222 → 120 ms at 12 threads on sunflower) but the driver waits 206 ms for the chain to catch up, the walk grows from 325 to 425 ms, and the walls are flat or worse (samsung +5%, pedestrian −2%). The 29 anchors and 85 leaves that still search at twelve threads are ones whose legs are not computed yet when the walk runs; the lookahead thread's lead, not the bound, is what limits reuse. Reverted; log `local/records/parity-push-settle-full-null-2026-09-02.log`.

Not tried, on the memory bank's record: Phase B (73 ms serial at twelve threads on sunflower, about 9% of the wall now). Its scatter is order-locked, vectorising it was a null twice, and relocating the whole walk off the driver bought zero because the cost is CPU competing with the wavefront (`mbtree-phaseb-is-the-serial-4pct`, `mbtree-overlap-route-dead`, and this review's own row-wavefront result in section 16). A byte-identical per-target-row gather is possible in principle and would be the same relocation.

Where the branch leaves the goals (last full board, section 17, plus the hand-timed anchor reuse): G1 about 1.00x / max 1.29x, G2 0.83x / max 1.13x (passes), G3 about 0.96x / max 1.25x. The worst clip on every tier is the low-rate HD trio. What the ledgers and profiles leave there, ranked: the P-side RD-skip search class (57% of skip-verdict macroblocks still run the full search; a quality trade the tree has refused twice, and the only large term left), the reuse evaluations' own SATD in Phase A (1.6G pixels), the threaded CPI loss (1.3 to 1.4x CPU for the same wall), and bus_cif's dVMAF −0.7 on every tier, the one quality-leg failure on the board.
