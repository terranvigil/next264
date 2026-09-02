# Parity plan, 2026-09-02: every open gap, its cause, and the work that closes it

This document captures the state of the three goals after the 2026-09-01/02
review and push (`docs/parity-review-2026-09-01.md`, `docs/board-2026-09-02.md`),
names every outlier, states what x264 does differently on each, and lays out a
ranked, gated plan to close all of them. Sections 1 and 2 are the plain-language
status. Section 3 is the plan. The appendices are the research that backs it:
five read-only studies of x264's mechanisms against ours, written at design
level with file:function citations (clean-room rule: understood, not copied).

Every number here is in a log under `local/records/` or in the two documents
above. Where a number is a guess it says so.

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
| 1 | low-bitrate HD speed (sunflower, shields, pedestrian) | worst clip on every goal, 1.14 to 1.29x | we run the full P tournament on 78% of P macroblocks and let RD choose skip afterwards; 64% of our eventual P skips fail the zero-residual probe. Per searched-skip MB ~7.7 µs, 906 ms of a 7.1 s single-thread encode. The 8x8 stage searches every reference for every block | exits the tournament right after the ref-0 16x16 search when the MV lands within one qpel of the skip MV and a decimate-tolerant probe passes; clamps the 8x8 stage's references to ref 0 plus the neighbours' refs. Appendix A2 |
| 2 | ABR quality, all resolutions | +8 to +12% behind at HD, +36 to +68% on sintel/sita/bbb10s | a per-frame complexity-times-proportional-gain equation with a 200-bit target floor, a one-frame target and a ±4 QP/frame clamp: starved first I, windup to QP 51, ±5 oscillation. I and B frames priced by the same equation instead of off the P track | `<reference-internal>` is one equation for CRF and ABR; ABR only swaps a constant for a whole-encode integrator, adds a bounded (0.5 to 2x) sqrt-damped correction and a per-type step clip. I frames come off the decayed P-QP track, B frames interpolate their references. Under mb-tree the per-frame complexity term is deleted. Appendix A1 |
| 3 | ABR speed at auto threads | 1.13x HD, 1.40x legacy | consequence of 2: a decide that needs last frame's actuals refuses the pipeline's width; `Y264_RCP_LAG=1` costs +9 to +206% BD | its integrator moves O(1/n) per frame, so in-flight frames enter only the bounded correction, and frame threads sync the accumulators late without harm |
| 4 | 1080p CRF quality on direct-mode content (blue_sky +17.6, station2 −9.3, sunflower −6.2) | 1080p median +0.2 hides a ±30-point swing | each of our two direct derivations is weaker than x264's on the content that favours the other: our spatial-vs-temporal swing is twice x264's on every 1080p clip. The derivations themselves are equivalent to x264's clause by clause (verified); the differences are around them: we accept temporal direct from a colocated block that predicted from list 1 only (x264 refuses the MB), we have no slice-level temporal legality test, B modes are ranked on raw SATD with no mb_type rate term and no chroma, and spatial direct inherits our weaker B explicit search. `Y264_DIRECT_AUTO` is never worse than +2.8 on 16 clips but is blocked under the staircase by an unsequenced colocated motion field | refuses direct on list-1-only colocated blocks; forces spatial unless the list-1 ref's first list-0 POC equals the list-0 ref; charges direct 1λ, L0/L1 3λ, Bi 5-7λ; adds chroma to the screen; guards frame threads with a per-row cond-wait on every list-0 AND list-1 reference so temporal stays usable. Appendix A3 |
| 5 | hand-drawn animation (sita +12.4 CRF, +35.7 ABR) | 720p class | intra path ahead; P half fixed by `Y264_MB_LAMBDA=5` (P-only now −3.5 ahead); the remaining +7.8 is B frames at the starved band, and the B-half knobs are closed (`sita-b-half-closed`). Never re-measured under the shipped `--tune animation`; `DIRECT_AUTO` reads −4.7 | the B-frame census differs but the census is a symptom, not a recipe. Appendix A4 |
| 6 | bus_cif dVMAF −0.7 at matched size, +4 to +6% CRF band | the one quality-metric failure on the board | pinned to a uniform 3 to 4 point AC-retention deficit at equal or better MSE on every per-MB class ("we buy MSE, x264 buys texture"); mb-tree, ME, partitions, MV rate, reference inheritance, per-MB lambda, psy classes all refuted; the band is one CRF step wide so band BD is not quotable | trellis on 0.85²/0.65² lambdas where we pass one `lambda_mode(qp)`; otherwise a texture-preserving RD question with no knob. Appendix A4 |
| 7 | riverbed_1080p +3.4 CRF (sat), bbb10s_1080p +8.3 | high-rate water; CGI at 1080p | riverbed: AQ off reads −2.35 on the base-path screen, so AQ misallocates on uniformly textured content. bbb10s carries no BD claim by the corpus doc's own rule (re-compressed source, no calibrated point) | AQ 1.0 mode 1 vs our 0.4 mode 2, calibrated on 7 CIF clips only. Appendix A4 |
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
`rf_qp = 6·log2(<reference-internal> / <reference-internal>) + K`, seeded from a bitrate
prior (never from a complexity equation), adapted after every coded frame by
x264's two accumulators (O(1/n) steps, no gain knob), corrected by the bounded
sqrt-damped overflow term that already exists as `abr_overflow`, with the I −3
/ B cascade in `frame_qp` as the only type mechanism and the asymmetric lstep
clip already written in the rf branch. Deletes `abr_scale[]`, the `err×0.1`
target correction, the ±4 clamp, `ABR_CFLOOR` and `ABR_CGUARD` (all props for
the per-frame complexity term the new path does not have). VBV stays a
one-sided ceiling on top; CBR wires `cbr_decay` into both accumulators.

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
| A6 | CBR / capped VBR with `cbr_decay` | `scripts/regress.py` cvbr axis, 36 cells, VBV-clean, within +3.4% of target |

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

## 5. Owner decisions surfaced, not taken

1. Flip `Y264_ABR_RF2` as the default ABR controller once A4's table exists
   (changes every ABR user's output).
2. Fund the thread-safe `DIRECT_AUTO` form for the staircase (item C) rather
   than the frame-pipeline form (+46 to 52% wall).
3. Authorize the Fable-tier texture-RD programme for bus if D2 to D5 leave the
   AC-retention reading standing.
4. Whether bbb10s_1080p stays in any quality table (D8).
5. `git push` of main (eight commits since `cf0ca18` at the time of writing,
   nine with this document).

---

## Appendix A1: single-pass ABR, x264 versus ours, and the rate-factor design

Read-only study, 2026-09-02. x264 references are `<reference-source>` in
the local r3223 tree unless stated; ours are `src/encoder/encoder.c`.

### x264

Entry `<reference-internal>` (:1496) → `rate_estimate_qscale` (:2399) →
`qscale2qp`, clip to `[qp_min, qp_max]` (:1519), store `rc->qpm`, then
`accum_p_qp_update` (:1410).

One equation, two rate factors. `<reference-internal>` (:2002) is `q = rceq /
rate_factor`. CRF passes `<reference-internal>`, computed once at :644 as
`base_cplx^(1−qcomp) / qp2qscale(crf + mbtree_offset)`. ABR passes
`<reference-internal> / <reference-internal>` (:2581). Nothing else in the frame-QP path
differs; `x264_ratecontrol_summary` (:1348) prints an ABR run's "final
ratefactor" by inverting the CRF formula on the same accumulators.

`rceq` has no complexity term under mb-tree. With `b_mb_tree` (medium
default), :764 forces `qcompress = 1` and `pb_factor = 1`, and `<reference-internal>`
(:2010) sets `rceq = (BASE_FRAME_DURATION / duration)^(1−qcompress)`, a
per-frame constant. Frame-level complexity modulation is deliberately deleted
because mb-tree's per-MB offsets carry it. Without mb-tree, `rceq =
blurred_complexity^(1−qcomp)` where blurred is the 0.5-decay EWMA
`<reference-internal> / count` (:2560-2563) over `last_satd` from
`x264_rc_analyse_slice` (<reference-source>), the lookahead lowres cost, one
domain for I, P and B, mb-tree-recalculated and AQ-weighted.

Adaptation. `ratecontrol_end` (:1918): `<reference-internal> += bits ×
qp2qscale(<reference-internal>) / last_rceq` (B divides by `pb_factor`, :1923);
`<reference-internal> += duration × bitrate` (:1926); both `×= cbr_decay`
(:1925, :1927). `cbr_decay` is 1.0 for plain ABR (:774) and below 1 only with
VBV (:718), an exponential forgetting window sized by `buffer_rate /
buffer_size`. Both accumulators integrate the whole encode, so the rate
factor's per-frame relative change is O(1/n). There is no per-frame gain knob.

Short-term correction (:2585-2600), skipped under CBR (`b_vbv_min_rate`):
`<reference-internal> = 2 × rate_tolerance × bitrate`, then `×= max(1, sqrt(time_done))`;
`overflow = clip(1 + (predicted_bits − wanted_bits) / <reference-internal>, 0.5, 2)`;
`q ×= overflow`. Bounded, multiplicative, with a dead band that widens as
sqrt(t). The integrator converges; this only nudges.

I frames never price themselves. :2602: an I whose predecessor is not I
discards the equation: `q = qp2qscale(accum_p_qp / accum_p_norm) /
ip_factor`. `accum_p_qp` is a 0.95-decayed mean of coded frame QPs (:1410), an
I contributing `qp + ip_offset` to stay in P domain. An I is starved only if
the Ps are.

B frames never run it either (:2419-2450): POC-distance interpolation of the
two nearest refs' `<reference-internal>`, plus `pb_offset` (half for a ref B).
`ip_offset = 6·log2(ip_factor)`, `pb_offset = 6·log2(pb_factor)` (:821), and
`pb_offset` is 0 under mb-tree.

Startup (:813-818, :836): `<reference-internal> = 0.01 × 7e5^qcomp × sqrt(mb_count)`,
`<reference-internal>` = one frame of target bits, `accum_p_norm = 0.01`,
`accum_p_qp = 24 × 0.01`, `last_qscale_for[] = qp2qscale(24)`,
`last_non_b_pict_type = SLICE_TYPE_I` (so frame 0's I skips the anchor branch
and runs the equation). Under mb-tree that equation has no picture term, so
frame 0's QP is a function of the seed and the bitrate only.

Step limits (:828, :2613-2622): `lstep = 2^(qp_step/6)`, qp_step 4. Per-type
asymmetric clip to `[last/lstep, last×lstep]`, widened one lstep on the side
`overflow` wants. CRF skips it; the I and B branches bypass it.

mb-tree / AQ. `x264_ratecontrol_mb_qp` (:1754) adds `f_qp_offset[mb]`
(combined mb-tree + AQ for refs, AQ-only for non-refs) to the frame `qpm`,
damped above `QP_MAX_SPEC`. The feedback consumes `<reference-internal>`, the pre-AQ frame
average (:1602, :1842), so AQ offsets never enter `<reference-internal>`; mb-tree's
mean-negative bias is compensated once, statically, by `mbtree_offset =
(1−qcomp) × 13.5` inside the rate factor (:643).

Frame threads. `x264_thread_sync_ratecontrol` (:2754) copies start-updated
state (`accum_p_qp/norm`, `last_satd`, `last_rceq`, `last_qscale_for`,
`short_term_cplx*`) from the most recently started context and end-updated
state (`<reference-internal>`, `<reference-internal>`) from the most recently ended one.
In-flight frames enter only via `predicted_bits` (:2481-2492), i.e. only the
bounded overflow term. Lag tolerance is structural: an integrator with O(1/n)
steps does not care which frame's bits arrive first.

So ABR ≈ CRF + feedback: identical `<reference-internal>`, identical I/B derivation,
identical `clip_qscale`, identical per-MB offsets. ABR adds exactly three
things: an adapted rate factor, a ≤ 2x sqrt-damped overflow multiplier, and
the lstep clip.

### yah264

Default model, `rc_set_qp` (:9728), pipelined twin inline in `rcp_decide`
(:10482-10500):

```
err    = abr_cum_actual - abr_cum_target          // bits
target = abr_target_bpf - err*0.1                 // rcp_gain(), :1521; floor 200
rceq   = C^(1-0.6)                                // Y264_ABR_QCOMP
qscale = abr_scale[type] * rceq / target
qp     = 12 + 6*log2(qscale), clamped to abr_qp±4, then 1..51
```

`abr_scale[type]` is an EMA (0.7/0.3) of `bits × qscale / rceq` per coded
frame (`rc_account` :9761; `rcp_account` :10109-10135, first measurement per
type snaps). There is no I or B rule: type only selects a scale. The cascade
is applied afterwards in `frame_qp` (I −3, B `+frame_b_casc`).
`abr_track_update` (:9705) and the `accum_p_qp` / `last_ref_qp` anchors exist
but execute only under `abr_rf` (:10112).

Startup (:4073-4087): `abr_qp = 26`; `abr_scale[0..2]` all seeded with x264's
<reference-internal> seed `0.01 × 7e5^0.6 × sqrt(mbs)`.

(a) Starved first I (QP 47). Three compounding faults. The complexity domain
is split: type 0 uses `frame_complexity(src, intra=1)` (full-res intra SATD),
types 1/2 use the lowres ME cost `rcp_cur_cme` (:10422). One seed serves all
three types, so the first I is priced with a P-domain scale against a
complexity an order of magnitude larger. x264 has no such split and under
mb-tree no complexity term at all. Second, the I is priced by the equation
instead of off the P track; the `type==0 && last_nonb_type!=0` anchor at
:10552 is rf-only. Third, `target = target_bpf − err × 0.1` with `err ≈ 0`
asks the I frame to fit inside one frame of average bits.

(b) Startup pinned at 51. Once `err` exceeds ~10 × `target_bpf`, `target`
hits its 200-bit floor and `qscale` saturates → QP 51, and the ±4/frame clamp
needs ~5 frames per 20 QP to walk back. The correction is additive on the
target and unbounded downward; x264's is multiplicative on q, clipped to
[0.5, 2], divided by a buffer growing as sqrt(t). Structurally it cannot
saturate.

(c) ±5 QP oscillation (sd 4.5-4.7). Two sources. (i) The per-frame `C^0.4`
term on a signal that collapses: the `abr_cfloor` comment (:9600-9622) records
adjacent same-type samsung frames reading C = 41801 vs 896066, a 21x step
worth ~10 QP at `C^0.4`. x264 has no per-frame complexity term under mb-tree,
and a 0.5-decay EWMA without it. (ii) Proportional gain 0.1 per frame against
a one-frame target: every prediction error is repaid in ~10 frames, limited
only by the ±4 clamp, hence the observed walk along the clamp (47, 51, 50, 48,
44, 43, 40, 38, 34, 35, 40, 46). The type cascade is then applied on top of a
loop that already re-priced the type through `abr_scale[type]`, so I/P/B fight
over one error signal (B's 38% bit share vs CRF's 17%).

(d) `Y264_ABR_RF`'s +67% on stockholm. The rf branch (:10506-10556) computes
`q = rceq_blurred / (wanted / cplxr) × overflow` and replaces the ±4 clamp with
x264's asymmetric lstep clip. `<reference-internal>` grows only when frames cost bits,
`<reference-internal>` grows linearly with time, so wherever the complexity
signal collapses or the scale under-predicts, `rf` ratchets and QP falls at up
to 4 QP/frame with nothing bounding `rf` itself. `ABR_CGUARD` only freezes the
degenerate case (`C/mb < 4.0`), sintel's black opening; stockholm is a static
high-detail pan where the same signal collapses without crossing that
threshold, the case `abr_cfloor` was built for on the default path and which
the rf path re-reads raw. Amplifiers: `OVLO 0.8` deliberately lets surpluses
be spent downward, and `<reference-internal>` is fed a mixed-domain `rceq` (intra SATD
for I, lowres for P/B); the gate doc's finding that excluding I bits makes
accuracy worse is the signature of that mismatch, not of a policy.

### Design: ABR = the CRF path plus a slowly adapted rate factor

Keep: `rc_set_qp_crf` (:9804) and its whole mapping (the flat `crf_cl &&
mbtree_on` base, `CRF_CL_SHIFT = (1−qcomp) × 13.5`, the fps/duration term);
the per-MB `mbtree_off` / `aq_off` application through `mb_qp_pre`
(:2590-2611); `frame_qp`'s I −3 / `frame_b_casc` cascade; the whole rcp
pipeline (`rcp_decide` / `rcp_account` / `rcp_pop_bound` ordering and its
determinism argument); the VBV clip layer (`rcp_vbv_clip`, `vbv_clip_qp`);
the gates `run_band.py`, `bdcompare.py`, `abr_decode_gate.sh`,
`recon_thread_gate.sh`.

Replace: `rc_set_qp` and its inline twin; `abr_scale[]` / `abr_cur_cplx` /
`err × gain`; the ±4 clamp; `ABR_CFLOOR` / `ABR_CGUARD`.

New: `rc_set_qp_rf(e, type)` = `rc_set_qp_crf`'s body with `e->crf` replaced
by a state variable `e->rf_qp`.

1. Rate factor in QP domain: `rf_qp = 6·log2(<reference-internal> / <reference-internal>)
   + K`, the inverse of x264's summary formula (:1348). It plugs into exactly
   the slot `e->crf` occupies, so ABR and CRF become one code path.
2. Startup: seed `rf_qp` from a bitrate prior (bits/pixel/frame → QP), never
   from a complexity equation, and never price an I off its own intra SATD.
   Cheap fallback: `rf_qp0 = 26`, giving the leading I `26 − 3` plus mb-tree
   offsets, the CRF behaviour. QP 47 becomes unreachable by construction.
3. Adaptation law: after each coded frame, `<reference-internal> += bits ×
   qscale(qpa_pre_aq) / rceq`, `<reference-internal> += target_bpf`, with `rceq`
   the same duration constant the CRF path uses under mb-tree. Time constant
   O(1/n) automatically. Plus x264's bounded correction, which already exists
   as `abr_overflow` (:9776): `qp += 6·log2(clip(1 + (actual + inflight −
   wanted) / (2 × tol × bitrate × max(1, sqrt(t))), 0.5, 2))`, tol 1.0; drop
   `OVLO`'s asymmetry once startup is fixed (it compensated for the runaway).
4. Per-type cascade: `frame_qp`'s I −3 / B `+casc` is the only type mechanism
   (x264 under mb-tree, where `pb_offset` is 0). Re-enable
   `abr_track_update`'s P-track I anchor (:9705) only if a band gate shows
   mid-stream Is mispriced by the flat cascade.
5. Clamps: per-type lstep against `last_qscale_for[type]` at qp_step 4,
   asymmetrically widened by overflow direction, already written at
   :10537-10552. Absolute 1..51. Delete the ±4-around-last-frame clamp.
6. Rate-accuracy gate: per clip `|achieved/target − 1| ≤ 5%` at 300 frames,
   `≤ 8%` at 150, on stockholm-300, sintel-900, samsung-180, ducks-480 plus
   five inert controls, x264's own error on the identical cell as the
   reference (sintel-900 +5.5%). Secondary: windowed spend per 100 frames
   within ±25%, which caught the under-damped shape last time.
7. Lag tolerance: because `rf_qp` is a whole-encode integrator and the
   per-frame QP carries no complexity term, a decide that misses the last
   burst's actuals moves the QP by O(1/n) rather than a full `err × 0.1` step.
   In-flight frames enter only the overflow's `predicted_bits`, which
   `rcp_decide` already computes as `pend_pred` (:10466-10476). That lets
   `e->rcp_lag ≥ 1` run without `RCP_QPD`, satisfies `stair_wide_rc_ok`
   (:1105), and reopens the 46% of the ABR wall gap that width was refusing.
8. VBV / CBR: layering unchanged, VBV a one-sided ceiling above the rate
   factor. Under CBR disable the overflow term (x264's `b_vbv_min_rate` rule,
   :2585) and wire `cbr_decay = 1 − buffer_rate/buffer_size × 0.5 × max(0, 1.5
   − buffer_rate × fps / bitrate)` (:718) into both accumulators.

Steps and gates: see work item A. A2 is the load-bearing step: the starved I,
the max-QP windup and the ±5 oscillation all go away at once because all
three come from the per-frame complexity-times-proportional-gain equation this
design deletes.

## Appendix A2: the P-skip path, x264 versus ours, and where an early exit lives

Read-only study, 2026-09-02. x264 references are `<reference-source>` and
`encoder/macroblock.c` in the local tree; ours `src/encoder/macroblock.c`.

### x264 at preset medium (subme 7, ref 3, mixed refs on)

There is no pre-search probe at medium. `<reference-internal>` sets
`analysis.b_try_skip = 1` whenever `i_subpel_refine >= 3` (<reference-source>-3008)
and does not call the probe. The standalone `x264_macroblock_probe_pskip`
call (<reference-source>) is the subme < 3 branch only, and even there gated on a
neighbour being P_SKIP. At medium the probe is deferred and only ever runs as
the third term of the post-ref-0 gate.

The probe itself (`macroblock_probe_skip_internal`, macroblock.c:988; exported
at :1129, `probe_pskip` = `b_bidir 0` via macroblock.h:38). It MCs 16x16 luma
from ref 0 at the clipped `pskip_mv` (:998-1008), forward-transforms all
sixteen 4x4s, quantizes with the ordinary (non-trellis, non-RDOQ)
`quant_4x4x4`, accumulates `decimate_score16` over the surviving blocks and
fails at `i_decimate_mb >= 6` (:1027). Chroma (:1035-1116): a per-plane SSD
screen against `thresh = (lambda2 + 32) >> 6`, skipping the transform entirely
below it; then a DC-only 2x2 quant that fails on any nonzero DC; then, only
above `thresh × 4`, an AC pass failing at `decimate_score15 >= 7`. On pass it
sets `b_skip_mc = 1` so the reconstruction is reused.

The post-ref-0 early exit (`mb_analyse_inter_p16x16`, <reference-source>; exit at
:1294-1307). Inside the reference loop, after the ref-0 16x16 search only:

- `i_ref == 0 && a->b_try_skip`
- `m.cost − m.cost_mv < 300 × a->i_lambda`: pure SATD of the winning MV, no MV
  rate, against a deliberately loose bound (the comment concedes SSD would be
  the better metric)
- `|mv[0] − pskip_mv[0]| + |mv[1] − pskip_mv[1]| <= 1`: L1 distance in qpel
- `x264_macroblock_probe_pskip(h)` passes

On success: `i_type = P_SKIP`, cache update, return. Refs 1..2 never searched,
p8x8 never runs, no rects, no intra, no RD.

The RD-stage skip (still inside `mb_analyse_inter_p16x16`, :1318-1330).
Medium's `i_mbrd == 1` (:298). If the 16x16 winner has `i_ref == 0` and its MV
equals `pskip_mv` exactly, x264 runs one `rd_cost_mb` and converts to P_SKIP
when `!(i_cbp_luma | i_cbp_chroma)`. Exact MV match here, cached into
`l0.i_rd16x16` so `mb_analyse_p_rd` (:2547-2557) does not repeat it.

Post-encode conversion (macroblock.c:953-966): after the real encode, `P_L0 &&
D_16x16 && cbp == 0 && mv == pskip_mv && ref == 0` becomes P_SKIP. Relabels
only.

Which MBs get searched at all. Refs 1..2 are searched for every MB that
survives the ref-0 gate; there is no per-ref skip screen, but
`p_halfpel_thresh` (:1259, `b_early_terminate && i_fref > 1`) suppresses
subpel refinement on refs that cannot win. The 8x8 stage is where x264 prunes
references: `mb_analyse_inter_p8x8_mixed_ref` (:1334) clamps `i_maxref` to 0
plus whatever refs the six neighbour positions used, whenever 16x16 chose
ref 0 and top/left are inter (:1351-1364).

Rect gating: `i_thresh16x8 = me8x8[1].cost_mv + me8x8[2].cost_mv`, and
16x8/8x16 run only if `i_cost8x8 < i_cost16x16 + i_thresh16x8` (:3096-3098).
P4x4 is off at medium; the sub-8x8 loop is further gated by `i_thresh8x4`
(:3063).

### yah264's P path and the late-skip population

`analyze_p_mb` (macroblock.c:10334) in order:

1. `mv_skip` → `smvx, smvy`; MC the skip prediction; `j_skip = dist_mb() +
   LAMJ(lam, 1)` (:10390). `dist_mb` (:1764) is SSD + psy-RD texture energy, a
   different domain from any SATD.
2. Probe before any ME (:10405): `probe_pskip` (:9765) → `probe_skip_g`
   (:9609). Unlike x264 this runs the coder's real quantizer path:
   `probe_signif_rdoq` (:9531) applies the deadzone seed and the CABAC Viterbi
   trellis, then asks "any level survives". Default `skipdec_p = 0`
   (encoder.c:3816-3823) = zero tolerance: one surviving level fails. Chroma is
   also zero-tolerance. Passing commits skip immediately.
3. On failure: `eval_inter_part(part=0)` (:5054) searches all `f->nref` refs at
   16x16 (:5186-5240) with 3-4 spatial seeds + temporal + lowres seeds. Then
   part 3 (8x8), which searches all refs per 8x8 block (:5074) with no
   neighbour-ref clamp. Then rects, gated by `part_search_rect` (:4830) with
   x264's adaptive `mv_slack` margin (mode 3, default) and `rect_refs_on`
   (:5035, default on) restricting rect refs to the 8x8 winners'.
4. `inter_rd_score` on the SATD winner + `qpel_rd_nudge`; optional 16x16
   insurance RD (`rd_admit_16`, :4680, default admits all).
5. Intra SATD screen, then the three-way compare `j_skip / j_inter / j_intra`
   (:10545-10559). `j_skip <= best` wins ties.

The late-skip population is defined by step 2 failing and step 5 choosing
skip: 118k of 185k sunflower P-skip verdicts, 906 ms of motion search out of
a 2680 ms P tournament (review §11). What distinguishes it from x264's exit
population is entirely the probe term, in two layers:

- Decimation tolerance. x264 accepts a whole-MB decimate score up to 5; we
  accept nothing. `Y264_SKIP_DECIMATE=1` (our own 3/2 per-block thresholds,
  `dctdec_cfg` :3465) buys ~1% t1, so the "our coder would zero it anyway"
  class is small. `=3,0` (x264's decimate-6) buys ~5% t1 / 2-3% t12 at +0.6%
  BD median. That is the whole probe-shaped headroom, already measured.
- Genuinely coded residual. The remainder has real nonzero residual after
  trellis, and skip still wins because at these QPs the rate of coding it
  exceeds the SSD it buys. x264 codes these as P_L0 with a residual. This is
  the class we cannot delete without changing the verdict, and it is why our
  P-skip share is 59.7% vs 49.3% and why we lead in CRF quality on these clips.

The MV question is open and unmeasured: nothing in the tree records how often
the searched 16x16 MV lands on or within 1 qpel of `smv` for this population.
`eff_skip` (:10598) computes exactly that conjunction after the fact (part 0,
ref 0, mv == smv, cbp 0) but only for `mode == 1`, and it is not counted.

### Design

(a) x264's exact gate, ported: dead on arrival as written. Our population is
defined by failing the probe, so term 3 rejects all of it. It becomes live
only if the probe it calls is x264's, i.e. `Y264_SKIP_DECIMATE=3`, and then it
is strictly weaker than the already-measured `=3,0` arm because the MV and
300λ terms only remove exits. `Y264_SKIP_MVAGREE=4,0` already approximates it
with the lookahead MV (−4% t1 / −1% t12, median +0.1 BD, worst +1.7).
Sharpening MVAGREE from the lowres estimate to the actual ref-0 16x16 result is
the one real gain, and it needs the exit to move after the search: candidate
(c).

(b) RD-based exit after ref-0 16x16. Why `P_SKIP_EXIT=2` costs +2..12% BD
(park_joy +10.4, shields +11.8) is three defects: domain (compares
`satd16x16(src, skip_pred)` against `best_satd` = SATD + `mlam` × mvbits +
mbtype bits, :10451-10456; the real decision is SSD+psy vs SSD+psy+rate, and
the skip side gets no bit credit while the inter side is charged full MV rate,
biased toward skip with no margin); scope (exits before partitions and before
intra); no MV agreement. The calibrated form worth building instead keeps
`j_skip` (real SSD+psy domain) and compares it against a rate lower bound on
the inter side: `pprune_note` (:7020) computes `B = 16 × dist_skip / lam + 1`,
the bit-equivalent budget below which a candidate is provably dead. Exit
exactly when the cheapest surviving inter candidate's minimum rate exceeds B.
That gate is md5-gated, not band-gated. Run `Y264_PPRUNE_PROBE=1` on sunflower
and shields first.

(c) Shape-preserving exit, the recommended arm. After `eval_inter_part(part=0)`
returns, if `ires0.ref[0] == 0` and `|mvx − smvx| + |mvy − smvy| <= 1`: skip
refs 1..N−1 at 16x16 (fold the test into the ref loop at :5185, x264's
placement), skip part 3 and the rects entirely, keep `inter_rd_score` on the
16x16 and the full three-way RD compare including intra. The verdict changes
only on MBs where a split or a non-zero ref would have beaten a 16x16 whose MV
is already within 1 qpel of the skip MV. On sunflower the search budget per
searched-skip MB is 906 ms / 118k ≈ 7.7 µs, and ref0-16x16 is roughly one of
~6 16x16-equivalents (3 refs × 16x16 + 4 blocks × 3 refs × 8x8). Ceiling if all
118k qualify: ~750 ms of 7100 ms t1 = 10.5%; at 40-60% qualifying, 4-6% t1.
Wavefront work deletion, which transfers to t12 (unlike `P_SKIP_EXIT`, which
went 0.6-2.2% t1 → null at t12 because it deleted work already off the
critical path; that trap applies to (b) and must be checked).

Free rider, independent of all three: our part-3 loop searches every
reference for every 8x8 block with no clamp (:5074), where x264 clamps
`i_maxref` to ref 0 + neighbour refs whenever 16x16 chose ref 0 (<reference-source>).
At nref 3 that is 12 searches → 4 on most MBs, on inter verdicts too, the other
half of the P deficit (11.7 µs vs 6.2 µs per inter MB). Same shape as
`Y264_RECT_REFS`, which shipped at +0.06% band median.

Instrument first: `Y264_PSKIP_CENSUS=1` counters in `analyze_p_mb`, modelled
on `g_pprune` (:7016-7027): atomic bins, t1, default inert, output
md5-verified identical. For every MB that ran the full tournament, keyed by
final verdict (skip / inter / intra):

| column | why |
|---|---|
| `mv16 == smv` exact, and L1 buckets 1 / 2 / 3-4 / 5+ | sizes (c) directly; the qualifying fraction is the arm's ceiling |
| `ref16 == 0` | (c)'s other precondition |
| `j_skip / j_inter` ratio bins (0.9, 0.99, 1.0, 1.01, 1.1, > 1.1) | how much margin a calibrated (b) has before it flips verdicts |
| `satd_skip − satd16_raw` in `mlam` units | the margin `P_SKIP_EXIT=2` needed and did not have |
| `tol` from `probe_skip_g` (already returned) | separates "our decimator would have zeroed it" from real residual |
| winner partition, and whether intra won | prices what (b)'s pre-intra exit throws away |

Pricing after that: `Y264_BPROF=1` PPROF stage deltas (`me-satd` on the SKIP
row is the target line) on sunflower_1080p / shields_720p at their board CRFs;
`Y264_PPRUNE_PROBE=1` for the exact-prune share; t1 and t12 walls on
sunflower, shields, pedestrian, park_joy; CRF band at t1 over the 12-14 clip
set, worst clip reported, ~0.3% median bar; ladder shift before any ABR-side
refusal.

## Appendix A3: B-direct, x264 versus ours, derivations, evaluation and the staircase

Read-only study, 2026-09-02. x264 references: `<reference-source>`,
`common/macroblock.c`, `<reference-source>`, `encoder/encoder.c`; ours
`src/encoder/macroblock.c`, `src/encoder/encoder.c`.

### x264's mechanism

Entry: `x264_mb_predict_mv_direct16x16` (<reference-source>) dispatches on
`sh.b_direct_spatial_mv_pred` and returns available / not available; it also
computes a `b_changed` flag by diffing the derived MVs/refs against the cached
`direct_mv` / `direct_ref`, used to skip a redundant MC when the AUTO probe
derives the same answer twice.

Spatial (`mb_predict_mv_direct16x16_spatial`). Per list: A (left), B (above),
C (above-right, falling back to above-left when C is unavailable), `refIdx =
MinPositive` via an unsigned MIN3 so both "unavailable" (−2) and "unused" (−1)
sort above every valid index. None valid → refIdx −1, MV 0 for that list.
Otherwise median of A/B/C when more than one neighbour matches the chosen
refIdx, else that neighbour's MV. One MV pair for the whole 16x16;
`direct_8x8_inference` shows up only in the colZeroFlag pass. Early exits:
both refs negative → both forced to 0; all four MVs zero, or colocated MB
intra, or both refs non-zero → done. Otherwise, per 8x8, the colocated 4x4 at
the quadrant's outer corner (`3·x8 + 3·y8·stride`) is inspected: use the
colocated's list-0 motion if its `l1ref0 == 0`; else if `l1ref0 < 0 &&
l1ref1 == 0` use its list-1 motion; else no test. Within ±1 in both
components → zero the current MB's MV for whichever list has refIdx 0, that
quadrant only.

Temporal (`<reference-internal>`). refIdxL1 = 0 for the whole
MB. Per 8x8, same corner sampling. Intra colocated → refIdx 0, both MVs zero.
Otherwise the colocated block's list-0 refIdx is mapped into this slice's list
0 through `map_col_to_list0`, a POC-match table built once per slice in
`x264_macroblock_cache_load` (macroblock.c:443-456). `map_col_to_list0(−1) =
−1`, so a colocated block that predicted from list 1 only makes x264 abandon
direct for the whole macroblock (`return 0`, with an explicit FIXME). Scaling
uses `dist_scale_factor[i_ref][0]` from `x264_macroblock_bipred_init` (`td =
clip3(poc1 − poc0)`, `tx = (16384 + |td|/2) / td`, `dsf = clip3((tb·tx + 32)
>> 6, −1024, 1023)`, `td == 0 → 256`), then `mvL0 = (dsf·mvCol + 128) >> 8`,
`mvL1 = mvL0 − mvCol`. The same table drives implicit bipred weights.

Frame-thread MV guard (<reference-source>-405): `mv_max_spel[1]` is recomputed
once per MB row from `thread_mvy_range`, the minimum over every reference in
list 0 and list 1 of (rows completed − pix_y) after an
`x264_frame_cond_wait(fref[i][j]->orig, pix_y + i_mv_range_thread)`. Under
`b_deterministic` the value is pinned to exactly `i_mv_range_thread`
(default about height/threads/2, rounded to an MB row, encoder.c:1319-1339).
Direct drops out per macroblock: temporal tests both `l0y` and `l0y − mv_y`
against the bound (<reference-source>), spatial tests both lists' y
(<reference-source>-396).

Tournament (<reference-source>-3420). `i_type = B_SKIP` first. If direct is
available, `x264_mb_mc` builds the prediction into fdec, then at `i_mbrd >= 1`
(medium) `i_bskip_cost = ssd_mb(h)` and B_SKIP is taken outright when it is
`<= (6·i_lambda2 + 128) >> 8`. Otherwise `mb_analyse_inter_direct`
(<reference-source>) prices direct as four 8x8 `mbcmp` against the already-MC'd
fdec plus chroma when `b_chroma_me` (default 1), plus `i_lambda ×
i_mb_b_cost_table[B_DIRECT]` = 1λ; explicit modes are charged 3λ (L0/L1) to
7λ (Bi) from the same table (<reference-source>-2073). Direct is RD-refined in
`mb_analyse_b_rd` (<reference-source>-2632), reusing the prediction, only when
`i_cost16x16direct <= i_cost × 33/32`. After that RD stage B_SKIP wins if
`i_bskip_cost` beats all four 16x16 RD costs.

AUTO (encoder.c:152-171, <reference-source>-3334). Per B macroblock derive both
modes, MC each, run `x264_macroblock_probe_bskip`, add the 0/1 answer to
`stat.frame.i_direct_score[mode]`. At frame end (encoder.c:4077-4089), if the
running total exceeds the MB count both halves decay by 9/10, then the frame's
counts are folded in. The next B slice header takes
`b_direct_spatial_mv_pred = (score[1] > score[0])`, but only if
`fref[1][0]->i_poc_l0ref0 == fref[0][0]->i_poc`; otherwise AUTO is switched
off for that slice and spatial forced. Determinism under frame threads comes
from `thread_sync_stat` (encoder.c:3153): the stat struct is copied in coding
order at frame end and pulled back before each header (encoder.c:4046). In
2-pass the mode is written to and read from the stats file
(<reference-source>-1450).

### yah264, and where it differs

`spatial_direct` (macroblock.c:5318) and `temporal_direct` (:5357) are
faithful to the same clauses: the corner set (`cx/cy = {0,3,0,3}/{0,0,3,3}`),
MinPositive (`min_pos_ref`, :5302), the median rule (`mv_predict_f`, :229,
whose `B=C=A` substitution is provably a no-op here), the colZero condition
(`colref[ci] == 0 && |mv| <= 1`, where `colref` is the overloaded L0-or-L1
index written at encoder.c:11341-11358, reproducing x264's split), and the
whole scaling chain. Equivalent; do not re-derive.

The real differences:

| # | site | x264 | yah264 |
|---|---|---|---|
| D1 | colocated block that predicted from list 1 only | `map_col_to_list0(−1) = −1` → direct unavailable for the MB (<reference-source>-278) | `colpoc = cur_l1poc0` (encoder.c:11346), resolves by POC, temporal vector derived from a backward field (macroblock.c:5375-5382) |
| D2 | slice-level temporal legality | forced spatial unless `fref[1][0]->i_poc_l0ref0 == fref[0][0]->i_poc` (encoder.c:158) | none; `temporal_legal = 1` unconditionally under `Y264_DIRECT_PERMB` (encoder.c:2323) |
| D3 | mb_type rate in the SATD ranking | `i_mb_b_cost_table`: direct 1λ, L0/L1 3λ, Bi 5-7λ, B_8x8 9λ (<reference-source>, 2071-2073) | `bmb_cost_on()` defaults 0 (macroblock.c:6019); every B mode compared on raw SATD |
| D4 | chroma in the mode screen | added to direct and to L0/L1/Bi under `b_chroma_me` (default 1) | luma only on both sides (macroblock.c:7592, 7637) |
| D5 | B_SKIP acceptance | one SSD-vs-`(6λ₂+128)>>8` test, then RD | a family: `probe_skip` strict/deadzone, `bskip_confirm`, `bexit_ok` + `bx_ref_admit` (macroblock.c:7511, 7673). `Y264_B_SKIP_EXIT=0` moves blue_sky only +0.39%, so not the driver |
| D6 | thread MV guard | per-MB drop against a bound from a cond_wait on every list-0 and list-1 reference (<reference-source>-371) | per-MB drop against the fixed `stair_mvy_max = 4·(16·stair_lag − 24)` (encoder.c:4623), list-0 gated on `stair_l0_clamp`, list-1 tested only for temporal (macroblock.c:7222-7240) |

Most plausible cause of the spatial deficit (15-20 points): not the
derivation. Spatial direct is a pure function of the neighbours' coded MVs, so
its quality is downstream of the B explicit search, which this tree documents
as weak (macroblock.c:7470-7500, the b_seeds / rich_seeds block: B frames
recover ~16 points under an oracle seed, P frames 2.5). Bad neighbour vectors
→ bad median → spatial loses ground that temporal, which reads a stored field,
does not. D3 and D4 are secondary: with no mb_type term and no chroma,
whichever direct vector is in play wins a wider set of macroblocks, the 86.4%
vs 75.5% census in `docs/b-direct-mode.md`. Diagnostic: re-run the spatial arm
on station2 / blue_sky at t1 with `Y264_B_SEEDS=1 Y264_RICH_SEEDS=1` forced on
the default UMH path; cross-check with `Y264_BMB_COST=1` alone.

Most plausible cause of the temporal deficit (20 points on sunflower): D1,
then D2. Sunflower is a near-static close-up under B-pyramid, so the colocated
picture is often a reference B whose field is full of list-1-only blocks. x264
refuses direct on every one and searches; we synthesise a POC-scaled vector
from a backward field on content whose motion is not coherent. Diagnostic: a
counter next to `Y264_DIRECT_WHY` (encoder.c:2325) and inside
`temporal_direct`, tallying per B frame how many sampled corners resolved
through the colocated's list-1 POC vs list-0, and how many MBs would have
returned 0 under x264's rule; then the knob and BD on sunflower. Second
instrument: `Y264_DIRECT_SCORE=1`'s per-frame direct-prediction SSD for both
modes on sunflower vs station2, paired with an `ffmpeg -debug mb_type`
B_Direct / B_Skip share census on both bitstreams (the only cross-encoder
comparison available; x264 has no MV dump).

### Design

Derivation fix list, each gated by recon-match conformance first
(`conformance.sh` serial + `recon_thread_gate.sh` for the threaded path), then
BD-rate VMAF-NEG at t1 on station2 / blue_sky / sunflower / pedestrian, 150
frames, rate-anchored via `scripts/direct_rate_table.py` (the shared-CRF point
set produced the retired −46.63%):

1. F1, `Y264_TDIR_L0ONLY` (D1). Byte-identical when off. Expect sunflower /
   riverbed / pedestrian to recover and station2 / blue_sky roughly unchanged;
   that asymmetry is the confirmation. Ship only if the four-clip median
   improves.
2. F2, the slice legality check (D2) at encoder.c:2320. The guard the AUTO
   rule needs. Expect near-null.
3. F3, the mb_type rate term (D3): flip `bmb_cost_on()` to 1 with x264's
   tables. Gate on the CRF band across the corpus.
4. F4, chroma in the B screen (D4), direct and explicit alike. Band gate; wall
   priced on their side.
5. F5, B explicit-search seeds on the UMH path. Diagnostic first; if it pays,
   a separate shippable independent of the direct question.

F1 and F2 bundle; the rest are independent.

The auto rule, shippable. What the stair clamp prevents: under the staircase a
B leaf's list-1 picture is a still-streaming reference B whose recon rows
appear behind a row watermark. Spatial direct is safe by closure (its list-1
vector is a median over MVs coded under the clamp). Temporal breaks the
closure twice. First, `mvL1 = mvL0 − mvCol` is synthesised from another
picture's field and nothing bounds it; already fixed (macroblock.c:7232-7240
tests it against `stair_mvy_max`). Second, the live blocker: temporal direct
reads the colocated picture's `colmv` field, which lands wholesale at
`stair_dpb_commit_content` and is sequenced for the next anchor by `refb_done`
but for nothing on the leaf side. That is why `Y264_STAIR_TDIR=1` reads 14/32
on `scripts/stair_determ.sh` while recon-match passes (recon-match decodes
whatever each run built; structurally blind, `docs/b-direct-mode.md:759-793`).

x264 has the identical constraint and not the second problem: its loop
(<reference-source>-364) iterates `for i = (i_type == B); i >= 0; i--`, cond-waiting
on list 1 as well as list 0 to `pix_y + i_mv_range_thread` rows once per MB
row. One wait covers the colocated picture's pixels and its motion field
because both are published by the same row-progress counter. Temporal stays
usable because failure is per-macroblock, not per-slice, and the bound is
generous (≈ height/threads/2) rather than a fixed small lag.

Proposal: publish colmv on the row watermark. Commit the reference B's colmv /
colpoc / colref rows incrementally, keyed to the same watermark
`stair_trailer_task` already advances for recon rows, instead of once at
`stair_dpb_commit_content`. Then a leaf-side gate in the direct derivation:
before sampling a corner at MB row r, require the list-1 producer's published
row ≥ r + stair_lag. The soundness argument is the one at encoder.c:1115-1140:
the bound transfers by identity of the producer function, since a reference B
under BDEPTH runs `stair_trailer_task` verbatim. With that in place the
mvL0/mvL1 tests already in `analyze_b_mb` suffice and `stair_direct_blocks`
(encoder.c:1014) can be deleted rather than narrowed. The auto rule then ships
in its existing shape (encoder.c:2286-2310: fold, decay at 9/10 past the MB
count, take the higher; `f->dauto_acc` atomic per-frame adds); its determinism
argument is x264's (counts folded in coding order, which the W2 frame pipeline
preserves and `fw->dauto_valid` hands through at burst launch). F2 is its
precondition.

Gate, in order, none skippable: (1) `scripts/stair_determ.sh` 32/32 at
t4/t12/t18 with TDIR and auto armed, before any wall or BD number; (2)
`recon_thread_gate.sh` on blue_sky_1080p at t4/t12/t18; (3) wall at t12 vs the
spatial baseline on blue_sky low-rate and riverbed high-rate, target ≤ 1.05x;
(4) BD at t1 on the six 1080p clips plus the twelve gate clips, rate-anchored,
auto within ~2 points of per-clip best and no gate-corpus regression.

Fallback if (1) still fails: decide per shot in the lookahead, carrying x264's
own skippability score, never a content-feature model (closed negative,
`docs/b-direct-mode.md:600`).

## Appendix A4: the CRF quality outliers, what the tree already knows

Read-only study, 2026-09-02. BD numbers are VMAF-NEG vs x264 medium unless
marked self-A/B; negative = we win.

### bus_cif (+5.9% CRF, board dVMAF −0.60..−0.76)

The oldest open outlier, and the only one where the mechanism has been pinned
rather than guessed. The lone loss in the deep band (+4.22,
`deep-band-is-won`), +5.7% at the standing 88-94 band
(`docs/parity-review-2026-09-01.md:19`), +5.9% on the review's wide read but
flagged near-saturation, and −0.72 dVMAF at +0.3% dsize on every board tier
(`local/records/board-2026-09-02.log`): a genuine quality deficit at matched
bits, not a rate artefact.

Refuted with evidence, do not reopen: mb-tree / allocation (per-MB QP
transplant from x264 recovered nothing, +11.07 vs +11.61,
`bus-base-coding-floor`); ME / search, partition economy, skip share, effort
(matching x264's partition distribution buys ~1%; yah264 veryslow vs x264
medium is still +6-9% and widens vs x264 veryslow); MV rate premium (our MV
bits 1.4-2.6x theirs, 53.7% vs 37.4% of P bits at qp48) closed as bought
quality (rects OFF reads +1.0..+3.75% across six clips; est-CABAC model
accurate at 1.003/1.012, `bus-track-opened`); reference-chain inheritance
(hf_join qp48 skip/skip MSE 314.9 vs 314.2); per-MB lambda; leaf mb-tree
offsets (x264 <reference-source> uses `f_qp_offset_aq` on non-ref too, no
asymmetry); psy classes (bus is neither flat nor calm; constant psy 1.2 reads
bus +1.76); psy-rd 2.0 flip (board bus −1.72 → −1.61 only).

What survives: a uniform ~3-4 point AC-retention deficit on every hf_join cell
at equal-or-better MSE (skip/skip 0.621 vs 0.648, inter/inter 0.691 vs 0.721,
our coded MSE ahead 507.6 vs 533.1). "We buy MSE, x264 buys texture" survives
only on this clip. Second open address: the mb-tree differential
(frametype_gap at matched size: I +2.33, P +0.19, B −1.81; mb-tree off both
sides collapses all to −0.50).

Trap: bus's standing band is degenerate, 84.3 → 94.6 → 99.6 in single CRF
steps, "whole band one step wide" (`quality-lead-does-not-hold`). Every bus BD
this session carries `[!] near-saturation`. The board dVMAF at 426 kbit/s is
the sounder instrument, not the band BD.

Diagnostic sequence: work item D2 to D5. Ranked hypotheses: (1) RD-metric /
texture floor, the innovation-spike texture-preserving-RD question,
Fable-tier; (2) the mb-tree differential on B frames (~0.8 VMAF of the gap);
(3) RDOQ lambda calibration (x264 runs trellis on 0.85² inter / 0.65² intra,
we pass one `lambda_mode(qp)` at all nine RDOQ sites,
`hf-mechanism-repinned`), the only knob-shaped arm, partially spent (Q1
trellis intra-lambda shipped). Do not build a new bus probe before D2: three
of the last four bus rounds ended "no defect".

### sita_720p (+12.4% CRF, +35.7% ABR), hand-drawn 2D

Best-decomposed of the four. The intra path is ahead (all-intra −4.75%,
`docs/animation-content.md:116`); the whole deficit is inter. Original split:
P-only +4.35, bframes 3 +10.73 (:116-119).

P half found, fixed, shipped: frame-level mode-decision lambda under mb-tree
modulation (we priced modes / ME once per slice at the frame QP while mb-tree
modulates per-MB QP, so we skipped exactly the MBs mb-tree paid to code).
`Y264_MB_LAMBDA=5` shipped default c7b70e1: bands −2.06/−2.81, sita +10.66 →
+5.89, wall free (`sita-p-half-is-mbtree-lambda`). Post-flip P-only is −3.51%
ahead.

B half closed as a knob question: the remaining +7.76 is B frames at the
starved band (380-480 kbit/s, qp ~40-44). Refuted: `Y264_CRF_PBSCALE=0`
+14.73; `Y264_MB_LAMBDA=7` +2.16 (the census signature is a symptom, not a
recipe, third confirmation); PBSCALE=2.0 wins sita (−2.59) but ducks +9.98 /
touchdown +6.12; the QP-gate escape refuted (coastguard loses at its own
high-QP rungs): the split is content, not regime (`sita-b-half-closed`).
Exonerated, don't re-run: AQ (0.0/0.2/0.6/0.8 swept, best alternative
−0.25%), duplicate frames, intra, the skip-exit family.

Still open: `Y264_DIRECT_AUTO` reads sita −4.7 (a funding decision, item C6);
`--bframes 7` was −1.01% on sintel and the re-cut `--tune animation` shipped
for bbb / sintel, but sita post-dates it and was never re-measured under it
(`parity-review:174` flags this). Sequence: work item D6.

### bbb10s_1080p (+8.3% CRF vs bbb_720p −18.6%)

Read this first: `bbb10s_1080p_o120` is not a gate clip.
`docs/corpus-sources.md:149-153` says the `bbb{10,15,30}s_1080p_o120` and
`perseverance_*` windows exist only to be timed at a matched CRF point through
`ffboard.py`, with no class and no calibrated operating point, and :155 says
both sources are already-compressed H.264, "which is the reason these carry no
BD claim". The +8.3 is `(sat)`-flagged and bbb_720p's −18.6 is `(sat)` too. So
the headline compares a saturated read on a calibrated clip against a
saturated read on a clip the tree forbids BD claims for, at an uncalibrated
point, on a re-encoded source.

What is solid about bbb: its 1.48x wall gap is entirely single-thread content
cost (bbb 1.48x t1 → 1.47x auto; perseverance 1.33 → 1.44),
`bbb-is-single-thread-content-cost`. Mechanism: 54% of eventual-skip B MBs
escape early skip-accept and run the full tournament vs samsung's 19% (P side
56% vs 28%, `docs/animation-plan.md:121-125`). bbb is also the one payer for
the MB_LAMBDA=5 flip (+3.14 at its band). Direct mode is not it: bbb10s
temporal vs spatial +0.3, DIRECT_AUTO −2.0, the smallest swing of any 1080p
clip. Sequence: work item D8.

### riverbed_1080p (+3.4% CRF, sat)

Water at the edge of noise, calibrated at 12500 kbit/s
(`corpus-sources.md:101`). The +3.4 is `(sat)`-flagged; the earlier +2.40
(`quality-lead-is-a-720p-result`) came from a 34-46 ladder that
`docs/b-direct-mode.md:838` shows is far below its operating point. The
`--bframes 0` decomposition puts B frames at only +0.7 of it, so it is a
base-path question (with crowd_run, the only 1080p clip that is).

The base-path screen (2026-09-01, `local/records/basepath-nob-2026-09-01.log`,
`docs/b-direct-mode.md:826-834`), both sides `--bframes 0`, CRF 34-46:

| arm | riverbed |
|---|--:|
| control | +1.02% (the brief's +3.09 does not reproduce) |
| `--ref 1` | +1.97 |
| `aq-strength 0` | −2.35 |
| mb-tree off | +1.86 |
| psy-rd off | +0.98 |
| `--preset veryslow` | +8.66 (ladder placement, not a regression) |

Ranked hypothesis: AQ misallocation on uniformly textured content. Water is
textured everywhere, so a variance / AC-energy quantizer has nothing to
redistribute toward; a dense crowd has flat regions and prefers AQ on
(crowd_run +0.10 with AQ off). Calibration history: aq-mode 2 was adopted
because flat-strength AQ regressed moving-camera texture clips (bus /
coastguard / tempete) at every strength (`aq-default-calibration`); riverbed
is the same family and was never in that sweep. Counter-evidence on effort:
on riverbed x264 does the extra work (46% of P macroblocks intra with a full
search each) and riverbed is the board cell where we win on speed, 0.72-0.83x.
Sequence: work item D1.

### psy-rd 2.0 and aq 0.4: were they checked on 1080p or hand-drawn content?

No, and the tree says so. psy-rd 2.0 was swept and shipped 08-20 on the
12-clip band corpus (`psy-rd-2-shipped`: "corpus CRF band −0.17% median, 7/12
negative; deep band wash"); that corpus is 7 CIF / 4 × 720p / 1 × 1080p, so
the 1080p evidence is touchdown alone, and there was no hand-drawn clip until
sita arrived later. The only animation psy reads transfer x264's constants
onto bbb: psy-rd 0.4 +1.10%, psy-rd 1.0 +0.69% (`docs/animation-plan.md:81`),
so moving toward x264 medium's 1.0 is measurably worse on CGI. Never tested on
sita; `animation-plan.md:167` states "re-test psy-rd only if a 2D clip lands
AND shows ringing", the 2D clip landed and this was never done. aq 0.4 /
aq-mode 2 was calibrated 2026-07-10 on 7 CIF clips at CRF 32/38/44/50. Zero
1080p, zero animation. Later swept on both animation clips: aq 0.6
+1.00/+5.93, aq 0.2 +2.23/−3.73, aq 0 +6.81 bbb / −6.86 sintel, a symmetric
13.7-point split (`animation-plan.md:92-96`). On sita 0.4 is near-optimal; on
riverbed AQ off wins by 3.4 points.

Cost of a per-class re-check: 2 knobs × 4 settings × 6 clips × 4 points = 192
encodes, 6-10 h. Screen form: 2 × 3 × 4 = 96 encodes, ~4 h, then
`bd_at_rate.py` on anything that separates (work item D7). Gate for a default:
`ARM='Y264_PSY_RD=…' scripts/band_at_rate.py` within ~0.3% median, `BANDS=deep`
inside ±1.2. Gate for a content-gated form: the inert setting byte-identical
before any number is trusted (the mode-5 non-ref-B leak cost a whole round),
priced at t12.

Two doc corrections: `docs/fable-b-path-brief.md:151` ("riverbed / crowd_run
3-4% behind without B") is contradicted by the screen (+1.0 / −2.2); any
quotation of bbb10s_1080p's +8.3% conflicts with `corpus-sources.md:155`.

## Appendix A5: the lookahead lead and threaded CPU work

Read-only study, 2026-09-02. x264 references: `encoder/lookahead.c`,
`<reference-source>`, `encoder/encoder.c`, `<reference-source>`; ours
`src/encoder/encoder.c`, `src/common/threadpool.c`.

### x264: how the lookahead is decoupled and why its threaded CPU stays flat

Decoupling. With `i_sync_lookahead > 0` a single extra `x264_t` clone
(`x264_lookahead_init`, the clone is `thread[i_threads]` with its own MB
cache) runs `lookahead_thread`. Three ring buffers (`ifbuf` / `next` /
`ofbuf`), each a mutex + two condvars. The API thread only pushes into
`ifbuf`; the lookahead thread drains `ifbuf → next` and, only when
`next.i_size > i_slicetype_length`, runs one `lookahead_slicetype_decide`,
shifting a whole mini-GOP into `ofbuf`; the encoder blocks in
`x264_lookahead_get_frames` on `ofbuf.cv_fill` only when `frames.current[0]`
is empty (encoder.c:3446), once per mini-GOP at worst. Back-pressure is
symmetric. Depths: `ifbuf = sync_lookahead + 3`, `next` / `ofbuf` = `i_delay +
3`. The delay budget is additive (encoder.c:1604-1613): base window = max(B
delay, `rc.i_lookahead`); + `thread_frames − 1`; + `sync_lookahead`; + vfr.
`sync_lookahead` defaults to `bframe + 1` and is forced to 0 when
`thread_frames == 1` (encoder.c:1137-1143): the lead exists to feed frame
threading and buys pure input latency, no bits.

Costs computed once, keyed by (p0, p1, b). `slicetype_frame_cost` opens with a
memo check on `fenc->i_cost_est[b−p0][p1−b]` (<reference-source>) and returns on
a hit. Each list has its own memo: `do_search[l]` is set only if
`lowres_mvs[l][d][0][0] == 0x7FFF` (the never-searched sentinel, :855-856); a
searched leg stamps the sentinel away, so the same leg is never re-searched
for a different b. `slicetype_mb_cost` writes the per-MB result once into
`lowres_costs[b−p0][p1−b][xy]` with `list_used` packed in the top bits (:790).
`macroblock_tree` (:1108) therefore does no motion search of its own: it calls
`slicetype_frame_cost` for each bracket (memo hit or at most a single-list
search), then `macroblock_tree_propagate` (:1068) reads `lowres_mvs`,
`lowres_costs` and `i_intra_cost` and scatters through two vectorised kernels;
`<reference-internal>` converts to `f_qp_offset`. When mb-tree moves the
quantisers x264 does not re-run lookahead: `slicetype_frame_cost_recalculate`
(:999) re-sums the cached costs under the new offsets. Our tree measured that
propagation at 39 ms against our 438 ms on samsung t1
(`mbtree-phasea-duplication`).

Threading of the walk: none. `macroblock_tree` and both propagate kernels are
serial on the lookahead thread; parallelism is inside `slicetype_frame_cost`,
which splits the frame into `i_lookahead_threads` horizontal slices
(:899-930; auto width at encoder.c:1273-1300).

Frame threads. Each of `i_threads` clones is a full `x264_t` copy with its own
fdec, MB cache, scratch, bitstream and NAL array (encoder.c:1757-1790); state
moves forward by copy. Duplicated per thread is state, not work: the lookahead
runs once for the stream and its cached costs are read by whichever frame
thread encodes the frame (`x264_rc_analyse_slice`, <reference-source>). The
reference wait is row-based: <reference-source> calls
`x264_frame_cond_wait(fref->orig, pix_y + i_mv_range_thread)` once per MB row
and clamps the vertical MV range; encoder.c:2491 broadcasts
`i_lines_completed` per row. That is why x264's per-unit CPU inflation is
small (1.28x foreman t12, 1.31x samsung, 1.26x ducks t18, against our 1.62 /
1.58 / 1.40, `goal3-width-is-cpu-not-idle`): no work is replicated per thread
and frame threads share reference planes, so x264 threaded sits at or below
its own N-independent-process self-load floor (`bench/width_selfload.py`)
while we sit 15-27% above ours.

### yah264: where our threaded CPU goes that x264's does not

(a) The walk's own CPU. t12 sunflower_1080p, 811 ms wall: driver in
`compute_mbtree` 389 ms with the pool 82% busy. `Y264_MBT_SPLIT`: Phase A 281
ms (259 after the subpel-cache fix), Phase B 73 ms serial, finish 22 ms.
Phase A (`mbt_pa_source`, encoder.c:6255) is one row-serial job per source,
~8 sources per call on 12 workers, fanned out by `ntp_parallel_for`
(encoder.c:7008). After the SAD integer search (7dacb39) and anchor-leg reuse
(ff240f6) our lookahead SATD fell 9.5G → ~1.5G pixels and total 18.1G → 10.0G,
below x264's 11.6G. Phase A's residual is ~1.6G SATD pixels, now dominated by
the reuse evaluations themselves: every reusing block still runs a 3-candidate
`blk8_satd_qp` eval (stored leg MV, chained predictor, zero) per leg
(encoder.c:6447 list 0, :6497 list 1), plus the 29 anchors + 85 leaves per
encode that fall through to a full diamond. Phase B is the order-locked
scatter, closed to vectorisation and relocation twice.

(b) The remaining duplication, and the lead. `la_lead_for` (encoder.c:3707)
resolves the lead: env `Y264_LA_BUF`, else `param.sync_lookahead`, else
`bframes + 1` when `wf_width_for(param) >= la_pool_min()` (default 2,
encoder.c:1477). `la_cap = la_depth + la_buf`, clamped to `Y264_LA_CAP_MAX =
80` (encoder.h:33). The walk waits to a fixed chain step, `pop_seq + la_depth
− 1` (`la_th_wait_mbtree`, ~encoder.c:9520; issued at :6928 under
`Y264_MBT_SETTLE_WAIT`), and Phase A trusts a leg only when `src[s].laoff <=
settled_off`, `settled_off = la_depth − 4 − bframes` (:6942). The full-drain
arm made every source reuse (Phase A 222 → 120 ms) but cost 206 ms of driver
wait, walk 325 → 425 ms, walls flat or worse (`settled-bound-is-the-lead`).
The design point: the unsettled legs are not computed yet, so deepening the
wait pays for the chain's latency; giving the chain more lead makes the same
legs already exist. Nothing in the tree has swept the lead above 4 on a
correct wait; the one large-lead datum (`LA_BUF=16` = 202 ms) was taken with
the broken `la_th_wait_all` and is void. Separately, the CLI splits
`--threads` across GOP workers, so at default keyint each worker opens its own
encoder and lookahead chain; x264 runs one lookahead for the stream.

(c) Wavefront per-row overhead. `ntp_wavefront` claims rows under the pool
mutex, oldest-runnable-job-first, with an external `row_ready` gate
(threadpool.c:360, 610). Idle is attributed by why nothing was claimable
(gate / ramp / tail / nojob, :94-98, :624-641). `Y264_NTP_PROF` prints
per-worker busy / midrow / spin / gate / ramp / tail / nojob as percentages of
workers × lifetime (:1331-1372), a pool-empty line for serial phases and a
per-unit pool-mutex line (:1443). Real CPU, not sleep: the row and join spins
(`Y264_NTP_SPIN*`, default 25 µs, :209-274) and the mutex taken twice per
unit: spin 363 ms + contended mutex 271 ms of 5041 ms CPU at t18 on foreman,
35 399 units; the mutex is 2.2% of CPU at t12. The idle spin is already 0
(zeroing it dropped CPU 13-28% on CIF at no wall cost); zeroing the row / join
spins costs 13-15% of wall.

(d) CPI. Measured: instructions t1 → auto 0.94x while cycles are 1.48x; at t1
we run 1.53x x264's instructions and win on IPC 5.52 vs 4.01, and threaded our
IPC collapses 36% vs their 12% (`auto-threads-is-work-volume`). Also measured:
stage inflation is selective (`lookahead_fme` +145%, `analyze_Bcb` +55%,
`analyze_Pcb` +33%, `mbtree_srcA` flat at −2%): the reference-streaming
stages inflate, the compact-array stage does not. Assumed, never measured:
cache / TLB counters, the DPB hpel-plane footprint as a function of frames in
flight, false sharing.

### Design: work-deleting levers, ranked

See work item E (E1 trust the stored leg cost; E2 raise the lead with the
settled bound; E3 cut per-unit pool-mutex traffic; E4 size the CPI loss
first). Not to build: the B-side of the P-skip class (B tournament at parity
on the failing clips; the 11.2% of t1 wall in the B eventual-skip class is an
animation number; perfect-oracle ceiling 6-10% at the reachable post-ref0
point; kill-test offline against `Y264_BLATE_STAT` first if revisited, price
at t12).
