"""Synthetic face renderer used to exercise the pipeline without a dataset.

This is a test fixture, not a model of a real face. It exists so the capture,
gate, feature, and palette code can be run end-to-end on a machine with no
camera and no labeled images.
"""

from __future__ import annotations

import numpy as np

from .color import lab_to_srgb


def render_face(
    width: int = 420,
    height: int = 520,
    skin_lab: tuple[float, float, float] = (60.0, 12.0, 22.0),
    cast: tuple[float, float, float] = (1.0, 0.99, 0.95),
    patch: bool = True,
    shading: bool = True,
    seed: int = 0,
) -> np.ndarray:
    """Render a synthetic face in gamma-encoded sRGB [0, 1].

    Returns an (H, W, 3) array. A gray patch in the top-left corner (when
    ``patch`` is true) is the reference target for white balance.
    """
    if width < 120 or height < 120:
        raise ValueError("image must be at least 120x120")
    rng = np.random.default_rng(seed)

    yy, xx = np.mgrid[0:height, 0:width].astype(np.float64)
    image = np.empty((height, width, 3), dtype=np.float64)
    image[:] = np.array([0.62, 0.66, 0.74])

    cx = width * 0.5
    cy = height * 0.46
    rx = width * 0.30
    ry = height * 0.34

    face = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1.0
    neck = (
        (xx >= cx - rx * 0.42)
        & (xx <= cx + rx * 0.42)
        & (yy >= cy + ry * 0.72)
        & (yy <= cy + ry * 1.30)
    )
    skin = face | neck

    hair = (
        ((xx - cx) / (rx * 1.10)) ** 2 + ((yy - (cy - ry * 0.18)) / (ry * 0.95)) ** 2
        <= 1.0
    ) & ~face
    image[hair] = np.array([0.12, 0.08, 0.06])

    base_skin = lab_to_srgb(np.asarray(skin_lab, dtype=np.float64))
    skin_rgb = np.broadcast_to(base_skin, image.shape).copy()
    if shading:
        d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
        shade = 0.86 + 0.14 * np.clip(1.0 - d, 0.0, 1.0)
        shade = shade + 0.02 * (1.0 - xx / width)
        skin_rgb = skin_rgb * shade[..., None]

    image[neck] = skin_rgb[neck]
    image[face] = skin_rgb[face]

    def ellipse(ex: float, ey: float, erx: float, ery: float) -> np.ndarray:
        return ((xx - ex) / erx) ** 2 + ((yy - ey) / ery) ** 2 <= 1.0

    eye_l = ellipse(cx - rx * 0.36, cy - ry * 0.10, rx * 0.13, ry * 0.07)
    eye_r = ellipse(cx + rx * 0.36, cy - ry * 0.10, rx * 0.13, ry * 0.07)
    image[eye_l | eye_r] = np.array([0.05, 0.04, 0.05])

    brow_l = ellipse(cx - rx * 0.36, cy - ry * 0.20, rx * 0.16, ry * 0.035)
    brow_r = ellipse(cx + rx * 0.36, cy - ry * 0.20, rx * 0.16, ry * 0.035)
    image[brow_l | brow_r] = np.array([0.16, 0.10, 0.07])

    lips = ellipse(cx, cy + ry * 0.16, rx * 0.20, ry * 0.07)
    image[lips] = np.array([0.55, 0.26, 0.28])

    if patch:
        size = int(min(width, height) * 0.11)
        margin = max(8, int(min(width, height) * 0.03))
        image[margin : margin + size, margin : margin + size] = 0.5

    image = image * np.asarray(cast, dtype=np.float64)[None, None, :]
    image = image + rng.normal(0.0, 0.006, size=image.shape)
    return np.clip(image, 0.0, 1.0)
