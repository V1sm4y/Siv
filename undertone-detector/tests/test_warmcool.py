import numpy as np
import pytest

from undertone.detect import AnalysisConfig, analyze_srgb, warm_cool_position
from undertone.demo import render_face
from undertone.features import RegionStats, fuse_region_hues
from undertone.warmcool import (
    WarmCoolCalibration,
    evaluate_warm_cool,
    fit_warm_cool,
)


def _lab(hue: float, chroma: float = 22.0, L: float = 60.0):
    radians = np.radians(hue)
    return np.array([L, chroma * np.cos(radians), chroma * np.sin(radians)])


def _region(name: str, hue: float, n: int = 500) -> RegionStats:
    lab = _lab(hue)
    return RegionStats(
        name=name,
        n_pixels=n,
        L=float(lab[0]),
        a=float(lab[1]),
        b=float(lab[2]),
        hue=float(hue),
        chroma=22.0,
    )


def test_fuse_region_hues_rejects_disagreeing_region():
    regions = {
        "forehead": _region("forehead", 60.0),
        "left_cheek": _region("left_cheek", 61.0),
        "right_cheek": _region("right_cheek", 59.5),
        "jaw": _region("jaw", 95.0),
    }
    fused = fuse_region_hues(regions, outlier_deg=6.0)
    assert fused["hue"] == pytest.approx(60.2, abs=1.0)
    assert "jaw" in fused["rejected"]
    assert fused["n_regions"] == 4
    assert fused["hue_std"] < 2.0


def test_warm_cool_position_applies_depth_correction():
    config = AnalysisConfig(
        neutral_hue=55.0,
        hue_span=12.0,
        depth_hue_slope=0.2,
        depth_reference_L=60.0,
    )
    position = warm_cool_position(61.0, config, L=80.0)
    assert position["hue_raw"] == pytest.approx(61.0)
    assert position["depth_adjustment"] == pytest.approx(-4.0)
    assert position["hue"] == pytest.approx(57.0)
    assert position["label"] == "neutral"


def test_uncertainty_flags_unstable_label():
    config = AnalysisConfig(neutral_hue=55.0, hue_span=12.0, neutral_band=0.25)
    # Score is just outside the band (57.2 -> +0.18 ... inside; use 59 -> +0.33)
    position = warm_cool_position(
        59.0, config, hue_std=4.0, n_regions=4
    )
    assert position["label"] == "warm"
    assert position["stable"] is False
    assert position["score_ci95"][0] < position["score"]


def _synthetic_samples(seed: int = 0, n_per_class: int = 40):
    rng = np.random.default_rng(seed)
    true_slope = 0.18
    reference_L = 60.0
    neutral_hue = 57.0
    span = 10.0
    samples = []
    for label, score in (("warm", 0.8), ("neutral", 0.0), ("cool", -0.8)):
        for _ in range(n_per_class):
            L = float(rng.uniform(35.0, 80.0))
            adjusted = neutral_hue + score * span + rng.normal(0.0, 0.8)
            hue = adjusted + true_slope * (L - reference_L)
            chroma = float(rng.uniform(18.0, 26.0))
            radians = np.radians(hue)
            samples.append(
                {
                    "L": L,
                    "a": chroma * np.cos(radians),
                    "b": chroma * np.sin(radians),
                    "label": label,
                }
            )
    return samples, true_slope, neutral_hue, span


def test_fit_recovers_known_anchors_and_depth_slope():
    samples, true_slope, neutral_hue, span = _synthetic_samples()
    calibration = fit_warm_cool(samples)
    assert calibration.depth_hue_slope == pytest.approx(true_slope, abs=0.05)
    assert calibration.neutral_hue == pytest.approx(neutral_hue, abs=1.5)
    assert calibration.hue_span == pytest.approx(span, abs=2.0)
    assert calibration.separation_deg > 10.0

    metrics = evaluate_warm_cool(samples, calibration.apply())
    assert metrics["accuracy"] > 0.90
    assert metrics["balanced_accuracy"] > 0.90
    assert metrics["confusion"]["warm"]["warm"] == 40
    assert metrics["confusion"]["cool"]["cool"] == 40


def test_calibration_json_round_trip(tmp_path):
    samples, _, _, _ = _synthetic_samples(n_per_class=12)
    calibration = fit_warm_cool(samples)
    path = tmp_path / "warmcool.json"
    calibration.save(path)
    loaded = WarmCoolCalibration.load(path)
    assert loaded.apply().neutral_hue == pytest.approx(calibration.neutral_hue)
    assert loaded.apply().depth_hue_slope == pytest.approx(
        calibration.depth_hue_slope
    )


def test_analysis_reports_region_fusion_and_stability():
    image = render_face()
    result = analyze_srgb(
        image,
        reference_patch=(15, 15, 57, 57),
        config=AnalysisConfig(tier="ideal"),
    )
    warm_cool = result["warm_cool"]
    assert "hue_raw" in warm_cool
    assert "hue_std" in warm_cool
    assert "stable" in warm_cool
    assert result["quality"]["hue_fusion"]["n_regions"] >= 2
    assert result["quality"]["calibrated"] is False
