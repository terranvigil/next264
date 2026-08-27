# Content adaptivity: why our cost floor does not fall on easy content, and the plan

2026-08-27, Fable round, owner-directed. The question came from the bbb
comparison: at matched bits we are 1.87x x264's instructions on bbb (the
easiest board clip) against 1.27x on ducks (the hardest), and the wall ratio
tracks that exactly. x264 sheds work on easy content much harder than we do.
This document is the deep-research answer: what x264's shedding machinery
actually is (read from source), where ours differs (measured two-sided with
per-stage instruments), and the ranked arms with ceilings and kill criteria.

Every number below is measured on this machine at the solved matched operating
points (bbb n 25.34 / x 26.21, ducks n 23.03 / x 21.01), 60 frames, t1, our
side `N264_BPROF=1` (309-line stage attribution), their side the
`xbprof.patch` fair build (`X264_BPROF=1`, vectorized C + asm per the
instruments doc). GPL boundary per CONTRIBUTING rule 6: what crosses back is
mechanism descriptions and calibration numbers, never code.

## 1. The headline: the gap is the TAIL, not the search and not an early commit

Analysis-domain collapse, easy/hard (lower = sheds harder):

    next264  (475.1+434.5) / (589.6+771.3) = 0.67
    x264      638.8 / 1384.6               = 0.46

Per-MB cost inside the tournament, bbb, EVENTUAL-SKIP B macroblocks (the 70%
population that escapes our early probe and still ends as skip):

| stage | next264 | x264 | ratio |
|---|--:|--:|--:|
| ME (us/MB) | 1.13 | 0.92 | **1.2x — near parity** |
| RD (us/MB) | 0.95 | 0.32 | **3.0x** |
| skip probe (us/MB, every B MB) | 0.54 | 0.19 | **2.8x** |
| intra analysis touched | 28.4% of MBs | 3.9% | **7.4x** |

P side, bbb: inter-RD 4.5x per MB (1.34 vs 0.30 us), ME only 1.4x. So on both
slice types the shedding we lack is in the DECISION TAIL — RD trials, intra
admission, probe cost — while the motion search is already competitive.

**Three tempting theories are refuted by measurement, do not revisit:**

- **x264's entry skip-commit is NOT their shedder.** At mbrd their entry bound
  is `bskip_ssd <= (6*lambda2+128)>>8` (analyse.c ~3350: skip commits when its
  distortion is under the minimum RD cost of ANY coded MB — 6 bits, the CAVLC
  floor). Sounds like the answer; it is not. On bbb their own B_SKIP verdicts
  nearly all went THROUGH analysis (79,673 of 79,776 ran ME), so the entry
  commit caught ~nothing on this content — and ported into our RD domain it
  covers ~0% of our escapees too (`N264_FLATSKIP_STAT` RD-floor sweep: 100%
  precision at 0.0% coverage at 6 bits; 97.7% at 1.2% coverage at 12; 95.3% at
  10.0% at 24). Our bdist is psy-inflated (psy 2.0 shipped) and the probe
  already removed the exact-residual population. The floor is real but tiny on
  both sides.
- **B ME probe count is near parity** (1.13 vs 0.92 us/MB). The ME-early-out
  rescue space is also already closed on the P side (me-early-out-refused).
  No ME arm.
- **Flatness is not a signal.** Texture energy is non-monotone against the
  skip verdict (96.3 -> 83.8 -> 58.9 -> 68.3%, 76% of the population in the
  68% bucket). Measured 08-27, ae2960a. Only skip DISTORTION is monotone.

## 2. What x264's ladder actually does (encoder/analyse.c, read 08-27)

For a B macroblock at medium (subme 7 = mbrd 1), in order:

1. Direct MC + `i_bskip_cost = ssd_mb()`; commit B_SKIP iff under the 6-bit
   RD floor (~catches nothing on our content, see above), else keep the MC
   (`b_skip_mc`) so it is not redone.
2. Direct SATD, then 16x16 ME: L1 ref0, L0 ref0, rest — with, at subme 3-5
   only, a mid-ME B_SKIP commit when both searched MVs land within +-1 of the
   direct MV (~1900-1961). Inactive at medium.
3. **THE SHEDDER — the 33/32 early terminate (~3405):** if
   `cost16x16direct <= best_inter_cost * 33/32`, run RD on the direct form
   NOW, compare `i_bskip_cost` against the RD costs, and if skip wins COMMIT
   AND RETURN — skipping partitions, sub-8x8, 16x8/8x16, qpel-RD refinement,
   and all intra. On easy content direct is nearly always competitive, so the
   whole tail vanishes: their RD averages 0.32us/MB and intra is touched on
   3.9% of skip-verdict MBs. This single gate is most of the 0.46 collapse.
4. **`b_fast_intra` (~446-458):** intra analysis is admitted only when a
   neighbour is intra, the colocated MB was intra, or the running frame intra
   count is high; otherwise intra SATD thresholds tighten
   (`i16x16_thresh_lut`, scaled by subme). Content-keyed, not tuned per clip.
5. Partition descent gates: 8x8 only when its cost estimate is competitive
   with 16x16 (`i_thresh16x8` from neighbour mv costs, ~3096-3113);
   `i_halfpel_thresh` skips subpel for uncompetitive refs.

Also real but out of scope for this plan: b-adapt placed ~20% fewer B MBs than
us on bbb (122,400 vs 152,945 in 60 frames) — their frame TYPER is itself
content-adaptive. `N264_TYPE_ORACLE` already measured their placement as
+1.64% wall for us, so this is not free money; noted, not an arm.

## 3. The arms, ranked

### Arm A — B tail truncation at the direct-competitive gate (the centerpiece)

x264's mechanism 3, in our tournament's terms: after the SATD phase, when the
direct/skip form's SATD is within 33/32 of the best inter SATD, stop EXPANDING
— run RD on the direct form and the current best only, then decide. No
partitions, no B_8x8, no intra, no s4 tail for that MB. Scope includes
REFERENCE Bs, which is where our late-skip population sits (the shipped
mid-tournament exit is non-ref-only, and its BXSTAT shows 24.3% of B MBs
blocked ONLY by the ref rule).

This is not the refused "exit when skip is winning" arm: the output can still
be direct or inter 16x16 — it only refuses to widen the candidate set when
direct is competitive, which is an ordering the RD itself then confirms.

- **Target stages (bbb, eventual-skip Bs):** rd-surv 0.95 -> ~0.35 us/MB,
  intra 28.4% -> ~5%, s4-tail, plus the same shape on ducks' DIRECT class.
- **Ceiling:** tournament share of the escapee tail is ~26% of analysis;
  the truncated form keeps ~40% of it. Estimate **6-9% of easy-clip t1 wall,
  3-5% at auto**, samsung and bbb rows first. Wall-grade A/B decides.
- **Gates:** BD both animation kinds (bbb + sita) AND akiyo + sintel ABR (the
  temporal-propagation canaries that killed the earlier exits) AND mobile +
  tempete (the high-band residual canaries). `recon_thread_gate.sh`,
  `determ_repeat.sh` under load, full board with work column.
- **Kill:** BD-NEG median worse than +0.30% on the canary set, or the wall
  win under 2% on both easy clips at auto.

### Arm B — b_fast_intra analog (cheap, independent)

Their predicate, ours to port behaviorally: admit the B/P intra probe only
when a neighbour or colocated MB is intra or the frame's running intra rate is
high. Targets B intra 25.9ms + P-skip intra 19.7ms + P-inter intra 10.0ms on
bbb ≈ **~2% of easy-clip wall**. Orthogonal to Arm A (fires on inter-verdict
MBs too). Same BD gates. Kill: BD worse than +0.15% median or intra-verdict
MBs measurably misclassified (BPROF INTRA row count moves).

### Arm C — probe cost, bit-exact tier only

Our early probe is a full per-block DCT+quant(+trellis) on every B MB
(0.54us); theirs is one SSD then a DCT probe on candidates. A pre-test that
skips our probe when `bdist_x` (already computed) is far above any passable
level is pure speed IF the probe verdict is provably unchanged — gate each
candidate bound on byte-identity across the corpus, ship only the bound that
is md5-clean 12/12. Ceiling small (**~1% of wall**); do it only if A lands and
the probe share grows in the after-profile.

### Arm D — RD per-trial cost parity (measure, likely refuse)

Even truncated, our per-trial RD reads 3-4.5x theirs per MB on easy content.
Before touching anything: attribute one trial (est path) against coefficient
count on bbb vs ducks. If the gap is TRIAL COUNT, Arm A already collects it.
If it is per-trial cost, that is the est-path — round 16 declared it terminal
after structure was harvested, and this measurement does not reopen it without
a new mechanism. Expected outcome: documented, refused.

### Arm E — M6 early-skip surrogate (unchanged, re-size after A)

The 26%-of-analysis ceiling banked 08-27 shrinks by whatever A collects; the
supervised route stays the answer for the population A's SATD gate cannot
separate. Method per docs/archive/ml-training-method.md; BVI-AOM only.

## 4. Order of work and the standing rules that bind it

1. Arm A behind `N264_B_TAIL33` (default off), byte-identical off. Wall A/B at
   t1 AND auto (the lowres lesson: the sign can flip with thread count), then
   the BD battery, then the board.
2. Arm B behind `N264_FAST_INTRA_GATE`, same discipline, can overlap A's BD
   runs (different files, same battery).
3. Re-profile both sides after A+B (the two-sided per-stage table above is the
   before-photo; regenerating it is two commands, both instruments exist).
4. Arm C/D measurements only if the after-profile still shows their stages.
5. Ship decisions clip-set-wide, never per-clip; every arm's numbers land in
   this doc's revision history.

Instruments used (all pre-existing or landed 08-27): `N264_BPROF`,
`N264_FLATSKIP_STAT` (+ RD-floor sweep), `xbprof.patch`, `scripts/ffboard.py`
work column, `instr-ratio.sh`. Nothing new needs building to execute this
plan.

The cross-check that closes the loop: after A+B, the bbb work ratio at auto
should read ~1.30-1.35x (from 1.53x) and the analysis collapse ratio should
move from 0.67 toward ~0.55. If it does not, the residual is the est-path bin
content and the b-adapt placement gap, both of which are documented trades —
and this line of work is done.
