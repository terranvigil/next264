---
title: yah264
description: An H.264/AVC encoder project.
---

# yah264

An H.264/AVC encoder.

The goal is to build a fast H.264 encoder that I will use and adapt for experimental encoding optimization projects.

We are using x264 as a performance and quality baseline.

## Status

Compared to x264 on a ten-clip board with 1080p in it, multi-threaded pure C leads (0.85x), the shipped NEON build sits at 0.97x, and single-threaded pure C at 1.01x. The open item is the same on every row: low-bitrate 1080p, where the worst clip runs 1.24 to 1.29x against a 1.15x bar. High-bitrate 1080p is where we are fastest.

Criteria for performance (goal 3 still open):

| metric | bar |
|---|---|
| median speed | 1.00x or faster |
| worst-clip speed | under 1.15x |
| quality | within 0.5 VMAF |
| compression | within 1.0% size |

Current performance (three CIF, four 720p, three 1080p; 2026-09-02):

| goal | configuration | median | max | VMAF | size | status |
|---|---|--:|--:|--:|--:|---|
| 1 | pure C, single-threaded | 1.01x | 1.29x | +0.26 | +0.1% | worst clip over the bar |
| 2 | pure C, multi-threaded | **0.85x** | 1.14x | +0.21 | +0.1% | all metrics pass |
| 3 | as-shipped SIMD, multi-threaded | **0.97x** | 1.24x | +0.23 | +0.1% | worst clip over the bar |

Big caveat: At 1080p, row 3 reads 1.28x to 1.47x. At CIF we keep 9 cores busy where x264 uses 6. Our lead goes away as soon as the frame is large enough for both encoders to consume every core. Give row 3 a single thread and it is behind at every resolution, 1.16x at CIF and 1.30x at 1080p, because our SIMD loses to x264's hand-written assembly. Row 1 is the pure C tier, where we are ahead.

| goal | configuration | median | max | VMAF | size |
|---|---|--:|--:|--:|--:|
| 1 | pure C, single-threaded | 1.02x | 1.20x | −0.27 | +2.8% |
| 2 | pure C, multi-threaded | 1.19x | 1.31x | +0.30 | +2.9% |
| 3 | as-shipped SIMD, multi-threaded | 1.40x | 1.52x | +0.31 | +2.9% |

Quality is measured with full-frame [VMAF](https://en.wikipedia.org/wiki/Video_Multimethod_Assessment_Fusion) at matched bitrates. yah264 excels at low bitrates. The lead fades higher up the range. See [Results](results.md) for the details and how to reproduce them.

## Start here

- **[How video encoding works](encoding.md)**: the concepts every codec shares.
- **[Getting started](start.md)**: how to build and run yah264 and what the
  presets do.
