"""End-to-end measurement: mask -> features -> gate -> position -> palette."""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Callable, Iterable

import numpy as np

from .color import (
    chroma as _chroma,
    clipping_fraction,
    delta_e_ciede2000,
    hue_angle as _hue_angle,
    ita as _ita,
    lab_to_srgb,
    linear_rgb_to_lab,
    linear_to_srgb,
    patch_color_cast,
    srgb_to_linear,
    white_balance_gains,
)
from .features import (
    bounding_box,
    detect_flushing_and_erythema,
    fuse_region_hues,
    measure_skin_texture,
    region_agreement,
    region_masks,
    region_statistics,
    robust_lab,
    skin_mask_srgb,
    union_masks,
)
from .palette import Palette, depth_from_ita

_NEUTRAL_LUMA = np.array([0.2126, 0.7152, 0.0722])


@dataclass(frozen=True)
class Thresholds:
    min_skin_pixels: int = 400
    max_clipping: float = 0.03
    min_median_L: float = 25.0
    max_median_L: float = 92.0
    max_color_cast_de: float = 8.0
    max_region_hue_std: float = 5.0
    max_region_L_std: float = 9.0
    min_chroma: float = 5.0
    min_led_to_ambient: float = 1.5


@dataclass
class AnalysisConfig:
    thresholds: Thresholds = field(default_factory=Thresholds)
    trim: tuple[float, float] = (20.0, 80.0)
    neutral_hue: float = 55.0
    hue_span: float = 12.0
    neutral_band: float = 0.25
    reference_hue_mean: float | None = None
    reference_hue_std: float | None = None
    tier: str = "minimum"
    palette: Palette | None = None
    restrict_to_largest: bool = True
    # Remove the population-level hue/lightness confound: melanin raises b*
    # (and therefore hue) as skin darkens. A slope fitted on labelled data makes
    # the warm/cool axis a residual from that trend, which is fairer across
    # depths. Zero means "do not correct" (the raw heuristic).
    depth_hue_slope: float = 0.0
    depth_reference_L: float = 60.0
    calibrated: bool = False
    # Production hook: return a boolean skin mask from a corrected sRGB image.
    # Use MediaPipe Face Mesh + face parsing here instead of the fallback.
    mask_provider: Callable[[np.ndarray], np.ndarray] | None = None
    # Production hook: return named region masks (cheeks/forehead/jaw) given
    # the skin mask. Region names flow into the returned quality report.
    region_provider: Callable[[np.ndarray], dict[str, np.ndarray]] | None = None


    def resolved_palette(self) -> Palette:
        return self.palette if self.palette is not None else _default_palette()


@lru_cache(maxsize=1)
def _default_palette() -> Palette:
    return Palette.from_json()


def _as_srgb(image: np.ndarray) -> np.ndarray:
    arr = np.asarray(image)
    if arr.dtype == np.uint8:
        arr = arr.astype(np.float64) / 255.0
    else:
        arr = arr.astype(np.float64)
        if arr.size and float(np.nanmax(arr)) > 1.5:
            arr = arr / 255.0
    if arr.ndim != 3 or arr.shape[-1] != 3:
        raise ValueError("image must have shape (H, W, 3)")
    if not np.isfinite(arr).all():
        arr = np.nan_to_num(arr, nan=0.0, posinf=1.0, neginf=0.0)
    return np.clip(arr, 0.0, 1.0)


def _roi_clipping(srgb: np.ndarray, mask: np.ndarray) -> float:
    """Clipping within the sampled skin region, not the whole frame.

    Backgrounds (a dark room, a bright window) are not part of the measurement
    and must not decide whether the subject's exposure is acceptable.
    """
    if mask.ndim == 2 and mask.shape == srgb.shape[:2] and mask.any():
        return clipping_fraction(srgb, mask=mask)
    return clipping_fraction(srgb)


def _resolve_patch(rgb: np.ndarray, reference_patch: Any) -> np.ndarray | None:
    if reference_patch is None:
        return None
    arr = np.asarray(reference_patch)
    if arr.shape == (4,):
        x, y, w, h = (int(v) for v in arr)
        h_img, w_img = rgb.shape[:2]
        x0, y0 = max(x, 0), max(y, 0)
        x1, y1 = min(x + w, w_img), min(y + h, h_img)
        if x1 <= x0 or y1 <= y0:
            raise ValueError("reference patch rectangle is empty or outside the image")
        return rgb[y0:y1, x0:x1].reshape(-1, 3)
    if arr.ndim >= 1 and arr.shape[-1] == 3:
        pixels = arr.reshape(-1, 3).astype(np.float64)
        if pixels.size and float(np.nanmax(pixels)) > 1.5:
            pixels = pixels / 255.0
        return np.clip(pixels, 0.0, 1.0)
    raise ValueError("reference_patch must be (x, y, w, h) or an (N, 3) sRGB array")


def ita_class(ita_degrees: float) -> str:
    if ita_degrees > 55.0:
        return "very_light"
    if ita_degrees > 41.0:
        return "light"
    if ita_degrees > 28.0:
        return "intermediate"
    if ita_degrees > 10.0:
        return "tan"
    if ita_degrees > -30.0:
        return "brown"
    return "dark"


# Human-readable fixes for each quality-gate failure code. The gate tells the
# operator *what* failed; these tell them *what to do* about it.
FAILURE_HINTS: dict[str, str] = {
    "no_skin_pixels": (
        "No skin-like pixels found. Face the mirror, fill more of the frame, "
        "and add light."
    ),
    "too_few_skin_pixels": (
        "Too few skin pixels. Move closer and make sure your face is lit."
    ),
    "brightness_out_of_range": (
        "Face is too dark or too bright. Even out the light and avoid backlight."
    ),
    "low_chroma": (
        "Colour is washed out. Improve lighting and disable beauty modes/filters."
    ),
    "clipping": (
        "Some skin pixels are pure black or white. Use softer, more even light."
    ),
    "color_cast": (
        "The reference patch is strongly tinted. Re-shoot the grey card in the "
        "same light."
    ),
    "uneven_color": (
        "Colour varies across the face. Remove coloured light, reflections, or "
        "harsh shadows."
    ),
    "uneven_lightness": (
        "Lighting is uneven across the face. Use softer, more frontal light."
    ),
    "low_led_to_ambient": (
        "The flash is weak against room light. Dim the ambient light or boost "
        "the LED ring."
    ),
    "warming_up": "Waiting for the camera to settle; hold still.",
}


def failure_hints(failures: Iterable[str]) -> list[str]:
    """Turn quality-gate failure codes into actionable instructions."""
    return [FAILURE_HINTS.get(str(code), str(code)) for code in failures]


def warm_cool_position(
    hue: float,
    config: AnalysisConfig,
    *,
    L: float | None = None,
    a: float | None = None,
    b: float | None = None,
    hue_std: float | None = None,
    n_regions: int | None = None,
) -> dict[str, Any]:
    """Continuous warm-to-cool position from hue angle.

    The anchors are a presentation choice, not a validated undertone cutoff.
    Lower hue (pinker) is cooler, higher hue (yellower) is warmer.

    When ``config.depth_hue_slope`` is non-zero (set by calibration), hue is
    first corrected for the population trend with lightness, so a deep-skinned
    cool person is not pushed warm purely by melanin's yellow bias.

    ``a`` and ``b`` evaluate the 2D chromaticity plane for olive undertones
    (orthogonal green-magenta deviation from the canonical melanin locus).

    ``hue_std``/``n_regions`` add an uncertainty estimate and a stability flag:
    a label is only stable when the 95% hue interval does not cross the neutral
    band. This stops a confident-looking result right at a cutoff.
    """
    measured_hue = float(hue)
    depth_adjustment = 0.0
    if L is not None and config.depth_hue_slope:
        depth_adjustment = -config.depth_hue_slope * (float(L) - config.depth_reference_L)
    adjusted_hue = measured_hue + depth_adjustment

    raw = (adjusted_hue - config.neutral_hue) / config.hue_span
    score = float(np.clip(raw, -1.0, 1.0))
    if abs(score) <= config.neutral_band:
        label = "neutral"
    elif score > 0:
        label = "warm"
    else:
        label = "cool"

    result: dict[str, Any] = {
        "score": score,
        "label": label,
        "hue": adjusted_hue,
        "hue_raw": measured_hue,
        "depth_adjustment": float(depth_adjustment),
        "neutral_band": float(config.neutral_band),
        "calibrated": bool(config.calibrated),
    }

    if a is not None and b is not None:
        olive_score = float(b - 1.25 * a)
        is_olive = bool(olive_score >= 9.0 and (L is None or L < 78.0))
        result["olive_score"] = olive_score
        result["is_olive"] = is_olive
        if is_olive:
            result["undertone_subtype"] = f"{label}-olive" if label != "neutral" else "olive"
    else:
        result["olive_score"] = None
        result["is_olive"] = False
    if hue_std is not None and np.isfinite(hue_std):
        sigma_score = float(hue_std) / abs(config.hue_span)
        margin = abs(score) - config.neutral_band
        result["hue_std"] = float(hue_std)
        result["score_sigma"] = sigma_score
        result["score_ci95"] = [score - 1.96 * sigma_score, score + 1.96 * sigma_score]
        if n_regions is not None and n_regions >= 2:
            result["stable"] = bool(margin > 1.96 * sigma_score)
        else:
            result["stable"] = None
    if config.reference_hue_mean is not None and config.reference_hue_std:
        if config.reference_hue_std > 0:
            result["z"] = float(
                (adjusted_hue - config.reference_hue_mean) / config.reference_hue_std
            )
    return result



def _confidence(
    gate: dict[str, Any],
    features: dict[str, Any],
    agreement: dict[str, Any],
    clipping: float,
    cast_de: float | None,
    thresholds: Thresholds,
) -> dict[str, Any]:
    if not gate["passed"]:
        return {"score": 0.0, "label": "none", "show_automatic": False}

    n_pixels = features["n_pixels"]
    c_pixels = float(
        np.clip(np.log10(max(n_pixels, 1) / 200.0) / np.log10(5000.0 / 200.0), 0.0, 1.0)
    )
    n_regions = int(agreement.get("n_regions", 0))
    hue_std = float(agreement.get("hue_std", 0.0) or 0.0)
    c_agreement = float(np.exp(-((hue_std / 3.0) ** 2)) * min(1.0, n_regions / 3.0))
    c_clipping = float(
        1.0 - min(clipping / max(thresholds.max_clipping, 1e-9), 1.0)
    )
    c_chroma = float(
        np.clip(
            (features["chroma"] - thresholds.min_chroma) / 15.0,
            0.0,
            1.0,
        )
    )

    terms: list[tuple[float, float]] = [
        (0.20, c_pixels),
        (0.30, c_agreement),
        (0.15, c_clipping),
        (0.15, c_chroma),
    ]
    if cast_de is not None:
        terms.append((0.20, float(np.exp(-((cast_de / 6.0) ** 2)))))
    score = float(sum(w * v for w, v in terms) / sum(w for w, _ in terms))
    if score >= 0.75:
        label = "high"
    elif score >= 0.50:
        label = "medium"
    else:
        label = "low"
    return {"score": score, "label": label, "show_automatic": score >= 0.75}


def _gate(
    thresholds: Thresholds,
    features: dict[str, Any] | None,
    agreement: dict[str, Any],
    clipping: float,
    cast_de: float | None,
    led_to_ambient: float | None,
) -> dict[str, Any]:
    failures: list[str] = []
    if features is None:
        failures.append("no_skin_pixels")
        metrics: dict[str, Any] = {}
    else:
        metrics = {
            "n_pixels": int(features["n_pixels"]),
            "median_L": float(features["L"]),
            "chroma": float(features["chroma"]),
            "clipping": float(clipping),
            "color_cast_de": None if cast_de is None else float(cast_de),
            "region_hue_std": None
            if np.isnan(agreement.get("hue_std", np.nan))
            else float(agreement["hue_std"]),
            "region_L_std": None
            if np.isnan(agreement.get("L_std", np.nan))
            else float(agreement["L_std"]),
            "n_regions": int(agreement.get("n_regions", 0)),
            "led_to_ambient": None
            if led_to_ambient is None
            else float(led_to_ambient),
        }
        if features["n_pixels"] < thresholds.min_skin_pixels:
            failures.append("too_few_skin_pixels")
        if not (thresholds.min_median_L <= features["L"] <= thresholds.max_median_L):
            failures.append("brightness_out_of_range")
        if features["chroma"] < thresholds.min_chroma:
            failures.append("low_chroma")
        if clipping > thresholds.max_clipping:
            failures.append("clipping")
        if cast_de is not None and cast_de > thresholds.max_color_cast_de:
            failures.append("color_cast")
        n_regions = int(agreement.get("n_regions", 0))
        if n_regions >= 2:
            if float(agreement["hue_std"]) > thresholds.max_region_hue_std:
                failures.append("uneven_color")
            if float(agreement["L_std"]) > thresholds.max_region_L_std:
                failures.append("uneven_lightness")
        if led_to_ambient is not None and led_to_ambient < thresholds.min_led_to_ambient:
            failures.append("low_led_to_ambient")
    return {"passed": not failures, "failures": failures, "metrics": metrics}


def _finalize(
    *,
    features: dict[str, Any] | None,
    agreement: dict[str, Any],
    region_stats: dict[str, Any],
    clipping: float,
    cast_de: float | None,
    led_to_ambient: float | None,
    texture: dict[str, Any] | None = None,
    config: AnalysisConfig,
) -> dict[str, Any]:
    thresholds = config.thresholds
    if features is not None:
        hue = float(_hue_angle(np.array([features["L"], features["a"], features["b"]])))
        chroma = float(_chroma(np.array([features["L"], features["a"], features["b"]])))
        ita_value = float(_ita(np.array([features["L"], features["a"], features["b"]])))
        if not np.isfinite(ita_value):
            ita_value = 0.0
        features = {
            **features,
            "hue": hue,
            "chroma": chroma,
            "ita": ita_value,
        }
    gate = _gate(thresholds, features, agreement, clipping, cast_de, led_to_ambient)

    if features is None:
        return {
            "ok": False,
            "measurement": None,
            "depth": None,
            "warm_cool": None,
            "confidence": {"score": 0.0, "label": "none", "show_automatic": False},
            "quality": {
                **gate,
                "regions": {},
                "tier": config.tier,
                "swatch_only": True,
                "require_confirmation": True,
            },
            "palette": [],
            "notes": [
                "No usable skin pixels were found; use swatch-pick mode only.",
            ],
        }

    hue = features["hue"]
    ita_value = features["ita"]

    fusion = fuse_region_hues(region_stats)
    position_hue = hue
    position_hue_std: float | None = None
    n_regions = int(agreement.get("n_regions", 0))
    if fusion["n_regions"]:
        position_hue = float(fusion["hue"])
        position_hue_std = float(fusion["hue_std"])
        n_regions = int(fusion["n_regions"])

    position = warm_cool_position(
        position_hue,
        config,
        L=features["L"],
        a=features["a"],
        b=features["b"],
        hue_std=position_hue_std,
        n_regions=n_regions,
    )

    # Compute color square swatch and exact statement
    skin_lab = np.array([features["L"], features["a"], features["b"]], dtype=np.float64)
    srgb_swatch = lab_to_srgb(skin_lab)
    rgb_255 = np.clip(np.round(srgb_swatch * 255.0), 0, 255).astype(int)
    skin_hex = f"#{int(rgb_255[0]):02X}{int(rgb_255[1]):02X}{int(rgb_255[2]):02X}"

    label_upper = position["label"].upper()
    subtype = position.get("undertone_subtype")
    if subtype:
        undertone_name = f"{subtype.replace('-', ' ').title()} Undertone"
    else:
        undertone_name = f"{position['label'].capitalize()} Undertone"

    # Canonical undertone accent squares
    undertone_accents = {
        "warm": "#E59866",
        "cool": "#E8A2B8",
        "neutral": "#D4B298",
    }
    accent_hex = "#A2A868" if position.get("is_olive") else undertone_accents.get(position["label"], skin_hex)

    position["color_hex"] = skin_hex
    position["color_rgb"] = [int(rgb_255[0]), int(rgb_255[1]), int(rgb_255[2])]
    position["accent_hex"] = accent_hex
    position["undertone_name"] = undertone_name
    position["statement"] = f"Your undertone is {label_upper} ({undertone_name})"

    confidence = _confidence(
        gate, features, agreement, clipping, cast_de, thresholds
    )
    if position.get("stable") is False:
        confidence["show_automatic"] = False
    depth_bucket = depth_from_ita(ita_value)

    palette_entries: list[dict[str, Any]] = []
    styling: dict[str, Any] | None = None
    palette_key = "olive" if position.get("is_olive") else position["label"]
    if gate["passed"]:
        palette_entries = config.resolved_palette().suggest(palette_key, depth_bucket)
        styling = config.resolved_palette().styling_advice(palette_key, depth_bucket)

    if not gate["passed"]:
        swatch_only = True
        require_confirmation = True
    elif config.tier == "ideal":
        swatch_only = False
        require_confirmation = not confidence["show_automatic"]
    else:
        swatch_only = False
        require_confirmation = True

    notes: list[str] = [
        "Undertone has no standard scientific definition; this is a measured "
        "position, not a validated class.",
    ]
    if config.tier == "minimum":
        notes.append("Minimum tier always requires swatch confirmation.")
    if not gate["passed"]:
        notes.append("Quality gate failed; automatic result is withheld.")
    if config.depth_hue_slope:
        notes.append(
            "Hue corrected for the depth trend "
            f"({config.depth_hue_slope:+.2f} deg per L* unit)."
        )
    if fusion.get("erythema", {}).get("flushing_detected"):
        notes.append(
            "Transient cheek flushing detected; compensated using forehead/jaw baseline."
        )
    if texture and texture.get("makeup_suspected"):
        notes.append(
            "Low skin micro-texture detected (possible foundation, powder, or smoothing filter)."
        )
    if position.get("stable") is False:
        notes.append(
            "Region hue uncertainty crosses a label boundary; confirm with a swatch."
        )
    if fusion["rejected"]:
        notes.append(
            "Disagreeing region(s) excluded from hue: "
            + ", ".join(str(name) for name in fusion["rejected"])
            + "."
        )

    return {
        "ok": bool(gate["passed"]),
        "measurement": features,
        "depth": {
            "ita": ita_value,
            "label": ita_class(ita_value),
            "palette_bucket": depth_bucket,
            "L": float(features["L"]),
        },
        "warm_cool": position,
        "confidence": {
            **confidence,
            "requirement": (
                "always_confirm" if require_confirmation else "optional"
            ),
        },
        "quality": {
            **gate,
            "regions": {
                name: {
                    "n_pixels": stat.n_pixels,
                    "L": stat.L,
                    "hue": stat.hue,
                    "chroma": stat.chroma,
                }
                for name, stat in region_stats.items()
            },
            "hue_fusion": fusion,
            "erythema": fusion.get("erythema"),
            "texture": texture,
            "tier": config.tier,
            "swatch_only": swatch_only,
            "require_confirmation": require_confirmation,
            "is_estimate": config.tier == "minimum",
            "calibrated": bool(config.calibrated),
        },
        "palette": palette_entries,
        "styling": styling,
        "notes": notes,
    }


def _get_mask(srgb: np.ndarray, config: AnalysisConfig) -> np.ndarray:
    if config.mask_provider is not None:
        mask = np.asarray(config.mask_provider(srgb), dtype=bool)
        if mask.shape != srgb.shape[:2]:
            raise ValueError("mask_provider must return an (H, W) boolean mask")
        return mask
    return skin_mask_srgb(srgb, restrict_to_largest=config.restrict_to_largest)


def _get_regions(
    mask: np.ndarray, config: AnalysisConfig
) -> dict[str, np.ndarray]:
    if config.region_provider is not None:
        regions = config.region_provider(mask)
        return {str(name): np.asarray(m, dtype=bool) for name, m in regions.items()}
    return region_masks(mask)


def analyze_srgb(
    rgb: np.ndarray,
    reference_patch: Any = None,
    config: AnalysisConfig | None = None,
) -> dict[str, Any]:
    """Measure a single gamma-encoded sRGB frame in [0, 1] (or uint8).

    ``reference_patch`` is either ``(x, y, w, h)`` or an ``(N, 3)`` sRGB array.
    """
    config = config or AnalysisConfig()
    srgb = _as_srgb(rgb)
    patch = _resolve_patch(srgb, reference_patch)

    linear = srgb_to_linear(srgb)
    cast_de: float | None = None
    if patch is not None:
        patch_linear = srgb_to_linear(patch)
        cast_de = patch_color_cast(patch_linear)
        linear = linear * white_balance_gains(patch_linear)

    corrected_srgb = linear_to_srgb(linear)
    mask = _get_mask(corrected_srgb, config)
    regions = _get_regions(mask, config)
    sample_mask = union_masks(regions)
    lab_image = linear_rgb_to_lab(linear)
    clipping = _roi_clipping(srgb, sample_mask)

    features: dict[str, Any] | None
    if sample_mask.size == 0 or not sample_mask.any():
        features = None
    else:
        features = robust_lab(lab_image, sample_mask, trim=config.trim)

    region_stats = region_statistics(lab_image, regions)
    agreement = region_agreement(region_stats)
    texture = measure_skin_texture(srgb, sample_mask)

    result = _finalize(
        features=features,
        agreement=agreement,
        region_stats=region_stats,
        clipping=clipping,
        cast_de=cast_de,
        led_to_ambient=None,
        texture=texture,
        config=config,
    )
    result["quality"]["face_bbox"] = bounding_box(mask)
    return result


def analyze_pair_srgb(
    on_srgb: np.ndarray,
    off_srgb: np.ndarray,
    reference_patch: Any = None,
    config: AnalysisConfig | None = None,
) -> dict[str, Any]:
    """Analyze a flash/no-flash pair.

    The LED-on minus LED-off difference is taken in unscaled linear light,
    ensuring that ambient illumination cancels mathematically. The isolated
    LED signal is then white-balanced against the reference patch. Requires
    locked camera settings and no clipped pixels.
    """
    config = config or AnalysisConfig()
    on = _as_srgb(on_srgb)
    off = _as_srgb(off_srgb)
    if on.shape != off.shape:
        raise ValueError("on and off frames must have the same shape")

    on_linear = srgb_to_linear(on)
    off_linear = srgb_to_linear(off)

    # 1. Unscaled linear difference: ambient light cancels out mathematically.
    diff_linear = np.clip(on_linear - off_linear, 0.0, None)

    cast_de: float | None = None
    patch_on = _resolve_patch(on, reference_patch)
    patch_off = _resolve_patch(off, reference_patch)

    led_linear = diff_linear
    on_wb_linear = on_linear

    if patch_on is not None and patch_off is not None:
        p_off = srgb_to_linear(patch_off)
        p_on = srgb_to_linear(patch_on)
        p_flash = np.clip(p_on - p_off, 0.0, None)
        on_wb_linear = on_linear * white_balance_gains(p_off)

        # In flash/no-flash, ambient cast is cancelled by subtraction.
        # Check cast of the flash illuminant if the flash hit the patch.
        flash_mean = float(np.mean(p_flash))
        off_mean = float(np.mean(p_off))
        if flash_mean > 0.03 and flash_mean > 0.15 * max(off_mean, 1e-6):
            cast_de = patch_color_cast(p_flash)
            led_linear = diff_linear * white_balance_gains(p_flash)
        else:
            cast_de = None
            led_linear = diff_linear
    elif patch_off is not None:
        p_off = srgb_to_linear(patch_off)
        cast_de = None
        on_wb_linear = on_linear * white_balance_gains(p_off)
        led_linear = diff_linear
    elif patch_on is not None:
        p_on = srgb_to_linear(patch_on)
        cast_de = patch_color_cast(p_on)
        on_wb_linear = on_linear * white_balance_gains(p_on)
        led_linear = diff_linear

    corrected_on = linear_to_srgb(on_wb_linear)
    mask = _get_mask(corrected_on, config)
    regions = _get_regions(mask, config)
    sample_mask = union_masks(regions)
    lab_image = linear_rgb_to_lab(led_linear)
    clipping = _roi_clipping(on, sample_mask)

    features: dict[str, Any] | None
    if sample_mask.size == 0 or not sample_mask.any():
        features = None
        led_to_ambient = None
        region_stats = {}
        agreement = {"n_regions": 0, "hue_std": float("nan"), "L_std": float("nan")}
    else:
        features = robust_lab(lab_image, sample_mask, trim=config.trim)
        region_stats = region_statistics(lab_image, regions)
        agreement = region_agreement(region_stats)
        led_luma = float(np.median(led_linear[sample_mask] @ _NEUTRAL_LUMA))
        ambient_luma = float(np.median(off_linear[sample_mask] @ _NEUTRAL_LUMA))
        led_to_ambient = led_luma / max(ambient_luma, 1e-6)

    texture = measure_skin_texture(on, sample_mask)

    result = _finalize(
        features=features,
        agreement=agreement,
        region_stats=region_stats,
        clipping=clipping,
        cast_de=cast_de,
        led_to_ambient=led_to_ambient,
        texture=texture,
        config=config,
    )
    result["quality"]["face_bbox"] = bounding_box(mask)
    return result
