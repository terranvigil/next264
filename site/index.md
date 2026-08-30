---
title: yah264
description: An H.264/AVC encoder project.
---

# yah264

An H.264/AVC encoder.

The goal is to build a fast H.264 encoder that I will use and adapt for experimental encoding optimization projects.

We are using x264 as a performance and quality baseline.

## Status

Compared to x264, we currently lead with pure C, and our shipped NEON build ties it on small clips but runs noticeably slower at 1080p. Our SIMD still loses to x264's hand-written assembly in those cases. This is expected. It's pretty amazing what the authors were able to do there.

Criteria for performance (goal 3 still open):

| metric | bar |
|---|---|
| median speed | 1.00x or faster |
| worst-clip speed | under 1.15x |
| quality | within 0.5 VMAF |
| compression | within 1.0% size |

Current performance (CIF and 720p):

| goal | configuration | median | max | VMAF | size | status |
|---|---|--:|--:|--:|--:|---|
| 1 | pure C, single-threaded | **0.95x** | 1.04x | +0.00 | +0.1% | all metrics pass |
| 2 | pure C, multi-threaded | **0.85x** | 0.96x | −0.08 | +0.2% | all metrics pass |
| 3 | as-shipped SIMD, multi-threaded | 0.96x | 1.14x | −0.07 | +0.2% | all metrics pass 33% of runs |

Big caveat: At 1080p, row 3 reads 1.28x to 1.47x. At CIF we keep 9 cores busy where x264 uses 6. Our lead goes away as soon as the frame is large enough for both encoders to fill every core. We're lagging in paralellism here.

| goal | configuration | median | max | VMAF | size |
|---|---|--:|--:|--:|--:|
| 1 | pure C, single-threaded | 1.02x | 1.20x | −0.27 | +2.8% |
| 2 | pure C, multi-threaded | 1.19x | 1.31x | +0.30 | +2.9% |
| 3 | as-shipped SIMD, multi-threaded | 1.40x | 1.52x | +0.31 | +2.9% |

Quality is measured with full-frame VMAF at matched bitrates. yah264 excels at low bitrates. The lead fades higher up the range. See [Results](results.md) for the details and how to reproduce them.

## Start here

- **[How video encoding works](encoding.md)**: the concepts every codec shares.
- **[How H.264 works](how-h264-works.html)**: an explainer of the format and
  each coding tool.
- **[Getting started](start.md)**: how to build and run yah264 and what the
  presets do.
- **[Design](design.md)**: the pipeline, threading, rate control and the
  conformance gate.
- **[Methodology](methodology.md)**: how the AI loop worked.
- **[Story](story.md)**: how the project got here.
