# yah264: where we are

Read this first when picking work back up. It's the single current-state and
what's-next pointer; the deep design lives in the docs it links to.

## Current state: pure-C speed at 3.0x, floor verdict reached

The #1 owner priority is **pure-C (scalar, no-SIMD) yah264 `--preset medium` ==
x264 medium encode speed**. No SIMD work until pure-C is at 1x. Main points:

- **Canonical benchmark: 3.0x vs x264** (samsung_720p, 180f, `--crf 30`,
  `--threads 1`, both encoders pure-C via x264 `--disable-asm`). Same algorithm
  both sides (medium = hex), so it's apples-to-apples.
- **Quality is ~0.5% VMAF-NEG ahead of x264 medium.** That's the crux: yah264's
  extra ME probes find MVs x264 misses, so they're quality-load-bearing.
- **Verdict: pure-C medium == x264 medium at matched quality is NOT reachable.**
  Five independent ME-probe-cut attempts are exhausted (uniform-cheap,
  lowres-oracle gate, frame-motion score, partition early-term,
  graduated-UMH-radius). Every BD-safe cut either doesn't apply to the hex path
  `medium` uses, or regresses below x264 on hard motion. Floor ~2.0x. The
  constraint that makes 1x impossible is exactly *pure-C + matched quality +
  no-SIMD*; the encoder runs fine WITH SIMD, which is the intended production
  path.
- **The SIMD tier has two deficits of its own** (`docs/board-2026-08-28.md`).
  Held to one thread it runs 1.16x to 1.30x slower than x264 across CIF, 720p
  and 1080p, so the shipped path has never been at parity on equal cores.
  Threads add another 0.14 to 0.33 of CPU work on our side, worst at CIF. The
  table's sub-parity CIF rows come from filling more cores than x264 does.
  Nobody has costed the parallel overhead, and it is the piece with no owner.

**Owner direction: the architectural bet, not more chipping.** Lookahead-driven
**per-MB pre-decision** uses the already-computed mb-tree motion field to spend
full analysis only on "hard" MBs and cheap analysis on easy ones, so the MBs
where the finds live keep full search (speed at neutral quality). It has to
differ from the parked adaptive-ME cut, which found no BD-safe UMH cut
(docs/adaptive-me-design.md); the open question is how x264/x265/SVT feed
lookahead cost into full-res analysis.

## The gate

**BD-rate ≤ 0 vs x264 (VMAF-NEG) + conformance clean + determinism.**
Byte-identity (encoded `.264` md5 unchanged) is NOT required. It's a cheap
proof-of-no-harm for mechanical wins only (caching, memoization, dead-work
removal). The 2-3x-class levers necessarily change the bitstream; they live
under the BD gate. Don't over-constrain to byte-identical changes; that leaves
the big BD-neutral moves on the table.

## Shipped on the speed track (all gated: BD-neutral + conformance 249/249 + determinism)

- **B two-partition economy**: bi-pred cache (byte-identical) plus x264-style
  orientation early-terminate (BD-neutral, 7 clips). 3.3x → **3.0x**.
- **mb-tree lowres-ME memoization**: yah264 re-ran the whole future-window
  lowres ME per anchor (O(window²)); memoizing per-source per lookahead-ring
  entry makes it O(window). compute_mbtree -75%, byte-identical, +9%. It also
  proved the ABR "+0.84" is NOT a separable rate-control pass (ABR and CRF share
  the lookahead; the extra is residual/RD scaling with bitrate).
- **CAT4/CAT8 quant lookup tables**: byte-identical, ~2.6% off the shared P+B
  quant path.
- **Correctness fixes**: mb-tree OOM calloc (determinism) and deblock edge-QP
  Clip3, both byte-identical. They came out of a full audit that found no live
  bug and verified the CABAC context derivation spec-correct.
- **Subpel economy, HPEL plane cache, stage profiler**: shipped at quality
  parity; the profiler is `src/common/stgprof.{h,c}` (`-DY264_STAGE_PROF`).

A ground-truth `sample` profile settled "where is the 3x": it is
**distributed** (SATD ~1363 / ME ~1035 / transform-quant ~734 / trellis ~723 /
MC ~579 / intra ~397 self-samples; no single 2x function), and **B-frame
encoding is ~63% of frame work**. The P-path is already x264-lean at medium.

## Ranked remaining levers (BD-gated, pure-C, no-SIMD)

1. **P-path residual RD per-call cost**, the top of the non-architectural list.
   inter_rd is 43% of P-analyze; the count is x264-minimal (1.24 RD/MB), so the
   gap is PER-CALL. Op-ledger: **trellis 2-3.4x, dq/idct ~2x per MB**, a per-op
   efficiency gap rather than a quality gap, largely byte-identical if it yields
   the same coeffs. Biggest single mechanical target.
2. **The architectural bet** above, lookahead-driven per-MB pre-decision.

Stacking byte-identical chips will NOT reach 1x; that needs a ~3x total cut. Two
thirds of wall-clock is either work x264 doesn't do per MB or scalar kernels
costing 2-3x per op. Both are closable at matched quality, and neither needs
SIMD.

## Solid ground (not in flux)

- **Threading (row wavefront), default.** Full pass-1 analysis (I/P/B, CAVLC and
  CABAC) runs on an in-frame row-wavefront, ~**4.4-5x on 8 threads**.
  `--threads N` splits the budget into GOP-workers × in-frame threads, so even a
  single-GOP clip scales. Gates: `--threads 1` byte-identical to the serial
  build; threaded output deterministic (`--threads 4 == --threads 8`);
  TSan-clean. BD-neutral vs serial (predecessor plus WPP pricing, the standard
  threading trade). A serial nondeterminism (uninitialized co-located MV grid)
  was root-caused and fixed. Design: docs/threading-wavefront-design.md.
- **Format breadth, complete.** 10-bit, 4:2:2 and 4:4:4 all done (I/P/B, CAVLC
  and CABAC); only 4:4:4 8×8-transform is deferred. docs/chroma-format-plan.md.
- **Conformance: 249/249 (468/468 full), recon-match clean.**
- **CRF calibration** follows x264's ME-compensated lowres signal;
  base/slope/cap are env-overridable (`Y264_CRF_BASE/SLOPE/CAP`).

## Build / verify

`make` (build), `make test` (fast unit tests), `make repro` (re-encode, assert
byte-identical to `make golden`), `make bench` (serial vs threaded), `make vmaf`
(absolute VMAF/VMAF-NEG), `make conformance` (recon-match), `make perf-comp-purec`
(the canonical pure-C head-to-head vs x264). Golden lives in `tests/.golden/`
(gitignored, per-machine; run `make golden` once).

## Standing rules (don't relearn these the hard way)

- Never ship a regression. Gate quality on **VMAF-NEG** BD, speed on both scalar
  and NEON (`YAH264_NO_ASM=1`); a C win SIMD masks still matters.
- Every threading change: byte-identical `--threads 1` vs HEAD **and** threaded
  == serial, **and** TSan. Reproduce with `make repro`.
- Other encoders are baselines measured from the outside, never source to work
  from. `CONTRIBUTING.md` has the rule and what it does and does not permit.
