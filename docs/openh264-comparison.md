# openh264 measured (P3)

2026-08-22. Cisco openh264 built from source at 98bc7cb, measured through this
tree's existing harnesses via `scripts/openh264-shim.sh`. Every number here is
ours, produced on this box, and reproducible from the recipes below.

Goals context: unchanged by this work. G1 MET (0.96x), G2 MET (0.91x), G3's
1.06x SIMD MT median is still the one open number.

## The result in one line

openh264 is **fast and far behind on quality**: roughly 5.5x the speed of x264
in pure-C single-thread and ~1.3x at 12 threads with SIMD, while needing
**+63.7% more bitrate for the same VMAF**. It is a different design point, not
a weaker implementation of the same one, and the row has to say so.

## Speed (openh264 / x264 wall time; lower = openh264 faster)

Same convention as the goal table -- 1.00 means parity with x264, below 1.00
means faster. Five CIF clips, matched 500 kbps ABR, interleaved timing,
RUNS=3.

| configuration | median | range |
|---|--:|---|
| pure C, 1 thread | **0.18x** | 0.14 - 0.21 |
| pure C, 12 threads | **0.76x** | 0.58 - 0.83 |
| as-shipped SIMD, 12 threads | **0.78x** | 0.68 - 0.82 |

The single-thread gap (5.5x) collapses to ~1.3x at 12 threads: x264
parallelises far better than openh264's slice threading on CIF, which has only
18 MB rows to divide.

## Quality (BD-rate vs x264, both with B-frames OFF)

`scripts/bdcompare.py --vmaf`, QP ladder 32/38/44/50 (bus 38/44/48/51 --
see the saturation note), 120 frames.

| clip | BD-rate (VMAF) | BD-rate (VMAF-NEG) |
|---|--:|--:|
| akiyo_cif | +20.96% | +19.70% |
| mobile_cif | +31.16% | +30.90% |
| foreman_cif | +63.69% | +63.13% |
| stefan_cif | +73.71% | +72.30% |
| bus_cif | +95.27% | +96.77% |
| **median** | **+63.69%** | **+63.13%** |

Positive = openh264 needs that much more bitrate for the same score.

## Why the comparison is configured the way it is

**B-frames off on x264.** openh264 has no B-frame support at all. Left at
x264's defaults the comparison would mostly measure that missing tool rather
than anything about the two implementations, so x264 runs `--bframes 0` for
every number above. This flatters openh264 and it is still the honest way to
run it.

**Matched rate, not matched QP number.** The first speed pass compared at a
shared QP/CRF *number*, which is meaningless across encoders: openh264 at QP32
emitted 194 KiB against x264's 62 KiB, so it was doing ~3x the coefficient
work and read as slow. The harness's own size-mismatch warning caught it. All
speed numbers here are matched-bitrate ABR.

**Saturation.** The first BD ladder (26/32/38/44) drove three clips past
VMAF 99, where BD-rate stops being meaningful -- bus returned a degenerate
-99.99%. Re-run at 32/38/44/50, and bus again at 38/44/48/51, all clips clear
the flag. Both readings agreed for bus (+95.68 saturated, +95.27 clean), so
the conclusion was robust, but the numbers quoted are the clean ones.

## Two traps this measurement hit, both silent

**openh264 skips frames under rate pressure, by default.** At 500 kbps on
stefan it delivered 82 of 90 frames. Every later frame is then misaligned
against the reference and VMAF collapses -- bus read -73.5, mobile -77.9,
stefan -84.6, numbers that look like catastrophic quality loss and are really
a frame-count mismatch. `-fs 0` disables it; with skipping off the same clips
read -18.9, -5.3, -14.2. Neither of the other two encoders can skip frames, so
leaving the default on compares videos of different lengths.

**A shim can bill its own setup to the encoder it wraps.** The first version of
`openh264-shim.sh` called `ffprobe -count_frames` per invocation to get the
frame count. That decodes the entire clip, inside perf-comp's timed region.
It moved foreman from "1.30x slower than x264" to "1.25x faster" -- a 1.6x
swing, larger than the effect being measured. Frame count now comes from the
cached raw file's size, which is exact for I420 and free.

## Reproducing

```sh
# build both openh264 arms (asm and a genuine pure-C one)
git clone --depth 1 https://github.com/cisco/openh264.git ../openh264
cd ../openh264 && make -j8 ARCH=arm64 h264enc && cp h264enc h264enc-asm
make clean && make -j8 ARCH=arm64 USE_ASM=No h264enc && cp h264enc h264enc-noasm

# quality
python3 scripts/bdcompare.py \
 --a 'scripts/openh264-shim.sh --qp {q} -o {out} {src}' \
 --b '../x264/x264-asm --qp {q} --bframes 0 --preset medium --keyint 250 --demuxer y4m -o {out} {src}' \
 --vmaf --points 32,38,44,50 --clips foreman_cif,mobile_cif,akiyo_cif,stefan_cif --frames 120

# speed (PURE_C=1 and OPENH264=.../h264enc-noasm for the pure-C rows)
YAH264=scripts/openh264-shim.sh YAH264_ARGS="--cabac --bitrate 500" \
X264_ARGS="--bframes 0 --preset medium --bitrate 500" THREADS=12 RUNS=3 \
scripts/perf-comp.sh tests/corpus/foreman_cif.y4m 32 4
```

openh264's build carries no `-fno-tree-vectorize`, so its pure-C arm is
already fair by the rule that applies to x264 (docs/instruments.md, "the fair
build"). Verified the two arms differ: 0.0247s asm vs 0.0435s pure C on the
foreman pilot.
