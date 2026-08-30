---
title: Story - yah264
description: Why this exists, what the goals were in order, and where it went sideways.
---

# The story

## Why build this

There are already strong H.264 encoders and replacing them was never the point.
My first reason was to understand the coding tools the format provides, and how
each one trades speed against quality. Reading about a deblocking filter and
implementing one that has to reconstruct bit-exactly are different activities,
and only the second one teaches you anything.

The second reason is the more interesting one. H.264 is a decoder
specification. It fixes what a conformant bitstream decodes to and says nothing
about how the encoder chose it. Every decision on the encoder side is therefore
open, while every decoder already deployed keeps working. That is an unusual
amount of freedom for a format this old and this widely deployed, and it is the
part worth exploring.

## The goals came in layers

The order matters, because each layer had to prove something before the next one
opened.

**Pure C first.** Reach x264's compression and get within reach of its speed
using nothing but portable C. This is the honest baseline, because SIMD is opt-in
on runtime detection, and an encoder that is only fast with
it is not fast.

**Then SIMD.** NEON today, with every kernel validated against the C reference,
so the C path is never allowed to rot.

**Then the GPU.** The embarrassingly parallel stages behind the same correctness
gate.

**Then past x264.** Shot-aware, lookahead-driven, per-title encoding, which is
the class of technique a single-clip encoder cannot reach.

The north star is stated plainly so that it can be measured: be the fastest
open-source H.264 encoder at equal or better quality. That is the goal. It is not a claim about today.

## Where it went sideways

Three things did not go the way I assumed they would.

The GPU layer opened and then closed again. A per-process Metal floor of 12 to
17 milliseconds is charged to every board cell, which is more than the lookahead
work it would have offloaded. The library is built and validated, the encoder
option to link it exists and defaults to off, and the arm sits there waiting for
a use whose granularity is large enough to pay that floor.

The speed goal turned out to be two different questions wearing one number. At
CIF, yah264 fills more cores than x264 does and comes in under parity. Held to a
single thread, the same clip is slower. So the sub-parity rows are partly real
efficiency and partly occupancy, and separating them took a good deal longer
than producing the original number did.

The third one was methodological. Several early comparisons were decided by
instruments that could not resolve the margin being argued about, and a few
rounds of work went into differences that were inside the noise. Most of the measurement
discipline on the [methodology](methodology.md) page was written after I got
caught by that.

## What the AI part actually looked like

The hand-optimized assembly asymmetry is the clearest single finding. Writing
assembly means scheduling instructions and allocating registers yourself, across
thousands of lines, against one processor's timing. Current models do that
badly. They handle SIMD intrinsics well, where the same parallelism is expressed
in C and the compiler schedules it. So the SIMD tier here is intrinsics, and part
of the remaining speed gap against x264 is the price of that choice, not a
gap in the algorithm.

The other finding is less about capability. Almost every wrong turn was a
measurement error and not a coding error, and the gates caught the coding
errors immediately. That ratio is the argument for building the instruments
first.

## What is still open

- Goal 3's median, which needs to repeat across separate sessions instead of
  reading well once.
- x86-64 SIMD, which does not exist yet.
- A decoder, which does not exist yet and would be a separate binary.
- Shot-based encoding, where the per-shot quality and tool decisions belong in
  the encoder and the resolution ladder belongs above it. The shot detector and
  per-shot encoding are built; the hooks that would make yah264 the best engine
  under a per-title layer are not.
