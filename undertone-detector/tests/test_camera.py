import numpy as np
import pytest

from undertone.camera import (
    CameraSettings,
    CapturePlan,
    OpenCVCamera,
    RepeatabilityThresholds,
    SyntheticCamera,
    capture_frames,
    capture_pairs,
    default_patch,
    exposure_for_backend,
    flicker_period,
    flicker_safe_exposure,
    is_flicker_safe,
    lighting_stability,
    lighting_thresholds_for_tier,
    log2_exposure,
    repeatability,
    run_capture_test,
    thresholds_for_tier,
)
from undertone.detect import AnalysisConfig


def test_flicker_period_and_rounding():
    assert flicker_period(50.0) == pytest.approx(0.010)
    assert flicker_safe_exposure(0.016, 50.0) == pytest.approx(0.020)
    assert flicker_safe_exposure(0.031, 50.0) == pytest.approx(0.030)
    assert flicker_safe_exposure(0.004, 50.0) == pytest.approx(0.010)
    assert flicker_safe_exposure(0.016, 50.0, mode="down") == pytest.approx(0.010)
    assert flicker_safe_exposure(0.016, 50.0, mode="up") == pytest.approx(0.020)


def test_is_flicker_safe():
    assert is_flicker_safe(0.010, 50.0)
    assert is_flicker_safe(0.030, 50.0)
    assert not is_flicker_safe(0.025, 50.0)


def test_camera_settings_default_exposure_is_flicker_safe():
    settings = CameraSettings(fps=30.0, mains_hz=50.0)
    exposure = settings.resolved_exposure_seconds()
    assert is_flicker_safe(exposure, 50.0)
    assert exposure == pytest.approx(0.030)


def test_camera_settings_default_is_20fps():
    settings = CameraSettings()
    assert settings.fps == pytest.approx(20.0)
    exposure = settings.resolved_exposure_seconds()
    assert is_flicker_safe(exposure, settings.mains_hz)
    assert exposure == pytest.approx(0.050)


def test_default_patch_matches_renderer():
    image = np.zeros((520, 420, 3))
    x, y, w, h = default_patch(image)
    assert (x, y, w, h) == (12, 12, 46, 46)
    camera = SyntheticCamera(width=420, height=520)
    assert camera.patch_rect == (12, 12, 46, 46)


def test_locked_burst_capture_passes_and_is_repeatable():
    camera = SyntheticCamera()
    plan = CapturePlan(tier="ideal", frames=6, reference_patch=default_patch(np.zeros((520, 420, 3))))
    outcome = run_capture_test(camera, plan, config=AnalysisConfig(tier="ideal"))
    assert outcome["mode"] == "locked_burst"
    assert outcome["result"]["ok"] is True
    assert outcome["repeatability"]["passed"] is True
    assert outcome["repeatability"]["hue_std"] < 0.5
    assert outcome["repeatability"]["delta_e_max"] < 0.5
    assert outcome["ok"] is True


def test_capture_frames_discards_warmup_frames():
    camera = SyntheticCamera()
    plan = CapturePlan(tier="minimum", frames=3, warmup=4)
    frames = capture_frames(camera, plan)
    assert len(frames) == 3
    assert camera._index == 4 + 3


def test_repeatability_detects_hue_drift():
    camera = SyntheticCamera(drift_lab=(0.0, 0.0, 3.0))
    plan = CapturePlan(tier="ideal", frames=8, reference_patch=(12, 12, 46, 46))
    outcome = run_capture_test(camera, plan, config=AnalysisConfig(tier="ideal"))
    summary = outcome["repeatability"]
    assert summary["passed"] is False
    assert "hue_std" in summary["failures"] or "hue_range" in summary["failures"]
    assert outcome["ok"] is False


def test_repeatability_ignores_failed_gate_frames():
    good = {
        "ok": True,
        "measurement": {"L": 60.0, "a": 12.0, "b": 22.0},
    }
    bad = {
        "ok": False,
        "measurement": {"L": 20.0, "a": -30.0, "b": 60.0},
    }
    summary = repeatability([good, good, bad])
    assert summary["n_frames"] == 3
    assert summary["n_valid"] == 2
    assert summary["n_gate_failures"] == 1
    assert summary["hue_std"] == pytest.approx(0.0, abs=1e-6)


def test_repeatability_needs_two_measurements():
    summary = repeatability([{"ok": True, "measurement": {"L": 60, "a": 12, "b": 22}}])
    assert summary["passed"] is False
    assert summary["failures"] == ["insufficient_measurements"]


def test_flash_pair_capture_passes_led_ratio_gate():
    camera = SyntheticCamera(ambient_scale=0.35, led_strength=1.2)
    plan = CapturePlan(
        tier="ideal",
        frames=6,
        flash_pair=True,
        reference_patch=(12, 12, 46, 46),
    )
    outcome = run_capture_test(camera, plan, config=AnalysisConfig(tier="ideal"))
    assert outcome["mode"] == "flash_pair"
    assert outcome["result"]["ok"] is True
    assert outcome["result"]["quality"]["metrics"]["led_to_ambient"] > 1.5
    assert outcome["repeatability"]["passed"] is True


def test_capture_pairs_median_and_state_toggle():
    camera = SyntheticCamera(ambient_scale=0.35, led_strength=1.0)
    plan = CapturePlan(tier="minimum", frames=2, warmup=0, settle=0, flash_pair=True)
    pair = capture_pairs(camera, plan)
    assert pair["n_pairs"] == 2
    assert pair["on"].shape == pair["off"].shape
    assert np.mean(pair["on"]) > np.mean(pair["off"])
    assert camera.led_on is False


def test_lighting_stability_passes_after_patch_white_balance():
    plan = CapturePlan(tier="ideal", frames=5, reference_patch=(12, 12, 46, 46))
    sessions = {}
    for label, cast in {
        "neutral": (1.0, 1.0, 1.0),
        "warm_light": (1.08, 1.0, 0.88),
        "cool_light": (0.90, 0.98, 1.10),
    }.items():
        camera = SyntheticCamera(cast=cast)
        sessions[label] = run_capture_test(
            camera, plan, config=AnalysisConfig(tier="ideal")
        )
    stability = lighting_stability(sessions, thresholds_for_tier("ideal"))
    assert stability["n_conditions"] == 3
    assert stability["passed"] is True
    assert stability["hue_shift"] < 3.0
    assert stability["delta_e_max"] < 5.0


def test_lighting_stability_ignores_failed_condition():
    plan = CapturePlan(tier="minimum", frames=3, reference_patch=(12, 12, 46, 46))
    good = run_capture_test(
        SyntheticCamera(), plan, config=AnalysisConfig(tier="minimum")
    )
    failed = {
        "ok": False,
        "result": {"ok": False, "measurement": {"L": 20, "a": 0, "b": 0}},
    }
    stability = lighting_stability(
        {"one": good, "two": good, "bad": failed},
        thresholds_for_tier("minimum"),
    )
    assert stability["n_conditions"] == 2
    assert stability["passed"] is True


def test_minimum_tier_thresholds_are_wider():
    ideal = thresholds_for_tier("ideal")
    minimum = thresholds_for_tier("minimum")
    assert minimum.max_hue_std > ideal.max_hue_std
    assert minimum.max_delta_e > ideal.max_delta_e


def test_lighting_thresholds_are_wider_than_repeatability():
    assert lighting_thresholds_for_tier("ideal").max_delta_e > thresholds_for_tier(
        "ideal"
    ).max_delta_e
    assert lighting_thresholds_for_tier("minimum").max_delta_e > thresholds_for_tier(
        "minimum"
    ).max_delta_e
    with pytest.raises(ValueError):
        lighting_thresholds_for_tier("lab")


def test_tier_threshold_validation():
    with pytest.raises(ValueError):
        thresholds_for_tier("lab")
    with pytest.raises(ValueError):
        CapturePlan(tier="lab")


def test_exposure_conversion_for_backends():
    assert log2_exposure(0.020) == pytest.approx(np.log2(0.020))
    value, is_log2 = exposure_for_backend(0.020, "DSHOW")
    assert is_log2 is True
    assert value == pytest.approx(np.log2(0.020))
    value, is_log2 = exposure_for_backend(0.020, "MSMF")
    assert is_log2 is False
    assert value == pytest.approx(0.020)
    with pytest.raises(ValueError):
        log2_exposure(0.0)


class _FakeCapture:
    def __init__(self):
        self.values = {}

    def set(self, prop, value):
        self.values[prop] = value
        return True

    def get(self, prop):
        return self.values.get(prop, 0.0)


class _FakeCV2:
    def __getattr__(self, name):
        if name.startswith("CAP_"):
            return abs(hash(name)) % 100000 + 1
        raise AttributeError(name)

    def VideoWriter_fourcc(self, *args):
        return 0


def _bare_camera(settings, backend_name):
    camera = object.__new__(OpenCVCamera)
    camera._cv2 = _FakeCV2()
    camera._cap = _FakeCapture()
    camera.settings = settings
    camera.backend_name = backend_name
    camera._readback = {}
    camera._locked = {}
    camera._unsupported = []
    return camera


def test_opencv_camera_writes_log2_exposure_on_dshow():
    settings = CameraSettings(fps=20.0, exposure_seconds=0.020)
    camera = _bare_camera(settings, "DSHOW")
    camera._configure()
    expected, _ = exposure_for_backend(0.020, "DSHOW")
    assert camera._cap.values[camera._cv2.CAP_PROP_EXPOSURE] == pytest.approx(expected)
    assert camera._locked["exposure"] is True


def test_opencv_camera_reports_unverified_exposure_on_unknown_backend():
    settings = CameraSettings(fps=20.0, exposure_seconds=0.020)
    camera = _bare_camera(settings, "MSMF")
    camera._configure()
    # MSMF exposure units are backend specific until a raw value is supplied.
    assert camera._locked["exposure"] is None
