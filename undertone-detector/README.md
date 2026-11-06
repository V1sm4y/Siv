# Undertone detector

Working prototype of the smart-mirror skin measurement described in the
"Smart Mirror: Skin Undertone Detection" brief. It measures **depth** (`L*`,
ITA) and a **continuous warm-to-cool position** (hue angle), gates the capture
on quality, and scores garments against a palette.

See [`architecture.md`](architecture.md) for the component map, data flow,
accuracy/repeatability discussion, and full run instructions.

It does **not** claim to classify a scientific "undertone". Undertone is a
styling concept with no standard definition and no large public labeled
dataset, so the output is a measured position plus a confidence score. The
customer's swatch pick always decides.

## Install

```powershell
pip install -e .
# optional, for reading image files:
pip install pillow
```

Only NumPy is required. The package does not use scikit-image, OpenCV, or
MediaPipe, so the color math, CIEDE2000, skin heuristic, and k-means all run
out of the box.

## Quick start

```powershell
# Synthetic face: proves the whole pipeline without a camera or dataset
python -m undertone demo

# Same, full JSON
python -m undertone demo --json

# Real image with a gray reference patch at x=20 y=20 w=60 h=60
python -m undertone analyze face.png --patch 20 20 60 60 --tier ideal

# Same, but locate the neutral patch automatically
python -m undertone analyze face.png --auto-patch --tier ideal

# Check whether a neutral patch can be found, without measuring skin
python -m undertone detect-patch face.png

# Flash/no-flash pair (LEDs off, then on)
python -m undertone pair off.png on.png --patch 20 20 60 60

# Fit warm/cool anchors from labelled swatch picks (CSV: L,a,b,label)
python -m undertone calibrate labels.csv --output warmcool.json --eval heldout.csv

# Analyze with those fitted anchors
python -m undertone analyze face.png --calibration warmcool.json --tier ideal

# Camera capture test without hardware (repeatability, not accuracy)
python -m undertone camera --synthetic

# Synthetic flash/no-flash plus three store-light casts
python -m undertone camera --synthetic --pairs --lighting-check

# Real camera: lock exposure/gain/WB, then capture a burst
python -m undertone camera --index 0 --tier ideal --patch 20 20 60 60

# Real camera, find the patch from a probe frame instead of passing coordinates
python -m undertone camera --index 0 --tier ideal --auto-patch

# Real camera flash/no-flash; prompts the operator to toggle the LEDs
python -m undertone camera --index 0 --pairs --patch 20 20 60 60

# Live preview window: draws L*, ITA, hue, warm-cool and the gate on the frame
python -m undertone live --index 0 --mirror
python -m undertone live --index 0 --auto-patch
python -m undertone live --synthetic
```

Example output:

```
Undertone measurement (synthetic demo)
  Depth      L*=54.1  ITA=11.5 deg  (tan; palette medium)
  Warm-cool  hue=61.4 deg  score=+0.53  -> warm
  Confidence 0.96 (high); confirmation: always_confirm
  Quality    pass
  Palette    cream, terracotta, rust, mustard, warm olive, tomato, chocolate, gold
```

## What is measured

| Quantity | Source | Meaning |
| --- | --- | --- |
| `L*` | CIELAB median after trimming | Depth / lightness |
| `ITA` | `atan((L* - 50) / b*)` | Standard depth angle; higher = lighter |
| `hue` | `atan2(b*, a*)` | Warm-to-cool direction: lower = pinker/cooler, higher = yellower/warmer |
| `chroma` | `hypot(a*, b*)` | Color strength; low chroma lowers confidence |
| `score` | `(hue - 55) / 12`, clipped to [-1, 1] | Continuous position; `+` warm, `-` cool |
| `hue_std` | circular spread across regions | Measurement uncertainty; large means the face disagreed |
| `score_ci95` | `score +/- 1.96 * hue_std / hue_span` | Approximate 95% interval for the position |
| `stable` | CI does not cross the neutral band | `false` means a small error could flip the label |
| `z` | optional reference mean/std | Position relative to a store's own customers |

The neutral band is **presentation**, not a validated cutoff. Defaults live in
`AnalysisConfig` (`neutral_hue=55`, `hue_span=12`, `neutral_band=0.25`, so the
neutral band is roughly hue 52-58 degrees). Change them only with your own
labeled data, or let `undertone calibrate` fit them for you.

### How accurate is it?

There is no universal accuracy figure. Warm/cool is a styling label with no
standard definition and no public ground truth, so any global "X% accurate"
number would be invented. The honest numbers come from **your own labelled
swatch data**:

```powershell
python -m undertone calibrate labels.csv --eval heldout.csv
```

This reports plain and balanced accuracy, per-class recall, a confusion matrix,
and the continuous score error on the held-out file. Without labels, the
predictor is a robust measurement with an uncertainty estimate, not a validated
classifier. The customer's swatch pick still decides.


## Pipeline

1. **Decode and linearize.** Input is gamma-encoded sRGB. All measurement math
   happens in linear RGB, then XYZ, then CIELAB. `rgb2lab` is not used because
   it would apply gamma a second time to linear input.
2. **Reference white balance (optional).** A gray patch gives per-channel
   gains. The pre-correction cast is measured with CIEDE2000 and used by the
   gate, so a severely tinted patch is rejected rather than silently "fixed".
   Pass `--patch x y w h`, or `--auto-patch` to detect a low-chroma, uniform
   rectangle in the frame border (use a white/gray card, not the mirror glass).
   Detection also requires contrast against the surrounding ring, rejects
   elongated or edge-touching regions, falls back to edge-based quadrilateral
   detection when the card sits on a neutral wall, and confirms the rectangle
   across consecutive frames before using it in live mode.
3. **Skin mask and regions.** Default fallback is a conservative YCbCr mask
   plus largest-component cleanup. Measurement samples forehead, left/right
   cheek, and jaw, so lips/eyes/brows are excluded by region geometry.
4. **Robust features.** Median LAB over the 20th-80th percentile of `L*`
   (medians and trimming resist tan lines, shine, and outliers).
5. **Quality gate.** Rejects clipping, too few pixels, brightness extremes,
   low chroma, strong patch cast, uneven hue/L across regions, and (for pairs)
   a low LED-to-ambient ratio. Clipping is measured on the sampled skin
   regions, not the whole frame, so a dark background or bright window does not
   fail an otherwise good capture. Each failure code maps to a short
   operator hint (`failure_hints`) in the CLI, live view, and API.
6. **Position and confidence.** Per-region hues are fused with a circular
   median that drops a disagreeing region, then combined into a pixel-weighted
   mean. The hue is optionally corrected for the depth trend, mapped to a
   continuous score, and given a 95% interval. A label is only `stable` when
   that interval does not cross the neutral band. Confidence combines pixel
   count, region agreement, clipping, chroma, and patch cast.
7. **Calibration (optional).** `undertone calibrate` fits `neutral_hue`,
   `hue_span`, `neutral_band`, and the depth slope on labelled swatch picks and
   writes a JSON file usable with `--calibration`. Held-out evaluation gives the
   only accuracy number that is not invented.
8. **Human in the loop.** Minimum tier always requires swatch confirmation and
   labels the result an estimate. Ideal tier can show a high-confidence, stable
   result directly. A failed gate returns swatch-only mode.
9. **Palette.** Warm/cool/neutral x light/medium/deep starter table in
   `undertone/data/palette.json`. Replace it with a stylist-approved table.

### Flash/no-flash

`analyze_pair_srgb` white-balances each frame, computes
`I_LED = max(I_on - I_off, 0)` in linear RGB, measures the difference, and
gates on `LED luminance / ambient luminance`. Camera exposure, gain, and white
balance must be locked; set exposure to a multiple of 10 ms on 50 Hz mains to
avoid flicker banding.

## Camera capture test

`undertone.camera` implements the fixed-capture setup: lock the camera, take a
burst or flash/no-flash pairs, then report **repeatability and lighting
stability** instead of accuracy. There is no labelled ground truth for
undertone, so accuracy cannot be scored.

- **Settings.** `CameraSettings` locks resolution, FPS, gain, white balance,
  autofocus, auto-exposure, and auto-WB, and rounds exposure to a whole flicker
  cycle (`flicker_safe_exposure`, `is_flicker_safe`). The default is **20 FPS**
  (50 ms exposure on 50 Hz mains, a whole flicker cycle); override with
  `--fps` if the hardware needs a different rate.
- **Real camera.** `OpenCVCamera` writes the settings and reports back what the
  backend actually applied: `locked`, `unverified`, and `unsupported`. Treat an
  unsupported control as a store that cannot run that tier. In this build,
  `exposure_seconds` is converted to **log2 seconds** on V4L2/DirectShow (the
  units those backends expect); other backends get raw seconds and stay
  `unverified`, so pass `--exposure-raw` when a driver needs a specific value.
  On Windows the capture tries DirectShow then Media Foundation and sets the
  buffer size to 1 to avoid stale frames.
- **Synthetic camera.** `SyntheticCamera` is a full `FrameSource` used by the
  tests and by `--synthetic`. It adds a linear-light store cast, ambient dimming,
  LED light, and optional per-frame drift so the gate, pair subtraction, and
  repeatability code all run without hardware.
- **Burst.** `capture_frames` discards warm-up frames and returns a locked-
  settings burst; `capture_pairs` toggles the LEDs and returns median on/off
  frames.
- **Repeatability.** `repeatability` reports circular hue std/range, `L*` std,
  ITA spread, and max CIEDE2000 from the mean. Gate-failed frames are counted
  but excluded. Limits come from `thresholds_for_tier`; the minimum tier gets a
  wider band.
- **Lighting stability.** `lighting_stability` compares the same person across
  light conditions and reports the hue shift, `L*` shift, and max delta E.
- **End to end.** `run_capture_test` combines capture, analysis, and both
  checks and returns `ok = result.ok and repeatability.passed`.

```python
from undertone import CapturePlan, OpenCVCamera, run_capture_test

with OpenCVCamera(index=0) as camera:
    outcome = run_capture_test(
        camera,
        CapturePlan(tier="ideal", frames=8, reference_patch=(20, 20, 60, 60)),
    )

print(outcome["result"]["warm_cool"])
print(outcome["repeatability"])
```

Nothing is written to disk. The real-camera LED controller is an operator
prompt; wire `capture_pairs(..., set_led=...)` to your mirror's LED GPIO or
controller for an automated test.

## Library use

```python
import numpy as np
from undertone import analyze_srgb, AnalysisConfig

image = ...  # (H, W, 3) sRGB floats in [0, 1] or uint8
result = analyze_srgb(
    image,
    reference_patch=(20, 20, 60, 60),  # or an (N, 3) sRGB array
    config=AnalysisConfig(tier="ideal"),
)

if result["ok"] and result["confidence"]["show_automatic"]:
    print(result["depth"], result["warm_cool"], result["palette"])
```

### Production face parsing

The YCbCr fallback is for demos and calibration. For retail, supply a real
face mask and face-parsing regions:

```python
config = AnalysisConfig(
    mask_provider=lambda srgb: my_face_parser_skin_mask(srgb),   # (H, W) bool
    region_provider=lambda mask: my_face_mesh_regions(mask),     # dict[str, mask]
)
```

`region_provider` should return masks named `forehead`, `left_cheek`,
`right_cheek`, and `jaw` (names flow into the quality report). MediaPipe Face
Mesh + a BiSeNet-style parsing model is the intended implementation.

## Garment matching

```python
from undertone import Palette

palette = Palette.from_json()
result = palette.score_garment(
    [{"lab": [52, 35, 35], "weight": 0.7},
     {"lab": [30, 12, 18], "weight": 0.3}],
    undertone="warm",
    depth="medium",
)
print(result["score"])  # lower is better
```

The score is the area-weighted minimum CIEDE2000 distance from each garment
color to any palette color (equation 10 in the brief). `dominant_colors()`
extracts weighted LAB clusters from a garment image with k-means.

## Calibration and hardware

- Lock white balance, exposure, and gain; disable HDR, beauty, and auto modes.
- Calibrate once per store at the mirror's real position, using a gray or
  24-patch card shot through the glass. Repeat when fixtures or bulbs change.
  `--auto-patch` finds a neutral card automatically, but a manual `--patch`
  is more predictable when there are other gray objects in view. Detection is
  geometric, not a trained color-card model.
- Mark the capture zone on the floor so distance and angle are repeatable.
- Ideal tier: high-CRI (95+, good R9) LEDs at one CCT, flash/no-flash pairs.
- Minimum tier: store lighting as-is, patch-based white balance, wider
  uncertainty, and mandatory swatch confirmation.
- No reference patch and no known lighting means no reliable color: run
  swatch-only mode.

## Evaluation

There is no public ground truth, so do not quote a universal accuracy. With
your own labelled swatch measurements you can measure it honestly:

- **Held-out accuracy:** fit on one file, evaluate on another with
  `undertone calibrate labels.csv --eval heldout.csv`. Report plain and
  balanced accuracy; balanced accuracy matters because the classes are not
  equally common.
- **Repeatability:** spread of hue and `L*` for one person across repeated
  captures (degrees and delta E).
- **Lighting stability:** shift for the same person under different lights.
- **Override rate:** how often the customer's swatch pick differs from the
  default, split by depth, lighting, and store.
- **Drift:** monitor measured values after deployment; a slow shift points to
  bulbs or camera aging.

## Privacy and legal

- Process on-device; do not store face images; do not infer unrelated
  attributes. The CLI reads an image and emits numbers only.
- For India, review the Digital Personal Data Protection Act, 2023 before
  deployment. This is not legal advice.
- Undertone-related patents exist (e.g. US 10,497,148; US 12,243,288). Get a
  freedom-to-operate review in each target market. This is not legal advice.

## Tests

```powershell
python -m pytest -q
```

Tests cover sRGB/LAB round trips, CIEDE2000 against published Sharma pairs,
white balance, region features, gates, tier behavior, flash/no-flash, palette
lookup, garment ranking, k-means dominant colors, camera capture, and
automatic reference-patch detection.

## Known limits

- The YCbCr mask is not face parsing. Backgrounds with skin-like colors and
  occlusions (glasses, hair, masks) need the production provider.
- Depth buckets and ITA class boundaries are approximate; tan/brown cutoffs
  differ across sources.
- Without calibrated labelled data, warm/cool anchors are illustrative and the
  uncertainty interval is a region-spread estimate, not a calibrated
  probability.
- The bundled palette is illustrative and not stylist-approved.
- The synthetic demo is a fixture, not evidence of real-world accuracy.
- No MediaPipe adapter is bundled because the dependency is not installed;
  the provider hooks are the intended integration point.
- The camera path is exercised only against `SyntheticCamera` in CI. OpenCV
  control names and exposure units vary by backend, so check `report()` on the
  actual mirror hardware before trusting a store's settings.

## Layout

```
undertone/
  color.py       linear RGB, CIELAB, CIEDE2000, white balance
  features.py    skin mask, regions, robust statistics
  detect.py      gates, confidence, warm-cool position, pair analysis
  palette.py     palette table, garment scoring, k-means colors
  camera.py      locked capture, flash pairs, repeatability, lighting stability
  calibration.py automatic reference-patch detection and temporal tracking
  warmcool.py    labelled-data warm/cool calibration and held-out accuracy
  live.py        live camera preview with the measurement overlay
  demo.py        synthetic face fixture
  cli.py         demo / analyze / pair / detect-patch / camera / live commands
  data/palette.json
tests/
  test_camera.py       flicker rounding, capture plans, repeatability, stability
  test_calibration.py  reference-patch detection and rejection cases
  test_warmcool.py     region fusion, uncertainty, calibration, held-out metrics
```
