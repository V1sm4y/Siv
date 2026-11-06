import numpy as np
import pytest

from undertone.color import lab_to_linear_rgb
from undertone.demo import render_face
from undertone.detect import AnalysisConfig, analyze_pair_srgb, analyze_srgb
from undertone.features import skin_features, skin_mask_srgb


def test_skin_features_match_input_lab():
    lab = np.array([60.0, 12.0, 22.0])
    linear = lab_to_linear_rgb(lab)
    pixels = np.tile(linear, (500, 1))
    features = skin_features(pixels)
    assert features["L"] == pytest.approx(60.0, abs=0.5)
    assert features["a"] == pytest.approx(12.0, abs=0.5)
    assert features["b"] == pytest.approx(22.0, abs=0.5)
    assert features["hue"] == pytest.approx(np.degrees(np.arctan2(22.0, 12.0)), abs=0.5)
    assert features["chroma"] == pytest.approx(np.hypot(12.0, 22.0), abs=0.5)


def test_demo_passes_gate_and_reads_warm():
    image = render_face()
    result = analyze_srgb(image, reference_patch=(15, 15, 57, 57))
    assert result["ok"] is True
    assert 55.0 < result["warm_cool"]["hue"] < 68.0
    assert result["warm_cool"]["label"] == "warm"
    assert result["confidence"]["score"] > 0.5
    assert result["depth"]["palette_bucket"] in {"light", "medium", "deep"}
    assert len(result["palette"]) >= 1


def test_minimum_tier_always_requires_confirmation():
    image = render_face()
    result = analyze_srgb(
        image, reference_patch=(15, 15, 57, 57), config=AnalysisConfig(tier="minimum")
    )
    assert result["quality"]["require_confirmation"] is True
    assert result["quality"]["is_estimate"] is True


def test_ideal_tier_can_show_automatically():
    image = render_face()
    result = analyze_srgb(
        image, reference_patch=(15, 15, 57, 57), config=AnalysisConfig(tier="ideal")
    )
    assert result["ok"] is True
    assert result["quality"]["require_confirmation"] is False


def test_clipping_is_measured_on_skin_only():
    from undertone.camera import default_patch
    from undertone.color import clipping_fraction

    image = render_face()
    image[-30:, :, :] = 0.0
    assert clipping_fraction(image) > 0.03
    result = analyze_srgb(image, reference_patch=default_patch(image))
    assert result["quality"]["metrics"]["clipping"] < 0.03
    assert result["ok"] is True


def test_blank_image_fails_closed():
    image = np.ones((240, 240, 3))
    result = analyze_srgb(image)
    assert result["ok"] is False
    assert result["measurement"] is None
    assert result["quality"]["swatch_only"] is True
    assert "no_skin_pixels" in result["quality"]["failures"]


def test_reference_patch_array_is_accepted():
    image = render_face()
    patch_pixels = image[15:72, 15:72].reshape(-1, 3)
    as_array = analyze_srgb(image, reference_patch=patch_pixels)
    as_rect = analyze_srgb(image, reference_patch=(15, 15, 57, 57))
    assert as_array["measurement"]["L"] == pytest.approx(
        as_rect["measurement"]["L"], abs=1e-9
    )


def test_flash_pair_uses_led_difference():
    from undertone.color import linear_to_srgb, srgb_to_linear

    reference = render_face(cast=(1.0, 1.0, 1.0))
    mask = skin_mask_srgb(reference)
    skin_linear = lab_to_linear_rgb(np.array([60.0, 12.0, 22.0]))
    # Dim ambient light with our LEDs adding a known skin-coloured light.
    off_linear = 0.5 * srgb_to_linear(reference)
    on_linear = off_linear.copy()
    on_linear[mask] = on_linear[mask] + 1.2 * skin_linear
    on = linear_to_srgb(on_linear)
    off = linear_to_srgb(off_linear)
    result = analyze_pair_srgb(on, off, reference_patch=(15, 15, 57, 57))
    assert result["ok"] is True
    assert result["quality"]["metrics"]["led_to_ambient"] > 1.5
    assert result["warm_cool"]["label"] == "warm"


def test_flash_pair_cancels_strong_ambient_cast():
    from undertone.color import linear_to_srgb, srgb_to_linear

    reference = render_face(cast=(1.0, 1.0, 1.0))
    mask = skin_mask_srgb(reference)
    skin_linear = lab_to_linear_rgb(np.array([60.0, 12.0, 22.0]))
    
    # Store has a heavy warm-amber tint (e.g. 2500K halogen cast)
    ambient_cast = np.array([1.4, 0.8, 0.5])
    off_linear = 0.3 * srgb_to_linear(reference) * ambient_cast
    on_linear = off_linear.copy()
    # Flash adds pure skin-reflected light without ambient tint
    on_linear[mask] = on_linear[mask] + 1.2 * skin_linear

    on = linear_to_srgb(on_linear)
    off = linear_to_srgb(off_linear)
    result = analyze_pair_srgb(on, off, reference_patch=(15, 15, 57, 57))
    assert result["ok"] is True
    # Label correctly captures warm undertone without skew from halogen cast
    assert result["warm_cool"]["label"] == "warm"
    assert 55.0 <= result["warm_cool"]["hue"] <= 68.0
