"""Color-science primitives.

All color math is done on linear-light RGB unless a function name says
``srgb``. Image files are gamma encoded; measurements are not.
"""

from __future__ import annotations

import numpy as np

D65 = np.array([0.95047, 1.0, 1.08883], dtype=np.float64)

# sRGB (D65) linear RGB -> CIE XYZ, IEC 61966-2-1 primaries.
SRGB_TO_XYZ = np.array(
    [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ],
    dtype=np.float64,
)
XYZ_TO_SRGB = np.linalg.inv(SRGB_TO_XYZ)

# CIE epsilon / kappa constants for the LAB transfer function.
_EPS = (6.0 / 29.0) ** 3
_KAPPA = 3.0 * (6.0 / 29.0) ** 2
_DELTA = 4.0 / 29.0


def srgb_to_linear(srgb: np.ndarray) -> np.ndarray:
    """Decode gamma-encoded sRGB values in [0, 1] to linear light."""
    c = np.asarray(srgb, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(linear: np.ndarray) -> np.ndarray:
    """Encode linear-light RGB in [0, 1] to sRGB."""
    c = np.clip(np.asarray(linear, dtype=np.float64), 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1.0 / 2.4) - 0.055)


def linear_rgb_to_xyz(rgb_linear: np.ndarray) -> np.ndarray:
    """Convert linear sRGB (..., 3) to CIE XYZ."""
    rgb = np.asarray(rgb_linear, dtype=np.float64)
    return rgb @ SRGB_TO_XYZ.T


def xyz_to_linear_rgb(xyz: np.ndarray) -> np.ndarray:
    """Convert CIE XYZ (..., 3) to linear sRGB."""
    return np.asarray(xyz, dtype=np.float64) @ XYZ_TO_SRGB.T


def xyz_to_lab(xyz: np.ndarray, white: np.ndarray = D65) -> np.ndarray:
    """Convert CIE XYZ (..., 3) to CIELAB."""
    t = np.asarray(xyz, dtype=np.float64) / np.asarray(white, dtype=np.float64)
    f = np.where(t > _EPS, np.cbrt(t), t / _KAPPA + _DELTA)
    x, y, z = f[..., 0], f[..., 1], f[..., 2]
    return np.stack([116.0 * y - 16.0, 500.0 * (x - y), 200.0 * (y - z)], axis=-1)


def lab_to_xyz(lab: np.ndarray, white: np.ndarray = D65) -> np.ndarray:
    """Convert CIELAB (..., 3) to CIE XYZ."""
    lab = np.asarray(lab, dtype=np.float64)
    fy = (lab[..., 0] + 16.0) / 116.0
    fx = fy + lab[..., 1] / 500.0
    fz = fy - lab[..., 2] / 200.0
    f = np.stack([fx, fy, fz], axis=-1)
    t = np.where(f > 6.0 / 29.0, f**3, _KAPPA * (f - _DELTA))
    return t * np.asarray(white, dtype=np.float64)


def linear_rgb_to_lab(rgb_linear: np.ndarray, white: np.ndarray = D65) -> np.ndarray:
    return xyz_to_lab(linear_rgb_to_xyz(rgb_linear), white)


def lab_to_linear_rgb(lab: np.ndarray, white: np.ndarray = D65) -> np.ndarray:
    return xyz_to_linear_rgb(lab_to_xyz(lab, white))


def lab_to_srgb(lab: np.ndarray, white: np.ndarray = D65) -> np.ndarray:
    return linear_to_srgb(lab_to_linear_rgb(lab, white))


def srgb_to_lab(srgb: np.ndarray, white: np.ndarray = D65) -> np.ndarray:
    return linear_rgb_to_lab(srgb_to_linear(srgb), white)


def lab_to_lch(lab: np.ndarray) -> np.ndarray:
    """CIELAB (..., 3) -> (L*, chroma, hue angle in degrees)."""
    lab = np.asarray(lab, dtype=np.float64)
    chroma = np.hypot(lab[..., 1], lab[..., 2])
    hue = np.degrees(np.arctan2(lab[..., 2], lab[..., 1]))
    return np.stack([lab[..., 0], chroma, hue], axis=-1)


def lch_to_lab(lch: np.ndarray) -> np.ndarray:
    lch = np.asarray(lch, dtype=np.float64)
    hue = np.radians(lch[..., 2])
    return np.stack(
        [lch[..., 0], lch[..., 1] * np.cos(hue), lch[..., 1] * np.sin(hue)], axis=-1
    )


def hue_angle(lab: np.ndarray) -> np.ndarray:
    lab = np.asarray(lab, dtype=np.float64)
    return np.degrees(np.arctan2(lab[..., 2], lab[..., 1]))


def chroma(lab: np.ndarray) -> np.ndarray:
    lab = np.asarray(lab, dtype=np.float64)
    return np.hypot(lab[..., 1], lab[..., 2])


def ita(lab: np.ndarray) -> np.ndarray:
    """Individual Typology Angle, degrees. Higher means lighter skin.

    The brief uses atan((L* - 50) / b*); note this is undefined for b* == 0,
    which is not reachable for ordinary skin. Callers should guard b*.
    """
    lab = np.asarray(lab, dtype=np.float64)
    b = lab[..., 2]
    safe_b = np.where(np.abs(b) < 1e-9, np.nan, b)
    return np.degrees(np.arctan((lab[..., 0] - 50.0) / safe_b))


def delta_e_76(lab1: np.ndarray, lab2: np.ndarray) -> np.ndarray:
    """Straight-line distance in CIELAB."""
    a = np.asarray(lab1, dtype=np.float64)
    b = np.asarray(lab2, dtype=np.float64)
    return np.sqrt(np.sum((a - b) ** 2, axis=-1))


def delta_e_ciede2000(
    lab1: np.ndarray,
    lab2: np.ndarray,
    k_l: float = 1.0,
    k_c: float = 1.0,
    k_h: float = 1.0,
) -> np.ndarray:
    """CIEDE2000 color difference (Sharma et al. implementation).

    Supports scalars, (..., 3) arrays, and broadcasting between them.
    """
    lab1 = np.asarray(lab1, dtype=np.float64)
    lab2 = np.asarray(lab2, dtype=np.float64)
    lab1, lab2 = np.broadcast_arrays(lab1, lab2)

    l1, a1, b1 = lab1[..., 0], lab1[..., 1], lab1[..., 2]
    l2, a2, b2 = lab2[..., 0], lab2[..., 1], lab2[..., 2]

    c1 = np.hypot(a1, b1)
    c2 = np.hypot(a2, b2)
    c_bar = (c1 + c2) / 2.0
    c_bar7 = c_bar**7
    g = 0.5 * (1.0 - np.sqrt(c_bar7 / (c_bar7 + 25.0**7)))

    a1p = (1.0 + g) * a1
    a2p = (1.0 + g) * a2
    c1p = np.hypot(a1p, b1)
    c2p = np.hypot(a2p, b2)

    h1p = np.degrees(np.arctan2(b1, a1p)) % 360.0
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360.0
    h1p = np.where(c1p == 0.0, 0.0, h1p)
    h2p = np.where(c2p == 0.0, 0.0, h2p)

    d_lp = l2 - l1
    d_cp = c2p - c1p
    dh = h2p - h1p
    dh = np.where(dh > 180.0, dh - 360.0, dh)
    dh = np.where(dh < -180.0, dh + 360.0, dh)
    dh = np.where(c1p * c2p == 0.0, 0.0, dh)
    d_hp = 2.0 * np.sqrt(c1p * c2p) * np.sin(np.radians(dh / 2.0))

    l_bar_p = (l1 + l2) / 2.0
    c_bar_p = (c1p + c2p) / 2.0
    h_sum = h1p + h2p
    h_bar_p = np.where(
        c1p * c2p == 0.0,
        h_sum,
        np.where(
            np.abs(h1p - h2p) <= 180.0,
            h_sum / 2.0,
            np.where(h_sum < 360.0, (h_sum + 360.0) / 2.0, (h_sum - 360.0) / 2.0),
        ),
    )

    t = (
        1.0
        - 0.17 * np.cos(np.radians(h_bar_p - 30.0))
        + 0.24 * np.cos(np.radians(2.0 * h_bar_p))
        + 0.32 * np.cos(np.radians(3.0 * h_bar_p + 6.0))
        - 0.20 * np.cos(np.radians(4.0 * h_bar_p - 63.0))
    )
    d_theta = 30.0 * np.exp(-(((h_bar_p - 275.0) / 25.0) ** 2))
    r_c = 2.0 * np.sqrt(c_bar_p**7 / (c_bar_p**7 + 25.0**7))
    s_l = 1.0 + (0.015 * (l_bar_p - 50.0) ** 2) / np.sqrt(
        20.0 + (l_bar_p - 50.0) ** 2
    )
    s_c = 1.0 + 0.045 * c_bar_p
    s_h = 1.0 + 0.015 * c_bar_p * t
    r_t = -np.sin(np.radians(2.0 * d_theta)) * r_c

    t_l = d_lp / (k_l * s_l)
    t_c = d_cp / (k_c * s_c)
    t_h = d_hp / (k_h * s_h)
    return np.sqrt(t_l**2 + t_c**2 + t_h**2 + r_t * t_c * t_h)


def clipping_fraction(
    srgb: np.ndarray,
    low: float = 1.0 / 255.0,
    high: float = 254.0 / 255.0,
    mask: np.ndarray | None = None,
) -> float:
    """Fraction of channels that are crushed to black or blown to white.

    Pass a boolean ``mask`` to measure clipping on a region (for example the
    skin mask) instead of the whole frame. A dark background or a bright window
    should not fail a capture whose subject is correctly exposed.
    """
    c = np.asarray(srgb, dtype=np.float64)
    clipped = (c <= low) | (c >= high)
    if mask is not None:
        selected = np.asarray(mask, dtype=bool)
        if selected.shape != c.shape[:2]:
            raise ValueError("mask shape must match image")
        if not selected.any():
            return 0.0
        clipped = clipped[selected]
    return float(np.mean(clipped))


def white_balance_gains(patch_linear: np.ndarray, target: float | None = None) -> np.ndarray:
    """Per-channel gains that make a gray patch neutral.

    ``patch_linear`` is (N, 3) or (3,) linear RGB. The target defaults to the
    mean of the patch's median channels, which preserves its overall level.
    """
    patch = np.asarray(patch_linear, dtype=np.float64)
    if patch.ndim == 1:
        patch = patch[None, :]
    median = np.median(patch.reshape(-1, 3), axis=0)
    if target is None:
        target = float(np.mean(median))
    safe = np.where(np.abs(median) < 1e-9, np.nan, median)
    gains = target / safe
    return np.where(np.isfinite(gains), gains, 1.0)


def apply_gains(rgb_linear: np.ndarray, gains: np.ndarray) -> np.ndarray:
    return np.asarray(rgb_linear, dtype=np.float64) * np.asarray(gains, dtype=np.float64)


def patch_color_cast(patch_linear: np.ndarray) -> float:
    """CIEDE2000 distance of a gray patch from neutral at the same L*.

    A well-balanced gray patch gives ~0; a strong tint gives a large value.
    This is measured *before* correction so the gate can reject bad captures.
    """
    patch = np.asarray(patch_linear, dtype=np.float64)
    if patch.ndim == 1:
        patch = patch[None, :]
    median = np.median(patch.reshape(-1, 3), axis=0)
    lab = linear_rgb_to_lab(median)
    neutral = np.array([lab[0], 0.0, 0.0])
    return float(delta_e_ciede2000(lab, neutral))
