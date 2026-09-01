# Brief: a fresh parity review, assuming we got things wrong

Prepared 2026-09-01 for a frontier-tier session. This is a **review brief, not a
work order.** Its premise is that the project's own documents — this one
included — contain errors, and that the current priority ordering may be wrong.

## The question

**Where does yah264 actually stand against x264, and what is the shortest
credible path to parity in the places it lags?** Specifically:

1. **Higher resolutions.** The quality lead is claimed to be a 720p result:
   720p median −13.9% (6/6 ahead), 1080p +0.4% (3/6). Is that still true, is it
   quality or speed or both, and what causes it?
2. **ABR against CRF.** ABR lags CRF badly. Verified today on park_joy_720p at
   **matched bits** (sizes within 0.005%): CRF 1.153 s, ABR 1.315 s — ABR
   **14% slower for identical output size**. The board reads goal-3 CRF 0.99x
   against ABR 1.41x. ABR/CBR is the mode streaming uses, and streaming input
   is an owner requirement.
3. **Content classes.** Animation, high-entropy, and static content are each
   claimed to behave differently, sometimes with opposite sign. Which of those
   claims survive?
4. **Anything else we lag that nobody has named.**

## Why this is being run fresh, and what that means for the docs

The tree carries ~45 design docs, 100+ result docs, 199 `Y264_*` knobs and ~120
harness scripts, accumulated over months of sessions. **Treat every claim in
them as a hypothesis with a citation, not as a fact.** Three concrete failures
found in the hours before this brief was written:

- **`docs/model-usage.md` and `docs/endgame-plan.md` do not exist.** Both are
  referenced by `CLAUDE.md` as authorities. The instructions file itself has
  dangling references.
- **`docs/STATUS.md` — the "read this first" document — is stale.** It describes
  the pure-C-floor era ("canonical benchmark: 3.0x vs x264", "no SIMD work until
  pure-C is at 1x") and does not mention the G1/G2/G3 goal framework the boards
  and memory now use.
- **`docs/b-direct-mode.md` carried a mechanism narrative that is falsified**
  ("order the six clips by motion coherence and you get the delta column" — three
  new clips of the same content type went the other way, two by more than nine
  points), and its `Y264_DIRECT_SCORE` tables were measured on an encoder that
  was seeding some searches from uninitialised stack memory.

That last one matters beyond the one doc: **every `--direct temporal`
measurement in the tree taken before 2026-09-01 came from a non-reproducible
encoder.** Ask what else was measured in that window.

**The same scepticism applies to this brief.** Its numbers are cited so they can
be checked; check them.

## What must be re-derived rather than trusted

- **Which harness produced a number.** `scripts/ffboard.py` (in-process, via
  ffmpeg, one encoder for the whole window) and the CLI (one encoder per GOP)
  disagree by 0.05–0.16 on the same question, and a documented "regression" once
  turned out to be that difference. `ffboard.py` also hardcodes its own copy of
  the clip set that `scripts/parity-clips.sh` exists to centralise, and the two
  diverged on 2026-08-31.
- **Which band.** station2 reads −46.63% on a shared CRF point set and −31.86%
  rate-anchored — the same clip, the same arm, 15 points apart. A 1080p number
  without its band is not a number.
- **Whether the operating point saturates.** VMAF-NEG above ~95 stops
  discriminating; some published rows sit there.
- **Whether the config could engage the thing being measured.** A knob measured
  on a config that cannot engage it reads exactly like a knob that does not
  work. This cost a round today, from a doc section that already warned about it.
- **Speed parity and quality parity are different questions** and the word
  "performance" has been used for both. Separate them per resolution and per RC
  mode before drawing any conclusion.

## The current team's task list — a hypothesis to test, not a queue

Handed over deliberately so the review can **disagree with it**. Do not treat
the ordering as given; the point of the review is partly to check whether this
ranking is right.

1. `Y264_RCP_LAG=1` accuracy half — it closes 46% of the ABR wall gap at matched
   bits (verified today, below) and is gated on ABR rate accuracy, not wall.
2. The 1080p quality question, reopened — see below.
3. Eventual-skip, ME side (6.0% B + 5.3% P), `Y264_ME_ETSTAT`, untouched.
4. Re-measure the `Y264_DIRECT_SCORE` tables (pre-fix encoder, different band).
5. The ~54% of ABR's excess pool-idle not yet attributed to a stage.
6. Base-path leads needing matched-rate confirmation: aq-strength splits by
   content, `--ref 1` worth 1.9 on crowd_run.

**Two of these exist because a plan failed today**, which is the kind of thing
worth weighing when deciding whether the list is well-ordered.

## What was settled today, with numbers that were verified

These are the freshest results and the least likely to be wrong; they are also a
worked example of the standard the review should hold other claims to.

**The B-direct nondeterminism was an uninitialised `struct direct_mv`** whose
partly-written contents seeded the motion searches. Fixed; `Y264_DIRECT_PERMB`
now defaults on at every thread count. Byte-identity vs `77c8b46` 32/32 on the
shipped default, conformance 602/602, `stair_determ` 48/48 under load where the
old build read 0/32. Worth −19.3 (station2) and −23.0 (blue_sky) BD points, with
**+37.3 on sunflower as the control** — so it is per-content, not a flip.

**The per-shot direct selector is closed negative.** A lookahead signal separated
the 16 labelled clips at Spearman −0.76, then went **0 for 3** on pre-registered
predictions (rho +0.000 within one instrument). The in-sample fit rested on two
positive examples, and leave-one-out could not see that. **With a rare positive
class, resampling is not validation — only new positives are.**

**The ABR gap is width, not the drain.** `Y264_STAIR_STAT` in one run: ABR gets
0 wide launches, 0 concurrent bursts, 56 slot-recycle waits; CRF gets 62, 3, 0.
`Y264_RCP_LAG=1` flips that to 59/3/0 and closes **46% of the wall gap at
matched bits** (ABR/CRF 1.141 → 1.076). The knob already exists and is already
fixed; it is gated on the ABR accuracy half, which nobody has run.

## State of the tree at handoff

- **#94 and #95 are MERGED** (`b47dcb6`, `de9ddb4`); `main` carries the direct
  fix and flip, the closed-negative selector, and the ABR width finding. The
  tree is clean and every gate below was re-run on the merged result.
- **A code review of #94 found the review-worthy thing before it merged**, and
  it is worth knowing as a standard: the `lrvote` instrument -- written to study
  an uninitialised read -- contained one, reading a co-located motion field
  guarded by the wrong block's `lists_used`. The conclusion drawn from it was
  then **re-derived on the fixed instrument** rather than assumed to survive
  (every vote share moved by at most 0.0003, no ordering changed). Findings that
  do not change an answer still have to be checked against it.
- Goals as memory records them: G1 and G2 met, G3 open on two speed metrics —
  **but `docs/STATUS.md` does not say this**, so establish the real current
  reading before planning against it.
- The twelve newer HD clips are **fetched but not promoted**; `parity-clips.sh`
  and the band ladders still describe the old corpus, so every published number
  is still the old picture. Promoting any of them re-medians everything and is
  an owner decision.

## Instruments that exist — read the catalog before building anything

**`docs/instruments.md` is the curated list**, organised by the question each
answers, with the traps that have each cost a round. The recurring failure mode
in this tree is a session spending its first hour rebuilding a profiler, an
oracle or an A/B harness that already exists under a forgotten name.

Highest-value for this review: `Y264_STAIR_STAT` (engagement, one run, answers
"could this config even do the thing"), `Y264_THREAD_PROF` + `Y264_NTP_PROF`
(per-stage wall with a pool-idle column — but its buckets have lied four times,
so corroborate), `scripts/bd_at_rate.py` and `scripts/band_at_rate.py` (BD at
matched achieved bitrate, which matters for anything that moves the CRF map),
`scripts/ffboard.py` (the board the published goals quote),
`bench/lowrate/abr_noise.py` (the ABR band's per-clip noise floor — an ABR row
smaller than that floor is not evidence), `scripts/determ_repeat.sh` and
`scripts/stair_determ.sh` (repetition gates; both take `ARGS=` for the mode
under test, and running them only on the defaults is how a defect survived a
week of green gates).

## Owner-gated — do not spend the session on them

Firing CI, promoting corpus clips, repeat goal boards, the GitHub Pages source,
the nextgpu `rescued-searchq` push, and any default flip. Three arms are already
built, gated off and waiting on a decision rather than on engineering:
`Y264_RC_PIPE_VBV`, `Y264_ABR_RF`, and now `Y264_RCP_LAG`. Surface them with
their numbers; do not decide them.

## What a good outcome looks like

Not a restatement of the docs. Specifically:

- **A verified current scoreboard** — speed and quality, separated, per
  resolution and per RC mode, each cell naming its harness and band, with the
  spread attached. Where a published number does not reproduce, say so.
- **A ranked list of the real gaps**, sized, with the evidence for each size and
  an explicit note where a size is a guess.
- **A judgement on the existing task list** — which items survive, which were
  mis-ranked, which are dead ends.
- **At least one structural question asked that nobody here has asked**, because
  the point of a fresh pair of eyes is the thing the incumbents stopped seeing.
- **A written list of the claims in the docs that turned out to be wrong**, so
  the corrections land rather than staying in one session's context.
