import numpy as np
import pytest

from undertone.color import (
    SRGB_TO_XYZ,
    apply_gains,
    clipping_fraction,
    delta_e_ciede2000,
    lab_to_srgb,
    linear_to_srgb,
    patch_color_cast,
    srgb_to_lab,
    srgb_to_linear,
    white_balance_gains,
)


def test_srgb_linear_roundtrip():
    values = np.linspace(0.0, 1.0, 101)
    rt = linear_to_srgb(srgb_to_linear(values))
    assert np.allclose(rt, values, atol=1e-10)


def test_white_maps_to_lab_white():
    lab = srgb_to_lab(np.array([1.0, 1.0, 1.0]))
    assert lab[0] == pytest.approx(100.0, abs=1e-3)
    assert lab[1] == pytest.approx(0.0, abs=1e-4)
    assert lab[2] == pytest.approx(0.0, abs=1e-4)


def test_lab_srgb_roundtrip():
    lab = np.array([60.0, 12.0, 22.0])
    back = srgb_to_lab(lab_to_srgb(lab))
    assert np.allclose(back, lab, atol=1e-4)


def test_delta_e_ciede2000_sharma_pairs():
    pairs = [
        ((50.0000, 2.6772, -79.7751), (50.0000, 0.0000, -82.7485), 2.0425),
        ((50.0000, 3.1571, -77.2803), (50.0000, 0.0000, -82.7485), 2.8615),
        ((50.0000, 2.8361, -74.0200), (50.0000, 0.0000, -82.7485), 3.4412),
        ((50.0000, -1.3802, -84.2814), (50.0000, 0.0000, -82.7485), 1.0000),
    ]
    for lab1, lab2, expected in pairs:
        got = delta_e_ciede2000(np.array(lab1), np.array(lab2))
        assert got == pytest.approx(expected, abs=1e-4)


def test_white_balance_neutralizes_patch():
    patch = np.array([[0.50, 0.40, 0.30], [0.48, 0.39, 0.31]])
    gains = white_balance_gains(patch)
    corrected = apply_gains(patch, gains)
    medians = np.median(corrected, axis=0)
    assert np.allclose(medians, medians.mean(), atol=1e-9)
    assert patch_color_cast(corrected) < 1e-3


def test_clipping_fraction():
    assert clipping_fraction(np.ones((4, 4, 3))) == pytest.approx(1.0)
    assert clipping_fraction(np.full((4, 4, 3), 0.5)) == pytest.approx(0.0)


def test_clipping_fraction_honours_mask():
    image = np.full((4, 4, 3), 0.5)
    image[:2, :, :] = 0.0
    mask = np.zeros((4, 4), dtype=bool)
    mask[2:, :] = True
    assert clipping_fraction(image) == pytest.approx(0.5)
    assert clipping_fraction(image, mask=mask) == pytest.approx(0.0)
    with pytest.raises(ValueError):
        clipping_fraction(image, mask=np.ones((3, 3), dtype=bool))


def test_xyz_matrix_shape():
    assert SRGB_TO_XYZ.shape == (3, 3)
