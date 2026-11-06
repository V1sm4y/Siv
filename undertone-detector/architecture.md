# Architecture

Technical architecture for the smart-mirror skin measurement component. It
measures **depth** (`L*`, ITA) and a **continuous warm-to-cool position** (hue
angle), gates the capture on quality, and scores garments against a curated
palette. It does not classify a scientific "undertone"; that concept has no
standard definition and no large public labelled dataset.

## System context

```
Camera frame (sRGB)
        |
        v
+-------------------+     +-------------------+     +-------------------+
| Capture / locking | --> | White balance     | --> | Skin mask +       |
| camera.py         |     | color.py          |     | regions features  |
+-------------------+     +-------------------+     +-------------------+
                                                            |
                                                            v
+-------------------+     +-------------------+     +-------------------+
| Palette + garment | <-- | Position/conf.    | <-- | Quality gate      |
| palette.py        |     | detect.py         |     | detect.py         |
+-------------------+     +-------------------+     +-------------------+
        |                         |                         |
        v                         v                         v
  Ranked colors            L*, ITA, hue,             Pass/fail + reasons
  for the customer         warm-cool score           (fail closed)
```

Two front ends sit on top of the same pipeline:

- `undertone live` — live preview with the measurement drawn on the frame.
- `undertone camera` — fixed-capture test: locked burst or flash/no-flash
  pairs, repeatability, and lighting stability.
- `undertone analyze` / `undertone pair` — offline images and image pairs.
- `undertone detect-patch` — debug command that shows what `--auto-patch` would
  select in an image.

## Components

| Module | Responsibility |
| --- | --- |
| `undertone/color.py` | sRGB <-> linear RGB, XYZ, CIELAB, LCh, ITA, delta E 76/CIEDE2000, clipping, white-balance gains, patch cast. |
| `undertone/features.py` | YCbCr skin-mask fallback, morphology, largest component, face-region boxes, robust trimmed-median LAB, region agreement, robust circular hue fusion. |
| `undertone/detect.py` | Thresholds, quality gate, confidence, warm-to-cool position with uncertainty and depth correction, single-frame and flash/no-flash analysis, palette suggestions. |
| `undertone/palette.py` | Palette table, garment-to-palette scoring, garment ranking, LAB k-means dominant colors. |
| `undertone/warmcool.py` | Fits warm/cool anchors and the depth slope from labelled swatch data; held-out accuracy, confusion matrix, and calibration JSON. |
| `undertone/camera.py` | Capture settings, flicker-safe exposure, OpenCV camera locking/read-back, synthetic camera, burst/pair capture, repeatability, lighting stability, end-to-end capture test. |
| `undertone/calibration.py` | Automatic neutral reference-patch search: low-chroma mask, border-only region, connected components, rectangularity/uniformity/aspect/contrast scoring, edge and area rejection, edge-based quadrilateral fallback, and temporal confirmation (`PatchTracker`). |
| `undertone/live.py` | Live preview loop and overlay (text panels, mask box, patch box). |
| `undertone/demo.py` | Synthetic face fixture used by demos and tests. |
| `undertone/cli.py` | `demo`, `analyze`, `pair`, `calibrate`, `detect-patch`, `camera`, `live` commands. |
| `undertone/data/palette.json` | Starter warm/cool/neutral x light/medium/deep palette. Replace with a stylist-approved table. |

## Pipeline

### 1. Capture

`CameraSettings` fixes resolution, FPS, gain, white balance, autofocus, auto
exposure, and auto white balance. The default is 20 FPS: on 50 Hz mains that
resolves to a 50 ms exposure, exactly five flicker cycles. Exposure is always
rounded to a whole lamp flicker cycle (`1 / (2 * mains_hz)`, so 10 ms steps on
50 Hz mains) to avoid banding.

`OpenCVCamera` writes the settings and reports what the backend actually did:

- `locked` — read-back matched the requested value;
- `unverified` — the backend cannot confirm the value (common for exposure and
  auto flags, whose units/values vary by driver);
- `unsupported` — the backend rejected the control.

A store should not claim the ideal tier if critical controls are unsupported.
`SyntheticCamera` implements the same `FrameSource` protocol so the entire
capture path runs in CI with no hardware.

### 2. White balance

If a reference patch is supplied, `white_balance_gains` computes per-channel
gains that make the patch neutral in linear light. The patch cast is measured
with CIEDE2000 **before** correction and is used by the gate, so a strongly
tinted patch is rejected rather than silently "fixed". Gray-world auto white
balance is not used: skin fills most of the frame and biases it.

`--auto-patch` supplies the rectangle instead of the operator. It looks for a
low-chroma, low-texture connected component inside the frame border, then
rejects components that touch the frame edge, are too large or too elongated,
or have too little CIEDE76 contrast against their surrounding ring. Remaining
candidates are scored by area, rectangularity, uniformity, contrast, and
chroma; it returns `None` rather than a guess when nothing is plausible. If no
border candidate survives, it retries the whole frame. If the neutral mask
merges the card into a neutral wall, an edge-based fallback looks for
axis-aligned, convex quadrilaterals and re-checks the inside statistics.
Detection is geometric, not a color-card classifier, so other gray objects can
still win. `detect-patch IMAGE` shows the candidate, contrast, aspect, and
score.

Live mode and the camera probe use `PatchTracker`: a rectangle is accepted only
after appearing in consecutive checks, reused while stable, re-checked
periodically, and dropped after repeated misses. This prevents a single noisy
frame from moving or inventing the white-balance box.

### 3. Skin selection

The fallback is a conservative YCbCr mask plus morphology and largest-component
cleanup. Measurement samples four face regions: forehead, left cheek, right
cheek, and jaw, so lips, eyes, brows, hair, and glasses are excluded by
geometry. Production should replace this with MediaPipe Face Mesh plus a
BiSeNet-style face parser via `AnalysisConfig.mask_provider` and
`region_provider`; the rest of the pipeline is unchanged.

### 4. Robust LAB features

The measurement is the median LAB over pixels between the 20th and 80th
percentiles of `L*`. Trimming plus medians resist tan lines, shine, makeup, and
specular highlights. ITA is noise-sensitive in `b*`, so averaging over frames is
preferred.

```
L*      depth / lightness, 0 (black) to 100 (white)
hue     atan2(b*, a*), degrees; lower = pinker/cooler, higher = yellower/warmer
chroma  hypot(a*, b*); low chroma lowers confidence
ITA     atan((L* - 50) / b*) * 180/pi; higher = lighter
```

### 5. Quality gate

The gate fails closed. Rejections include:

- too few skin pixels;
- median `L*` outside `[25, 92]`;
- clipping above 3%;
- low chroma;
- patch color cast above 8 delta E;
- uneven hue or `L*` across regions;
- flash/no-flash LED-to-ambient ratio below 1.5.

On failure the result is swatch-only: no automatic measurement is presented.
After two in-store failures the intended behavior is swatch-pick mode only.

### 6. Position and confidence

The warm-to-cool score is a presentation scale, not a validated cutoff:

```
hue_adjusted = hue - depth_hue_slope * (L* - depth_reference_L)
score = clip((hue_adjusted - neutral_hue) / hue_span, -1, 1)
label = neutral if |score| <= neutral_band, else warm/cool by sign
```

Before scoring, the per-region hues are fused: a circular median identifies the
consensus, regions disagreeing by more than 6 degrees (or 2.5 robust sigma) are
excluded, and the survivors are combined into a pixel-weighted circular mean.
The region spread gives `hue_std`, `score_sigma`, and a 95% interval. A label is
only `stable` when that interval stays outside the neutral band; an unstable
result cannot be shown automatically even if confidence is high.

`depth_hue_slope` removes the melanin bias: darker skin has a higher `b*` and
therefore a higher raw hue. The slope is fitted within label groups on labelled
data, so it captures the hue/lightness trend without absorbing warm/cool class
differences. Defaults live in `AnalysisConfig` and should only be changed with
labelled data. `undertone calibrate` fits these anchors and writes JSON;
`--calibration` applies it. Confidence combines pixel count, region agreement,
clipping, chroma, and patch cast. Ideal tier may show a high-confidence, stable
result directly; minimum tier always requires swatch confirmation.


### 7. Palette and garments

Undertone label plus depth bucket selects a palette. Each garment color is
scored by the area-weighted minimum CIEDE2000 distance to any palette color;
lower is better. Garment colors can come from LAB/RGB fields, a reviewed
name-to-LAB table, or k-means dominant colors in LAB. Size, stock, category, and
price filters should be applied before ranking. Palette lookup and scoring are
cheap enough to run at the mirror; per-garment color extraction should be
precomputed at catalog sync.

## Camera modes

| Mode | Frames | Use |
| --- | --- | --- |
| Locked burst | 5-10 frames, locked settings, median | Minimum tier; store light as-is. |
| Flash/no-flash | 5-10 pairs, LEDs off then on, difference in linear RGB | Ideal tier; removes store light and leaves the LEDs' known light. |
| Synthetic | Generated fixture | CI, demos, and regression tests; not evidence of real accuracy. |

## Accuracy: what can and cannot be claimed

### There is no accuracy number against ground truth

Undertone is a styling concept without a standard scientific definition and
without a large public labelled dataset. Therefore this project cannot report
"X% accurate" undertone classification on its own. Any such number would be
invented. The customer's swatch pick always decides.

The one honest accuracy figure is measured on a store's own labelled swatch
data with a held-out split:

```powershell
python -m undertone calibrate labels.csv --output warmcool.json --eval heldout.csv
python -m undertone analyze face.png --calibration warmcool.json --tier ideal
```

This reports accuracy, balanced accuracy, per-class recall, a confusion matrix,
and continuous score error. Until that is run, the output is a robust
measurement with an uncertainty interval, not a validated classifier.

### What is standard and what is heuristic

| Output | Status |
| --- | --- |
| `L*`, ITA | Standard colorimetry. ITA is defined as `atan((L*-50)/b*)` and is widely used in dermatology/cosmetology. Accuracy depends on calibration, lighting, and the reference patch. |
| Hue angle / chroma | Standard CIELAB polar form. |
| Region hue fusion, `hue_std` | Robust statistics over face regions; an uncertainty estimate, not a calibrated probability. |
| Warm-to-cool position | Heuristic presentation scale. No validated hue cutoffs for cosmetic undertone. Fitted anchors and held-out accuracy require labelled data. |
| Depth correction | Removes a known melanin/lightness confound; the slope is data-fitted, not universal. |
| Confidence score | Engineering heuristic, not a calibrated probability. |
| Palette mapping | Stylist data + engineering scoring, not a validated recommendation model. |

### Repeatability of the bundled fixture

These numbers come from the **synthetic fixture** with the current code. They
show that the capture/measurement harness is stable; they are **not** real-world
accuracy.

| Check | Ideal tier | Minimum tier |
| --- | --- | --- |
| Hue std over 8 repeated frames | ~0.05 deg | ~0.05 deg |
| `L*` std over 8 frames | ~0.006 | ~0.006 |
| Max CIEDE2000 from mean | ~0.04 | ~0.04 |
| Hue shift across 3 light casts | ~0.0 deg | ~0.0 deg |
| `L*` shift across 3 light casts | ~0.3 | ~0.3 |

### What to measure on real hardware

Because accuracy cannot be scored, compare the tiers on:

1. **Repeatability** — same person, repeated captures: hue std/range, `L*` std,
   max delta E.
2. **Lighting stability** — same person under different store lights: hue shift,
   `L*` shift, max delta E.
3. **Override rate** — how often the customer's swatch pick differs from the
   mirror's default, split by depth, lighting, and store.
4. **Drift** — slow changes in measured values after deployment, which can mean
   bulbs or the camera changed.

Run:

```powershell
python -m undertone camera --index 0 --tier ideal --frames 8 --patch X Y W H
python -m undertone camera --index 0 --tier ideal --frames 8 --auto-patch
python -m undertone camera --synthetic --tier ideal --pairs --lighting-check
```

### Sources of error

- Tanning, flushing, makeup, and recent sun exposure shift hue and `L*`.
- Specular highlights, shadows, and uneven spotlights.
- Camera auto-exposure, auto-WB, HDR, beauty filters, and phone-style processing.
- Mirror glass and coatings tint colors; calibrate through the glass.
- Mains flicker unless exposure is a whole flicker-cycle multiple.
- Weak LED-to-ambient ratio in flash/no-flash mode.
- Body-site differences: forehead, cheek, and jaw read differently.

## How to run

Install:

```powershell
pip install -e .
# optional for image files:
pip install pillow
# optional for real camera / live preview:
pip install opencv-python
```

Live camera demo (press `q` or Esc to quit):

```powershell
python -m undertone live --index 0 --mirror
python -m undertone live --index 0 --auto-patch
```

No hardware needed:

```powershell
python -m undertone demo
python -m undertone live --synthetic
python -m undertone camera --synthetic
python -m undertone camera --synthetic --pairs --lighting-check
```

Fixed-capture test on the real camera:

```powershell
python -m undertone camera --index 0 --tier minimum --frames 8
python -m undertone camera --index 0 --tier ideal --frames 8 --patch 20 20 60 60
python -m undertone camera --index 0 --pairs --patch 20 20 60 60
```

The flash/no-flash command prompts the operator to toggle the LEDs.

Offline images:

```powershell
python -m undertone analyze face.png --patch 20 20 60 60 --tier ideal
python -m undertone analyze face.png --auto-patch --tier ideal
python -m undertone detect-patch face.png
python -m undertone pair on.png off.png --patch 20 20 60 60
```

Tests:

```powershell
python -m pytest -q
```

## Production integration

Replace the fallback mask/regions with real face parsing:

```python
config = AnalysisConfig(
    mask_provider=lambda srgb: my_face_parser_skin_mask(srgb),   # (H, W) bool
    region_provider=lambda mask: my_face_mesh_regions(mask),     # named masks
)
```

Wire the mirror's LED controller into `capture_pairs(..., set_led=...)`; the CLI
uses an operator prompt for manual testing.

## Privacy and security

- Process on-device, store no face images, and do not infer unrelated
  attributes. The live demo and capture commands emit numbers only.
- Prefer sending measured numbers to any external service, not images.
- For India, review the Digital Personal Data Protection Act, 2023 before
  deployment. This is not legal advice.
- Undertone-related patents exist (e.g. US 10,497,148; US 12,243,288). Get a
  freedom-to-operate review in each target market. This is not legal advice.

## Known gaps

- The fallback skin mask is not face parsing.
- Warm-to-cool cutoffs are illustrative until you run `calibrate` on labelled
  data; the reported uncertainty is a region-spread estimate, not a calibrated
  probability.
- The bundled palette is not stylist-approved.
- The camera path is tested against `SyntheticCamera` only; check `report()` on
  the actual mirror hardware because OpenCV control names and exposure units
  vary by backend.
- Auto patch detection is geometric. It assumes the card is neutral, uniform,
  rectangular, has visible contrast against its surroundings, and is near the
  frame border; other gray objects can still win. Temporal tracking reduces
  flicker but does not validate that the tracked rectangle is a real card. Use
  `--patch` for production until detection is validated per store.
- The synthetic fixture is a regression tool, not evidence of real-world
  accuracy.
