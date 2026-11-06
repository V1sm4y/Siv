"""Undertone detection for a smart-mirror virtual try-on.

The package measures skin depth (L*, ITA) and a continuous warm-to-cool
position from hue angle, gated on capture quality. It does not claim to
classify a scientific "undertone": that concept has no standard definition.
The customer's swatch pick always has the final say.
"""

from .camera import (
    CameraSettings,
    CapturePlan,
    OpenCVCamera,
    RepeatabilityThresholds,
    SyntheticCamera,
    capture_frames,
    capture_pairs,
    exposure_for_backend,
    flicker_safe_exposure,
    is_flicker_safe,
    lighting_stability,
    lighting_thresholds_for_tier,
    log2_exposure,
    repeatability,
    run_capture_test,
    thresholds_for_tier,
)
from .detect import (
    FAILURE_HINTS,
    AnalysisConfig,
    Thresholds,
    analyze_pair_srgb,
    analyze_srgb,
    failure_hints,
    ita_class,
    warm_cool_position,
)
from .color import delta_e_ciede2000
from .features import (
    circular_mean_deg,
    circular_std_deg,
    fuse_region_hues,
)
from .palette import Palette, depth_from_ita, dominant_colors
from .warmcool import (
    WarmCoolCalibration,
    evaluate_warm_cool,
    fit_warm_cool,
    read_samples_csv,
)

__all__ = [
    "AnalysisConfig",
    "CameraSettings",
    "CapturePlan",
    "FAILURE_HINTS",
    "OpenCVCamera",
    "Palette",
    "RepeatabilityThresholds",
    "SyntheticCamera",
    "Thresholds",
    "WarmCoolCalibration",
    "analyze_pair_srgb",
    "analyze_srgb",
    "capture_frames",
    "capture_pairs",
    "circular_mean_deg",
    "circular_std_deg",
    "delta_e_ciede2000",
    "depth_from_ita",
    "dominant_colors",
    "evaluate_warm_cool",
    "exposure_for_backend",
    "failure_hints",
    "fit_warm_cool",
    "flicker_safe_exposure",
    "fuse_region_hues",
    "is_flicker_safe",
    "ita_class",
    "lighting_stability",
    "lighting_thresholds_for_tier",
    "log2_exposure",
    "read_samples_csv",
    "repeatability",
    "run_capture_test",
    "thresholds_for_tier",
    "warm_cool_position",
]
