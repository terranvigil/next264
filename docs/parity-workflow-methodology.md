# Parity-work methodology

Process that worked on the parity push. It is codec-agnostic: this is about
*how to work a parity problem fast and honestly*, not about specific coding
tools.

## 1. Multi-agent worktree fan-out for independent items

For a batch of independent parity items, spawn one agent per item in its own
git **worktree**. Each agent studies the reference encoder's *approach*
(algorithm, not code), implements original code, gates it, and returns a
**patch only if it measurably wins**. The parent integrates winners one at a
time (build, gate, commit), resolving overlaps. This lands several wins per
batch in parallel and keeps the heavy build/measurement tool-output out of the
parent context.

- Worktree setup each agent needs: symlink the gitignored corpus
  (`ln -sfn <main>/tests/corpus tests/corpus`), `meson setup build`, set the
  VMAF env vars. Save a baseline binary *before* editing for BD comparison.
- Agents must NOT push or edit shared docs; return the diff. Parent integrates.

## 2. Diagnose before you re-implement (read-only fan-out)

Before retrying a feature that failed, run a **read-only** agent fan-out that
compares our logic against the reference encoder's for each failed item and
returns root-cause plus direction. This converted ~10 dead ends into specific
missed mechanisms (e.g. "IPPP mb-tree fps_factor is a red herring at CFR; the
real damper is lambda·MV-rate in the propagation fraction"). Cheap, parallel,
no blast radius. Do it whenever a lever keeps losing.

## 3. Licence discipline

The reference encoders are GPL; this project is BSD-2. Study the **algorithm**
(public descriptions, spec, papers, and a facts-only formula log), write
**original** C. Never paste or transcribe reference source.

## 4. VMAF: use it correctly

- **VMAF-NEG is the primary CRF quality gate**, not plain VMAF. NEG discounts
  enhancement and sharpening, so it doesn't reward spending bits on large flat
  regions the way plain VMAF does. A correct mb-tree/AQ reallocation (bits off
  flat backgrounds onto motion) *loses* on plain VMAF but *wins* on NEG. NEG is
  the honest metric. Report both; gate on NEG.
- **Measure in VMAF's discriminating band (~55-95), not the pinned 95-100 top.**
  On small content (CIF) low CRFs saturate VMAF near 100, where BD-rate is noisy
  and can numerically overflow. Pick CRF points that put scores in ~55-95
  (CIF: ~26-44). Warn or refuse if the top point >= 98.
- **`--subsample N`** (libvmaf) computes VMAF on every Nth frame, ~Nx faster
  with negligible BD change. Default 5 for sweeps; drop to 1 only for a final
  confirm.
- Caveat: VMAF models assume ~1080p viewing, so scoring native low-res is
  off-methodology in absolute terms but acceptable for *relative* A-vs-B on the
  same content. For an absolute number, scale both to 1080p first.

## 5. BD-gate discipline

Quality features ship ONLY on a measured BD-rate win (robust sweep: >=5 points,
>=120 frames; lean 3-point sweeps sign-flip on fit noise). Every negative result
is **reverted and logged** with its root cause, so it is never silently
re-tried. Recon-safe coding tools gate on CQP PSNR; RC and perceptual features
gate on CRF VMAF-NEG. Never ship a regression.

## 6. The feature checklist is a PROXY, measure the real number

A "% of features present" scorecard overstates quality parity. The real metric
is **direct BD-rate vs the reference encoder at matched settings** on a
representative corpus. Here the checklist said 93% while the direct
CRF-VMAF-NEG BD vs x264 medium was ~9% behind, motion-dominated. Drive the
*direct BD toward <= 0*; treat the checklist as a to-do list, not the goal.

## 7. The gate corpus is often the bottleneck, not the code

Some features can't be *measured* on a narrow corpus. b-adapt looked "broken"
through three attempts because the reference encoder itself keeps the fixed
cadence on the smooth-motion test clips: our baseline already matched the
optimum. b-adapt only pays off on **variable-motion / scene-change / flash**
content that wasn't in the corpus. Before concluding a feature is broken, ask
whether the corpus can even show its benefit; add gap-exposing clips (erratic
motion, grain, screen content, zoom) early.

## 8. Parallelize the conformance gate

The recon-match gate runs constantly, so make it fast: fan the independent
clip x QP checks across cores with `xargs -P` (bash-3.2 safe), cache generated
fixtures (generate-if-missing), add a `--fast` dev mode (fewer QPs, short
clips, skip belt-and-suspenders probes). Pin recon encodes to `--threads 1` so
the job pool owns the parallelism, not N encoders each spawning N threads.
