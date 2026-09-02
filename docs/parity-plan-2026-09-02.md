# Parity plan, 2026-09-02: every open gap, its cause, and the work that closes it

This document captures the state of the three goals after the 2026-09-01/02
review and push (`docs/parity-review-2026-09-01.md`, `docs/board-2026-09-02.md`),
names every outlier, states what x264 does differently on each, and lays out a
ranked, gated plan to close all of them. Sections 1 and 2 are the plain-language
status. Section 3 is the plan. The research that backs it, five read-only studies
of x264's documented behaviour against ours, is kept as private notes outside the
tree (`local/records/parity-plan-2026-09-02-appendices.md`), per the clean-room
policy's rule 8: nothing that names another encoder's internals ships. The
"Appendix A1..A5" references below point at those notes.

Every number here is in a log under `local/records/` or in the two documents
above. Where a number is a guess it says so.

## 0. Start here on a restart

Work the queue below in order. Each line is one step from section 3; a step
is done when its gate in section 3 has passed and the result is in
`local/records/` and in the step's row here. Tracks 1 and 2 touch different
files and may run concurrently in worktrees; the encode-only steps of track 3
fill the gaps while builds and bands run. Nothing else in the tree is queued
ahead of this list (the VideoToolbox plan in `docs/videotoolbox-plan.md` is a
separate, owner-kicked-off track).

| # | step | track | first action | status |
|---|---|---|---|---|
| 1 | B0 P-skip census (`Y264_PSKIP_CENSUS`) | 2 | add the counter table in `analyze_p_mb`, verify md5-identical, read sunflower / shields / pedestrian / park_joy at their board CRFs | **done 09-02**: md5-identical t1/t12, gates clean; B1 qualifying fraction 34 / 45 / 20 / 33% (ceiling ~3.4% t1 on sunflower, under the 5% hoped), verdict-changing 1.2 / 4.7 / 0.6 / 8.8%; `local/records/pskip-census-2026-09-02.md` |
| 2 | A1 ABR trace (`Y264_ABR_RFQP`) | 1 | print rf_qp / qpa / rceq / cplxr / wanted per frame for both models; reproduce the samsung and stockholm ladders | **done 09-02** (branch `a1-abr-trace`): byte-identical 8/8 both models; samsung ladder 47 51 50 48 44 42 39 38 34 35 40 46 (10/12 exact vs the review), stockholm pin + hunt reproduced, rf +67.4% reproduced; `local/records/abr-rfqp-trace-2026-09-02.md` |
| 3 | D1 riverbed AQ at its calibrated rate; D2 bus re-anchor; D6 sita under the shipped tune | 3 | encodes only, ~5 h total; each decides whether its successor exists | **read 09-02**: D1 aq0 -1.94% at matched size (holds; the gated arm is next, not started); D2 the bus band is ONE CRF step wide (x264 85.9 -> 93.6 -> 98.6 at CRF 26/29/32), so no band BD is quotable, the board dVMAF -0.7 stays the metric, D3-D5 are the owner's call; D6 sita untuned is now +5.15 (was +12.4), but ours `--tune animation` vs x264's tune is **+14.39**: our tune (bframes 7) buys ~0 where x264's buys ~9 (new item D9: x264's tune elements decomposed on sita/bbb/sintel, none helps, aq 0.6 hurts all three, deblock offsets are a MISSING option; closed, `d9-animation-tune`); bframes 5 refused (bbb +5.74); DIRECT_AUTO -0.75/-0.05/-0.95 parked with C6. Records d1-riverbed-aq, d2-bus-band, d6-sita-tune |
| 4 | B2 8x8 reference clamp | 2 | ship if band-neutral (the `Y264_RECT_REFS` pattern) | **done 09-02**, `Y264_P8_REFCLAMP` default ON: t1 -2.2..-4.8% on six cells (sunflower -4.8), t12 -0.6..-2.2%; band median -0.04/-0.07%, worst +0.27; all gates clean; `local/records/p8-refclamp-2026-09-02.md` |
| 5 | A2 `rc_set_qp_rf` behind `Y264_ABR_RF2` | 1 | the load-bearing ABR step; rate-accuracy gate | **built 09-02** (branch `a1-abr-trace`, default off, byte-identical off): x264's mb-tree form incl. the lstep (load-bearing at startup, moved up from A3). Rate = x264's own on samsung/ducks/sintel (-17/+1.4/+5.8 vs -16/+0.7/+9.4), stockholm -23 vs -11 because the CLI restarts the integrator every GOP (new design item: cross-GOP carry). ABR band vs default: median -3.6%, 7/9 ahead, samsung -20.9, sintel -14.8, **ducks +10.7** (B starved: P/B 84/11% vs x264 67/29%; cascade x0 reads ducks -7.4 but sintel +6.7, a per-content trade, refused). `local/records/abr-rf2-2026-09-02.md` |
| 6 | B1 shape-preserving exit (sized by step 1) | 2 | band + t1/t12 walls; B3 exact prune if `PPRUNE_PROBE` says ≥ 10% | **B1 done 09-02**, `Y264_P_REF0EXIT=2` default at K=600 (MV test + x264's SATD bound, K swept 300/600/1200): with B2, t1 sunflower -5.2%, samsung -3.2%, pedestrian -2.6% at K=300 plus shields -5.6%, foreman -2.0% at 600; band vs 300: median +0.02/+0.05, worst +0.49 (stq). K=1200 (t1 shields -14.0% for +0.27% median, four clips +0.8..+0.9) is the owner's worst-clip trade beside mode 1. Mode 1 (MV test alone) reads t1 shields -14.9% / sunflower -7.2% for +0.15..+0.38% median, sita/bus/foreman +0.7..+1.6: OWNER rate-trade decision. `local/records/p-ref0exit-2026-09-02.md`. **B3 dropped**: `PPRUNE_PROBE` puts the late-skip class's bit-equivalent budget under 32 bits on 13.6% of sunflower's skips, 0.1% shields, 3.0% pedestrian, and under 16 bits on ≤0.5% everywhere; nothing below the 16x16 candidate's minimum rate (`local/records/pprune-probe-2026-09-02.log`) |
| 7 | C1 list-1 counter and `Y264_TDIR_L0ONLY` + C2 slice legality; C5 B-seed diagnostic | 2 | the direct precondition pair and the cheap diagnostic | todo |
| 8 | A3 clamps, retire CFLOOR/CGUARD; A4 29-clip ABR table; A5 flip (pre-authorized, decision 1) and `rcp_lag=1` | 1 | **A3 folded into A2** (lstep + absolute clamps are in RF2; CFLOOR/CGUARD never reach it). **Cross-GOP carry SHIPPED 09-02** ahead of A4 (owner): `rc.carry` API + `Y264_RC_CARRY` default on; RF2 stockholm -23.4 -> -11.7 (x264 -11.4), the default model tightens too; `local/records/rc-carry-2026-09-02.md`. **A4 read 09-02** (29 clips, int build): ABR RF2 vs x264 ABR medians CIF -4.1 / 720p -8.2 / 1080p -1.4 (default -0.5 / +14.7 / +8.8); tax 5.5 / 9.4 / 6.9 vs x264 3.5 / 4.4 / 3.8 (default 10 / 33 / 18). Loses to the default only at the top of the rate range (riverbed +13 pts, crowd_run +6): rate-keyed B cascade is the arm. `local/records/a4-abr-table-2026-09-02.md`. **A5 flipped 09-02 pm** (owner: board same or better -> flip): `Y264_ABR_RF2` default on, `=0` restores the previous model byte for byte. The carry's import moved to `yah264_encoder_rc_import()` (the param-struct form broke the prebuilt ffmpeg's ABI) and the conformance thread canary pins `Y264_RC_CARRY=0` like `Y264_STQ=0`. `rcp_lag=1` still todo | done (A5); todo (`rcp_lag`) |
| 9 | E1 trust stored leg cost; E2 lead sweep with the settled bound; E3 pool-mutex claims; E4 CPI counters | 2 | | todo |
| 10 | C6 `DIRECT_AUTO` under the staircase (colmv on the row watermark); `stair_determ.sh` 32/32 first | 2 | funded, decision 2 | todo |
| 11 | D3 to D5 bus (only if D2 re-anchors it); D7 psy/aq per-class screen; C3, C4 B-mode rate and chroma | 3 | | todo |
| 12 | A6 CBR / capped VBR | 1 | | todo |
| 13 | ten-clip board, three tiers, CRF and ABR (`ffboard.py`), after steps 6, 9 and 8; F1 to F4 alongside | all | goal figures only from this, never one draw | **CRF board read 09-02 pm** (`docs/board-2026-09-02b.md`): G1 0.97x / 1.16x (was 1.01 / 1.29), G2 0.84x / 1.12x, G3 0.95x / 1.18x (was 0.97 / 1.24); quality metrics met on every tier. Worst clip 0.01 / 0.03 over on goals 1 / 3, both on shields + sunflower. ABR half and F1-F4 still todo |

Rules that apply to every step, restated because each has cost a round: zsh
does not word-split (A/B loops in bash scripts, verify the two arms' md5s
differ); check load and spinners before timing; `bin_ab` defaults to pure C;
`YAH264_NO_ASM` is presence-based; t1 does not predict t12; a ~1% BD call goes
to the band, never to the board's dVMAF; never move the goal-3 bar.

## 1. Where we stand

The three goals all ask the same question: how fast are we versus x264 at the
same quality and the same size, CRF mode, ten clips (three CIF, four 720p, three
1080p), preset medium, `scripts/ffboard.py`, median of three.

| goal | what it measures | median | worst clip | dVMAF | dsize | verdict |
|---|---|--:|--:|--:|--:|---|
| 1 | plain C, one thread | 1.01x | 1.29x | +0.26 | +0.1% | median on the bar, worst clip fails |
| 2 | plain C, all cores | 0.85x | 1.14x | +0.21 | +0.1% | passes all four metrics |
| 3 | shipped NEON build, all cores | 0.97x | 1.24x | +0.23 | +0.1% | median passes, worst clip fails |

Bar: median ≤ 1.00x, worst clip < 1.15x, dVMAF within 0.5, dsize within 1.0%.
Two days earlier the same board read 1.10x / 0.97x / 1.04x with worst clips at
1.37 to 1.46x. The worst clip on every tier is sunflower_1080p at 1.5 Mbit/s;
the next two are shields_720p and pedestrian_1080p, also under 3 Mbit/s.
Quality at the matched size is ahead on every tier except one clip, bus_cif,
at −0.6 to −0.7 VMAF against a 0.5 bar.

**CRF versus ABR.** CRF ("this quality, spend what it takes") is where every
good number lives. ABR ("hit this bitrate") is behind in both speed and quality:

- ABR speed at auto threads is 1.13x on HD and 1.40x on the legacy six clips
  because the controller needs the previous frame's actual bits before it
  decides the next QP, and that refuses the frame pipeline's width. x264's
  controller tolerates a one-frame lag by construction.
- ABR quality is behind everywhere: 720p reads +12% more bits at equal quality
  where CRF reads 14% fewer. Same coding engine; the ABR controller throws away
  what CRF earns. Traced on the rate trace: first I frame at QP 47 where CRF
  uses 31, QP pinned at 51 for twenty frames on some clips, then ±5 QP swings
  frame to frame. x264's ABR is its CRF path with a slowly drifting rate factor,
  and costs x264 3 to 4% against its own CRF. Ours costs 11 to 33%.

**By resolution** (the corpus has CIF at 352×288, 720p and 1080p; no 480p):

| | CIF | 720p | 1080p |
|---|---|---|---|
| CRF quality vs x264 (BD-rate, negative = ahead) | −5.7% | −14.0% (11 of 13 ahead) | +0.2% (4 of 9 ahead) |
| ABR quality vs x264 | −0.4% | +11.6% | +7.9% |
| ABR tax vs our own CRF (x264 pays 3.5 / 4.4 / 3.8%) | 11.5% | 33.3% | 18.4% |
| speed, shipped build, auto threads | 0.89 to 0.98x | 0.76x at 24 Mbit/s to 1.21x at 2.3 Mbit/s | 0.78x at 12.5 Mbit/s to 1.24x at 1.5 Mbit/s |

Bitrate orders the speed table, not resolution. The two fastest cells are 1080p
at 12 and 24 Mbit/s; the slowest are 1080p and 720p at 1.5 to 3 Mbit/s.

## 2. The outliers, the root cause, and what x264 does differently

| # | outlier | where it shows | root cause (measured) | what x264 does differently |
|---|---|---|---|---|
| 1 | low-bitrate HD speed (sunflower, shields, pedestrian) | worst clip on every goal, 1.14 to 1.29x | we run the full P tournament on 78% of P macroblocks and let RD choose skip afterwards; 64% of our eventual P skips fail the zero-residual probe. Per searched-skip MB ~7.7 µs, 906 ms of a 7.1 s single-thread encode. The 8x8 stage searches every reference for every block | exits tournament right after the ref-0 16x16 search when the MV lands within one qpel of the skip MV and a decimate-tolerant probe passes; clamps the 8x8 stage's references to ref 0 plus the neighbours' refs. Appendix A2 |
| 2 | ABR quality, all resolutions | +8 to +12% behind at HD, +36 to +68% on sintel/sita/bbb10s | a per-frame complexity-times-proportional-gain equation with a 200-bit target floor, a one-frame target and a ±4 QP/frame clamp: starved first I, windup to QP 51, ±5 oscillation. I and B frames priced by the same equation instead of off the P track | its rate equation is one equation for CRF and ABR; ABR only swaps a constant for a whole-encode integrator, adds a bounded (0.5 to 2x) sqrt-damped correction and a per-type step clip. I frames come off the decayed P-QP track, B frames interpolate their references. Under mb-tree the per-frame complexity term is deleted. Appendix A1 |
| 3 | ABR speed at auto threads | 1.13x HD, 1.40x legacy | consequence of 2: a decide that needs last frame's actuals refuses the pipeline's width; `Y264_RCP_LAG=1` costs +9 to +206% BD | its integrator moves O(1/n) per frame, so in-flight frames enter only the bounded correction, and frame threads sync the accumulators late without harm |
| 4 | 1080p CRF quality on direct-mode content (blue_sky +17.6, station2 −9.3, sunflower −6.2) | 1080p median +0.2 hides a ±30-point swing | each of our two direct derivations is weaker than x264's on the content that favours the other: our spatial-vs-temporal swing is twice x264's on every 1080p clip. The derivations themselves are equivalent to x264's clause by clause (verified); the differences are around them: we accept temporal direct from a colocated block that predicted from list 1 only (x264 refuses the MB), we have no slice-level temporal legality test, B modes are ranked on raw SATD with no mb_type rate term and no chroma, and spatial direct inherits our weaker B explicit search. `Y264_DIRECT_AUTO` is never worse than +2.8 on 16 clips but is blocked under the staircase by an unsequenced colocated motion field | refuses direct on list-1-only colocated blocks; forces spatial unless the list-1 ref's first list-0 POC equals the list-0 ref; charges direct 1λ, L0/L1 3λ, Bi 5-7λ; adds chroma to the screen; guards frame threads with a per-row cond-wait on every list-0 AND list-1 reference so temporal stays usable. Appendix A3 |
| 5 | hand-drawn animation (sita +12.4 CRF, +35.7 ABR) | 720p class | intra path ahead; P half fixed by `Y264_MB_LAMBDA=5` (P-only now −3.5 ahead); the remaining +7.8 is B frames at the starved band, and the B-half knobs are closed (`sita-b-half-closed`). Never re-measured under the shipped `--tune animation`; `DIRECT_AUTO` reads −4.7 | the B-frame census differs but the census is a symptom, not a recipe. Appendix A4 |
| 6 | bus_cif dVMAF −0.7 at matched size, +4 to +6% CRF band | the one quality-metric failure on the board | pinned to a uniform 3 to 4 point AC-retention deficit at equal or better MSE on every per-MB class ("we buy MSE, x264 buys texture"); mb-tree, ME, partitions, MV rate, reference inheritance, per-MB lambda, psy classes all refuted; the band is one CRF step wide so band BD is not quotable | trellis on 0.85²/0.65² lambdas where we pass one `lambda_mode(qp)`; otherwise a texture-preserving RD question with no knob. Appendix A4 |
| 7 | riverbed_1080p +3.4 CRF (sat); bbb10s_1080p +8.3 withdrawn (decision 4) | high-rate water; CGI at 1080p | riverbed: AQ off reads −2.35 on the base-path screen, so AQ misallocates on uniformly textured content. bbb10s carries no BD claim by the corpus doc's own rule (re-compressed source, no calibrated point) | AQ 1.0 mode 1 vs our 0.4 mode 2, calibrated on 7 CIF clips only. Appendix A4 |
| 8 | threaded CPU work 1.2 to 1.5x x264's for the same wall | every HD cell at auto threads, and the goal-3 worst clip through it | the mb-tree walk on the driver thread is the t12 critical path; Phase A re-evaluates every reused leg with a three-candidate SATD scan and the lookahead's bounded lead (bframes+1, x264's magnitude, never swept on a correct wait) leaves 29 anchors + 85 leaves per encode searching fresh; the pool mutex is taken twice per wavefront unit; threaded IPC collapses 36% vs x264's 12% on reference-streaming stages. Relocation arms are null (three refuted this week); only deletion transfers | computes every lookahead cost once per (p0, p1, b) bracket and caches it per frame, so mb-tree propagation reads and never searches (39 ms vs our 438 ms on samsung); frame threads duplicate state, never work, and share reference planes behind a per-row progress counter. Appendix A5 |

The one-sentence version: at or ahead of x264 in CRF everywhere except
low-bitrate 1080p direct-mode content; at speed parity except low-bitrate HD
where we still search blocks x264 skips; behind x264 in ABR because the rate
controller is a different design from the CRF path rather than the CRF path
with feedback.

## 3. The plan

Ordering rule: rank by (gap size × confidence the design closes it) ÷ cost,
with the goals' worst-clip metric and the ABR gap weighted first because they
are the two things the public tables cannot currently say we meet. Every arm
below is gated the same way unless stated: t1 output byte-identical with the
knob off (env-gate audit + `scripts/env_gate_audit.py`); 8 runs at 12 threads
under six spinners to one md5; `make test`; `YAH264_CONF_FAST=1 make
conformance` 317/317; `scripts/recon_thread_gate.sh`; TSan on a
`-Db_sanitize=thread` build; CRF band on the 12 to 16 clip set with the median
within 0.3% and no clip meaningfully worse (portfolio rule: narrow-positive and
elsewhere-neutral ships); speed read at t1 AND t12 on sunflower, shields,
pedestrian, park_joy (t1 does not predict t12); a goal figure only from
`ffboard.py` on the ten clips, never from one draw.

### Work item A: the ABR controller becomes the CRF path plus a rate factor

Gap 2 and gap 3 together. Largest gap in the project; outside the three goals
because they are read in CRF, but the streaming mode the owner requires.

Design (Appendix A1 §3): a new `rc_set_qp_rf` that is `rc_set_qp_crf`'s body
with the CRF constant replaced by a state variable `rf_qp` in QP domain,
`rf_qp = 6·log2(rf_cplx_sum / rf_wanted_bits) + K`, seeded from a bitrate
prior (never from a complexity equation), adapted after every coded frame by
x264's two accumulators (O(1/n) steps, no gain knob), corrected by the bounded
sqrt-damped overflow term that already exists as `abr_overflow`, with the I −3
/ B cascade in `frame_qp` as the only type mechanism and the asymmetric lstep
clip already written in the rf branch. Deletes `abr_scale[]`, the `err×0.1`
target correction, the ±4 clamp, `ABR_CFLOOR` and `ABR_CGUARD` (all props for
the per-frame complexity term the new path does not have). VBV stays a
one-sided ceiling on top; CBR wires its decay into both accumulators.

Why this closes all three traced symptoms at once: the starved I, the windup to
51 and the ±5 oscillation are three faces of one equation (per-frame `C^0.4`
on a signal that steps 21x between adjacent frames, times a proportional gain
on a one-frame target). The design has no such term.

| step | work | gate |
|---|---|---|
| A1 | `Y264_ABR_RFQP=1` trace: rf_qp, qpa, rceq, cplxr/wanted per frame for both models | reproduces the traced samsung / stockholm QP ladders |
| A2 | `rc_set_qp_rf` behind `Y264_ABR_RF2=1`: startup + integrator + overflow + cascade, no lstep | rate accuracy per clip: achieved within 5% of target at 300 frames, 8% at 150, on stockholm-300, sintel-900, samsung-180, ducks-480 plus five controls, x264's own error on the identical cell as the reference; byte-identical with the knob off |
| A3 | lstep + absolute clamps; retire CFLOOR/CGUARD under RF2 | per-frame QP sd < 1.5 on samsung / stockholm; md5-identical controls; rate gate holds |
| A4 | ABR band + ABR-vs-own-CRF tax table, 29 clips (`scripts/bdcompare.py` at x264's achieved rates, the review's method) | ABR tax ≤ 6% at 720p; no clip worse than +5% vs today's default; `scripts/abr_noise.py` floor respected before any refusal |
| A5 | flip default; then `rcp_lag=1` at QPD 0 | BD at t12 within 1% of lag 0; `scripts/abr_decode_gate.sh` + `recon_thread_gate.sh`; ABR wall re-read on `ffboard.py --rc abr` (expect the 46% of the ABR wall gap that width was refusing) |
| A6 | CBR / capped VBR with the CBR decay | `scripts/regress.py` cvbr axis, 36 cells, VBV-clean, within +3.4% of target |

Cost: A1 half a day; A2 two to three days (the load-bearing step); A3 one day;
A4 one day of encodes (29 clips × 4 points × 2 modes at t1); A5 one day; A6 one
to two days. Roughly two weeks. Risk: mid-stream I frames mispriced by the flat
cascade (re-enable the P-track I anchor `abr_track_update` only if A4 shows
it). Owner decisions: none until A5's flip, which changes ABR output for every
user; flip on A4's table.

### Work item B: delete the P-side search x264 never runs

Gap 1, and the worst-clip metric on goals 1 and 3. Instrument first, then two
arms, one of them md5-gated.

B0, the census (build nothing else until it reads). `Y264_PSKIP_CENSUS=1`
atomic counters in `analyze_p_mb`, modelled on the `g_pprune` table, default
inert, output md5-verified identical. For every MB that ran the full
tournament, keyed by final verdict: 16x16 MV equals the skip MV exactly and L1
buckets 1 / 2 / 3-4 / 5+; ref 0 chosen; `j_skip / j_inter` ratio bins; the
SATD margin `P_SKIP_EXIT=2` lacked; the probe's returned tolerance; winning
partition and whether intra won. Read on sunflower, shields, pedestrian,
park_joy at their board CRFs. Half a day. The "MV within 1 qpel and ref 0"
fraction IS arm B1's ceiling; nothing in the tree records it today.

B1, the shape-preserving exit (recommended arm, Appendix A2 §3c). After
`eval_inter_part(part=0)` returns, if the 16x16 winner is ref 0 and its MV is
within L1 distance 1 qpel of the skip MV: skip refs 1..N−1 at 16x16, skip the
8x8 stage and the rectangles, keep `inter_rd_score` on the 16x16 and keep the
full three-way compare including intra. This is x264's placement and x264's
bet. It deletes wavefront work (transfers to t12, unlike `P_SKIP_EXIT`, which
deleted off-critical-path work and read null at t12). Ceiling on sunflower if
all 118k qualify: ~10.5% of t1; at 40 to 60% qualifying, 4 to 6% t1. Gate: CRF
band, worst clip reported, plus the ladder-shift check before any ABR-side
refusal. One to two days after B0.

B0 read (2026-09-02, `local/records/pskip-census-2026-09-02.md`): the
qualifying fraction (ref 0 and MV within 1 qpel of the skip MV) is 34% of the
full-tournament MBs on sunflower, 45% shields, 20% pedestrian, 33% park_joy,
so B1's ceiling on the worst clip is ~3.4% of t1, not 5%; item E carries the
rest of the worst-clip gap. The verdict-change population runs the other way,
0.6-1.2% on the low-rate clips and 8.8% on park_joy (14.5% of its inter
verdicts are P_8x8 on a non-zero ref), so B1's band gate is read on the
high-rate clips first. The census also puts `P_SKIP_EXIT=2`'s defect in one
table (its SATD screen misses 44-56% of the eventual skips and would exit
5-23% of the inter verdicts) and shows pedestrian is an intra-admission clip
(19% intra verdicts, intra runs on 70-77% of its P MBs), outside item B.

B2, the 8x8 reference clamp (free rider, independent of B1). Our part-3 loop
searches every reference for every 8x8 block; x264 clamps the 8x8 stage's
maximum reference to ref 0 plus whatever the six neighbour positions used,
whenever 16x16 chose ref 0 and the top/left neighbours are inter. At nref 3
that is 12 searches down to 4 on most MBs, on inter verdicts too, which is the
other half of the P deficit (11.7 µs vs 6.2 µs per inter MB). Same shape as
`Y264_RECT_REFS`, which shipped at +0.06% band median. One day.

B3, the exact prune (md5-gated, ships without a BD round). `pprune_note`
already computes the bit-equivalent budget below which an inter candidate is
provably dead against `j_skip`; exit exactly when the cheapest surviving inter
candidate's minimum rate exceeds it. Run `Y264_PPRUNE_PROBE=1` on sunflower and
shields first: the bins say what fraction of the late-skip class is exactly
prunable. If under 10%, drop it. Half a day to size.

Not to build: x264's gate ported verbatim (our late-skip population is defined
by failing the probe, so its third term rejects all of it; it collapses into
the already-priced `Y264_SKIP_DECIMATE=3,0` at ~5% t1 for +0.6% BD, refused);
`P_SKIP_EXIT=2` recalibrated (three defects: SATD domain, exits before intra,
no MV agreement).

Expected effect on the goals: sunflower t1 from 1.28x toward 1.15 to 1.20x if
B1 reaches 5% and B2 3%; the worst-clip metric on goal 1 needs 1.29 → 1.15,
so B alone may not close it and item E's threaded CPU work carries the rest on
goal 3. Say so on the board rather than adjust the bar.

### Work item C: 1080p direct mode

Gap 4. Appendix A3. The two derivations are clause-for-clause equivalent to
x264's (corner sampling, MinPositive, median rule, colZero, the scaling chain;
verified on 2026-09-02, do not spend a round re-deriving them). The deficits
are around them, and each has a knob-shaped fix and a one-line diagnostic.

| step | change | mechanism | gate | expected |
|---|---|---|---|---|
| C1 | `Y264_TDIR_L0ONLY`: refuse temporal direct for an MB when a sampled corner's colocated POC came from the colocated block's list 1 (x264's `map_col_to_list0(−1)` rule) | sunflower is a near-static close-up under B-pyramid, so the colocated picture is a reference B full of list-1-only blocks; we synthesise a POC-scaled vector from a backward field where x264 searches instead | conformance serial + `recon_thread_gate.sh`; BD at t1 on station2 / blue_sky / sunflower / pedestrian via `scripts/direct_rate_table.py` (rate-anchored, never the shared-CRF set) | sunflower / riverbed / pedestrian recover under temporal, station2 / blue_sky unchanged; that asymmetry is the confirmation. Diagnostic first: a `Y264_DIRECT_WHY` counter of corners resolved through list-1 vs list-0 POC per B frame |
| C2 | slice-level temporal legality: force spatial unless the list-1 ref's first list-0 POC equals the list-0 ref's POC | the guard x264's AUTO rule needs before its score can be trusted; we set `temporal_legal = 1` unconditionally under PERMB | same four clips; expect near-null | bundled with C1 |
| C3 | `Y264_BMB_COST=1` with x264's tables (direct 1λ, L0/L1 3λ, Bi 5-7λ, B_8x8 9λ) | every B mode is ranked on raw SATD today; the function's own comment says it is unpriced; explains the 86.4% vs 75.5% direct-share census | CRF band across the corpus (moves every B decision) | independent of C1/C2 |
| C4 | chroma SATD in the B mode screen, direct and explicit alike (x264 `b_chroma_me`) | luma-only on both sides today, so the discrimination is gone | CRF band; wall priced on their side | independent |
| C5 | B explicit-search seeds on the default UMH path (`Y264_B_SEEDS=1 Y264_RICH_SEEDS=1`, auto-on only under `Y264_NO_UMH` today) | spatial direct is a pure function of the neighbours' coded MVs, so its weakness is downstream of the B search (B frames recover ~16 points under an oracle seed, P frames 2.5). Bad neighbour vectors → bad median → spatial loses ground temporal does not. One mechanism for both ends of the swing | diagnostic first on station2 / blue_sky at t1: if spatial gains and the swing narrows toward x264's, confirmed; then band | a separate shippable if it pays |
| C6 | ship `DIRECT_AUTO` under the staircase: publish the reference B's colmv / colpoc / colref rows incrementally on the same watermark `stair_trailer_task` advances for recon rows, and gate the leaf's corner sample on the list-1 producer's published row ≥ r + stair_lag; then delete `stair_direct_blocks` rather than narrow it | the live blocker: temporal direct reads the colocated picture's motion field, which lands wholesale at `stair_dpb_commit_content` and is sequenced for the next anchor but for nothing on the leaf side; that is why `Y264_STAIR_TDIR=1` reads 14/32 on `stair_determ.sh` while recon-match passes (structurally blind to it). x264's single per-row cond-wait on every list-1 reference covers pixels and motion field at once | in order and none skippable: `scripts/stair_determ.sh` 32/32 at t4/t12/t18 with TDIR and auto armed BEFORE any wall or BD number; `recon_thread_gate.sh` on blue_sky at t4/t12/t18; wall at t12 vs spatial on blue_sky (low rate) and riverbed (high rate), target ≤ 1.05x; BD at t1 on the six 1080p clips plus the twelve gate clips, auto within ~2 points of per-clip best and no gate-corpus regression | 1080p worst clip +17.6 → about +6, station2 → about −40; the frame-pipeline form's +46 to 52% wall avoided |

Fallback if C6's determinism gate still fails: decide direct mode per shot in
the lookahead (a deterministic serial stage with a lowres field), carrying
x264's own skippability score. The content-feature selector is closed negative
(rho +0.000 out of sample); the lookahead form must carry the score, not a
feature model.

Cost: C1+C2 one day plus diagnostics; C3, C4 half a day each plus a band; C5
one day; C6 three to five days (the colmv watermark is the real engineering).
Order: C1 diagnostic and C5 diagnostic first (half a day, both cheap and both
decide the rest), then C1+C2, then C6.

### Work item D: the content-class quality outliers

All from Appendix A4. Ranked by cost to a verdict; every one is a re-read or a
knob, none needs new machinery.

| step | clip / question | work | cost | gate |
|---|---|---|---|---|
| D1 | riverbed: AQ on uniform texture | re-run the base-path screen at the calibrated 12500 kbit/s with `scripts/bd_at_rate.py` / `scripts/direct_rate_table.py --clips riverbed_1080p`; if AQ-off holds at rate, price a content-gated aq-strength using the psy lattice's per-frame flat-share classifier | 10 encodes, ~2 h; arm one day | control re-established first; `ARM='Y264_AQ_STRENGTH=…' scripts/band_at_rate.py` + `BANDS=deep` within the ±1.2 floor; inert setting byte-identical |
| D2 | bus: is +5.9 real or the one-step band? | `scripts/calibrate_band.py`, then `BANDS=deep ARM='' scripts/band_at_rate.py` with `CLIPS=bus_cif`, plus a widened `--points` bdcompare | 6 encodes, ~1 h | quotable only if the ladder spans ≥ 2 CRF steps in band |
| D3 | bus: where the texture dies at the board point | `HF_VMAF=1 ARMS="next-vs\|x264-med" scripts/hf_probe.py bus_cif 100 26,30,34,38`; then `scripts/hf_join.py bus_cif 100 34 next-vs x264-med` | ~2 h | the deficit must reproduce at QP 30-34 (the 426 kbit/s point) or the board's −0.72 and the deep-band +4.22 are two mechanisms |
| D4 | bus: controls at the board rate | `--bframes 0`, `--ref 1`, `--aq-strength 0`, `Y264_MBTREE_STRENGTH=0`, `Y264_PSY_RD=1.0`, each solved to 426 kbit/s; `scripts/b_census.py` (decodes `-threads 1`) with a `Y264_BPROF=1` verdict split | 14 encodes, ~1.5 h | screen only; anything positive re-read with `bd_at_rate.py` |
| D5 | bus: RDOQ lambda split | x264 runs trellis on 0.85² inter / 0.65² intra lambdas; we pass one `lambda_mode(qp)` at all nine RDOQ sites. Arm: per-type trellis lambda (the Q1 intra-lambda ramp is the pattern) | one day | CRF band + deep band; the only knob-shaped bus arm left |
| D6 | sita under the shipped tune | `bdcompare.py --vmaf --no-cache --clips sita_720p --points 30,34,38,42` under `--tune animation`, plus `--bframes 5/7`, plus `Y264_DIRECT_AUTO=1 --threads 1` | 12 encodes, ~1.5 h | ships as a tune (no corpus neutrality needed); bbb + sintel must not regress |
| D7 | psy-rd 2.0 / aq 0.4 per-class screen | neither was ever checked on 1080p (only touchdown) or on hand-drawn content; 2 knobs × 3 settings × 4 clips (sita, riverbed, crowd_run, blue_sky) × 4 points | 96 encodes, ~4 h | any default change: band median within 0.3%, deep band within ±1.2; content-gated form: inert setting byte-identical, priced at t12 |
| D8 | bbb10s_1080p | `scripts/parity-clip-calib.sh` on it, or drop it from quality claims: the corpus doc forbids a BD claim (re-compressed H.264 source, no calibrated point). If it survives, encode the same frames at 720p and 1080p to split resolution from window | ~1 h, then 8 encodes | no BD number quotable until it has a point and a clean source |

Not to reopen (refuted with numbers, listed in Appendix A4): mb-tree / QP
transplant on bus, partition economy, MV rate, reference inheritance, per-MB
lambda, psy classes on bus; AQ sweeps, duplicate frames, intra and the
skip-exit family on sita; direct mode on bbb10s.

The real answer for bus if D2 to D5 hold the AC-retention reading is a
texture-preserving RD metric: a research programme with no ground-truth gate,
Fable-tier by `docs/model-usage.md`, and an owner authorization.

### Work item E: threaded CPU work and the lookahead lead

Gap 8, and through it the goal-3 worst clip. Appendix A5. The mechanism that
keeps x264's threaded CPU flat (1.28x per unit at t12 against our 1.62x) is
that its lookahead computes every motion-search cost once per (p0, p1, b)
bracket and caches it per frame, its mb-tree propagation only reads those
caches, and frame threads duplicate state (contexts, caches, bitstreams) but
never work. Ours re-evaluates every reused leg with a three-candidate SATD
scan, re-searches the legs the lookahead has not reached, and pays a claim
mutex twice per wavefront unit. Relocation is out (three refutations this
week); these are deletions.

| step | lever | size evidence | instrument | gate |
|---|---|---|---|---|
| E1 | trust the lookahead's stored leg cost for exact-key reuse instead of the 3-candidate SATD eval (x264's cached-cost model). `y264_lr_blk` already carries the pure SATD and the MV; the walk keeps its own rate term against the chained predictor at no SATD cost. Not for the `pair_scale` seeds or GPU fields | Phase A residual ~1.6G SATD pixels of our 10.0G total; per-group split exists but unread | `Y264_MBT_SPLIT` `pa_ms[]`/`pa_n[]` per group, ledger site `Y264_LED_SITE_LRPA` | output-changing (drops the rescue that fixes mispriced legs on chaotic motion): CRF band 14 to 16 clips + ten-clip board; `Y264_MBT_LEGTRUST=0` escape |
| E2 | raise the lookahead lead and widen the settled bound by the same k, so the fixed-step wait stays cheap because the chain is genuinely ahead (the opposite trade to the refuted full drain). `la_buf = bframes+1` is x264's magnitude, not a measured constraint; headroom to `Y264_LA_CAP_MAX=80` is ~40 entries | unsized; the one large-lead datum (LA_BUF=16, 202 ms) was taken against the broken `la_th_wait_all` and is void | `Y264_MBT_SPLIT` `pa_unsettled`/`pa_reuse`, `TPROF(TP_LAWAIT)` at lead ∈ {4, 8, 12, 16}; latency from `yah264_lookahead_delay` | byte-identity at each lead (the bound is a formula), then board; `--sync-lookahead` / `--tune zerolatency` stay the latency escape; memory per extra ring entry (lowres plane + intra field + two leg arrays) reported |
| E3 | claim a short run of rows per pool-mutex acquire, or a per-worker fast path when the oldest job's next row is already ready | 271 ms of 5041 ms CPU at t18 on foreman (2 acquires × 35 399 units); 2.2% of CPU at t12; 0.07 µs per acquire at t2 vs 8 µs at t18, so contention not work | `Y264_NTP_PROF` per-unit pool-mutex line, `st_claims` | claim ORDER must not change: byte-identity at t1/t12/t18 + `determ_repeat` under six spinners. Do not touch the row/join spin budgets (real CPU that buys 13 to 15% of wall) |
| E4 | size the CPI loss before spending on it: L2/LLC-miss and DTLB counters at t1 vs t12 on sunflower and foreman, plus a computed hpel/DPB footprint per frame in flight against the cache sizes | inferred only: stage inflation is selective (`lookahead_fme` +145%, `analyze_Bcb` +55%, `mbtree_srcA` −2%), which points at reference streaming, but no counter has been read | one diagnostic session, no gate | any arm justified by "cache pressure" waits for this split, the rule that killed the SIMD-coverage plans |

Not to build: the B-side of the P-skip class. On the clips that fail the board
the B tournament is already at parity with x264 (sunflower 2191 vs 2271 ms,
shields 2637 vs 2418, samsung 842 vs 866); the 11% of t1 wall in the B
eventual-skip class is an animation number, every exit that buys it costs BD on
both animation clips, and the reachable oracle ceiling is 6 to 10%. If
revisited, kill-test offline against `Y264_BLATE_STAT` first and price at t12.

Also recorded: the CLI splits `--threads` across GOP workers, so at the
default keyint each worker runs its own lookahead chain where x264 runs one for
the stream. Not an arm here (the GOP-worker design is locked), but it is a
term in the work ratio and belongs in E4's accounting.

Cost: E1 two days (arm + band); E2 one day (sweep + identity + board); E3 one
to two days; E4 one day. One week.

### Work item F: evidence hygiene

Not encoder work, but the public tables depend on it.

- F1: publish per-class medians (CIF / 720p / 1080p) and the ABR column on
  `site/results.md`; the README's "noticeably slower at 1080p" is a rate
  reading wearing a resolution label.
- F2: the doc corrections in `docs/parity-review-2026-09-01.md` §7 (about 120
  claims), plus two from Appendix A4: `docs/fable-b-path-brief.md:151`
  ("riverbed / crowd_run 3-4% behind without B", contradicted by the screen at
  +1.0 / −2.2) and every quotation of bbb10s_1080p's +8.3% (conflicts with
  `docs/corpus-sources.md:155`).
- F3: `scripts/run_band.py` crashes on its default clip list (curves.json was
  never committed); fix or point it at `parity-clips.sh` as `ffboard.py` now
  does.
- F4: after the goals are re-established, unify `ffboard.py`'s and
  `parity-clips.sh`'s clip sets (memory: never in the same change as a goal
  read).

## 4. Sequence

Two tracks run in parallel because they touch different files and different
gates:

- Track 1 (rate control, `src/encoder/encoder.c` RC functions only): A1 → A2
  → A3 → A4 → A5 → A6. Two weeks. Nothing else in the tree waits on it.
- Track 2 (macroblock and lookahead, speed): B0 → B2 (free rider, ships
  first) → B1 → B3 → item E's arms → C's staircase form. Two to three weeks.
- Track 3 (quality classes, encodes only, fits between builds): D1, D2, D6
  first (cheap, each decides whether the next step exists), then D3 to D5,
  D7, D8. One week of encode time.
- Track 4 (F) alongside, as each result lands.

Read the ten-clip board (`ffboard.py`, three tiers, CRF and ABR) after B, after
E, and after A5. A goal figure is never adjudicated on one draw.

## 5. Decisions taken, 2026-09-02

The owner delegated these five on 2026-09-02 ("use that new info ... i want
you to choose"). Each is recorded with the evidence it rests on and what would
reopen it.

1. **The ABR controller flip: yes, pre-authorized on A4's gate.** `Y264_ABR_RF2`
   becomes the default ABR controller the moment step A4 reads ABR tax ≤ 6% at
   720p, no clip worse than +5% against today's default, and the rate-accuracy
   gate (within 5% at 300 frames, 8% at 150, on the four failure clips plus
   five controls) holds. No further checkpoint. Reason: the current controller
   loses 11 to 33% against our own CRF from one equation the design deletes,
   and every ABR user today gets the starved I and the QP-51 windup; the gate
   is stricter than the incumbent's own behaviour on every clip measured.
   Reopens only if A4 fails its gate, in which case the design is wrong, not
   the flip.

2. **Fund the staircase form of `DIRECT_AUTO` (C6), refuse the frame-pipeline
   form.** The frame-pipeline form's +46 to 52% wall is a speed regression on
   every clip to buy a quality win on two, and goal 3 is read at auto threads.
   The staircase form keeps the wall (+7 to 9% measured before the colmv fix,
   target ≤ 1.05x after it) and the row-watermark publish is the same
   mechanism x264 uses for the same problem. Order: C1 and C2 first (they are
   the auto rule's precondition and likely carry most of sunflower's +35 on
   their own), then C6. `stair_determ.sh` 32/32 before any wall or BD number;
   if it cannot be made deterministic, fall back to the lookahead per-shot
   decision carrying x264's score, and stop there.

3. **The Fable-tier texture-RD programme for bus: not now.** It is one CIF clip
   at −0.7 VMAF on a board whose other nine clips are ahead, its band cannot
   currently quote a BD at all (one CRF step wide), and it has no ground-truth
   gate. D2 to D5 are cheap, knob-shaped and run first; D5 (per-type RDOQ
   lambda) is the only arm with a mechanism behind it. Reopen only if D2
   re-anchors the deficit as real at the board point, D3 shows it uniform
   across MB classes, D5 does not move it, and bus is still the board's one
   dVMAF failure after items A to E ship. Until then the frontier-tier budget
   goes to items A and C, which are differentiator-sized.

4. **bbb10s_1080p leaves every quality table.** `docs/corpus-sources.md:155`
   already forbids a BD claim on it (re-compressed H.264 source, no calibrated
   point) and every number it has produced is saturation-flagged. It stays on
   the speed board as a timed cell, which is what it was cut for. The CGI
   quality clip is bbb_720p (calibrated, 450 frames). D8 is reduced to: if a
   clean 1080p CGI source is obtained, calibrate it as a new clip; do not
   spend encodes re-reading this one. The review's +8.3% and the "same content
   −18.6 at 720p" contrast are withdrawn from the outlier list (row 7 above
   stands for riverbed only).

5. **Push main: yes, done with this commit.** Ten commits since `cf0ca18`, all
   gated (t1 identity, t12 determinism under load, make test, conformance
   317/317, thread recon gate, TSan, CRF band), the board they produced is
   published in the tree, and the remote had not moved. The two files another
   session left in the working tree (`docs/videotoolbox-plan.md`,
   `docs/ideas.md`) are not part of it.

What stays with the owner: the goal-3 bar itself (never moved), and any flip
that changes default CRF output for every user (C3, C4, D1's content-gated AQ,
D7) once its band exists; those are listed on the board when they come up.

---
