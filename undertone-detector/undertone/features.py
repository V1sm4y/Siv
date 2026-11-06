"""Skin pixel selection and robust CIELAB features.

The default mask is a YCbCr skin heuristic because it has no model download
and runs anywhere. It is deliberately conservative and is *not* a substitute
for face landmarks/parsing in production: pass a MediaPipe Face Mesh mask and
region provider through ``AnalysisConfig.mask_provider`` /
``region_provider`` for real deployments (see README).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .color import (
    chroma as _chroma,
    hue_angle as _hue_angle,
    ita as _ita,
    linear_rgb_to_lab,
)

# Region boxes in face-bounding-box-relative coordinates (x0, x1, y0, y1).
# Chosen to avoid eyes/lips/brows while still covering the areas named in the
# brief: cheeks, forehead, jaw.
REGION_BOXES: dict[str, tuple[float, float, float, float]] = {
    "forehead": (0.28, 0.72, 0.04, 0.22),
    "left_cheek": (0.12, 0.40, 0.42, 0.68),
    "right_cheek": (0.60, 0.88, 0.42, 0.68),
    "jaw": (0.34, 0.66, 0.72, 0.90),
}

MIN_REGION_PIXELS = 40


@dataclass(frozen=True)
class RegionStats:
    name: str
    n_pixels: int
    L: float
    a: float
    b: float
    hue: float
    chroma: float


def srgb_to_ycbcr(srgb: np.ndarray) -> np.ndarray:
    """BT.601 YCbCr (Cb/Cr centred on 128) for skin heuristics."""
    rgb = np.asarray(srgb, dtype=np.float64) * 255.0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 128.0 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128.0 + 0.5 * r - 0.418688 * g - 0.081312 * b
    return np.stack([y, cb, cr], axis=-1)


def _erode(mask: np.ndarray) -> np.ndarray:
    out = mask.copy()
    out[1:, :] &= mask[:-1, :]
    out[:-1, :] &= mask[1:, :]
    out[:, 1:] &= mask[:, :-1]
    out[:, :-1] &= mask[:, 1:]
    return out


def _dilate(mask: np.ndarray) -> np.ndarray:
    out = mask.copy()
    out[1:, :] |= mask[:-1, :]
    out[:-1, :] |= mask[1:, :]
    out[:, 1:] |= mask[:, :-1]
    out[:, :-1] |= mask[:, 1:]
    return out


def clean_mask(mask: np.ndarray) -> np.ndarray:
    """One opening then one closing, using 4-neighbour morphology."""
    opened = _dilate(_erode(mask))
    return _erode(_dilate(opened))


def largest_component(mask: np.ndarray) -> np.ndarray:
    """Largest 4-connected component of a boolean mask.

    Uses OpenCV's connected-components when it is installed (fast path for
    live capture) and falls back to a pure-Python flood fill otherwise.
    """
    mask = np.asarray(mask, dtype=bool)
    if not mask.any():
        return mask
    try:
        import cv2

        count, labels, stats, _ = cv2.connectedComponentsWithStats(
            np.ascontiguousarray(mask, dtype=np.uint8), connectivity=4
        )
        if count <= 1:
            return mask
        largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        return labels == largest
    except (ImportError, AttributeError):
        pass

    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    best_label = 0
    best_size = 0
    current = 0
    # Flatten indexing for speed.
    flat = mask.ravel()
    labels_flat = labels.ravel()
    stack: list[int] = []
    n = flat.size
    for start in range(n):
        if not flat[start] or labels_flat[start]:
            continue
        current += 1
        size = 0
        stack.append(start)
        labels_flat[start] = current
        while stack:
            idx = stack.pop()
            size += 1
            y, x = divmod(idx, w)
            if y > 0:
                nb = idx - w
                if flat[nb] and not labels_flat[nb]:
                    labels_flat[nb] = current
                    stack.append(nb)
            if y + 1 < h:
                nb = idx + w
                if flat[nb] and not labels_flat[nb]:
                    labels_flat[nb] = current
                    stack.append(nb)
            if x > 0:
                nb = idx - 1
                if flat[nb] and not labels_flat[nb]:
                    labels_flat[nb] = current
                    stack.append(nb)
            if x + 1 < w:
                nb = idx + 1
                if flat[nb] and not labels_flat[nb]:
                    labels_flat[nb] = current
                    stack.append(nb)
        if size > best_size:
            best_size = size
            best_label = current
    return (labels == best_label).reshape(h, w)


def skin_mask_srgb(
    srgb: np.ndarray,
    y_range: tuple[float, float] = (30.0, 250.0),
    cb_range: tuple[float, float] = (77.0, 127.0),
    cr_range: tuple[float, float] = (133.0, 173.0),
    restrict_to_largest: bool = True,
    max_pixels_for_component: int = 500_000,
) -> np.ndarray:
    """Conservative YCbCr skin mask for calibration and demos."""
    ycbcr = srgb_to_ycbcr(srgb)
    y, cb, cr = ycbcr[..., 0], ycbcr[..., 1], ycbcr[..., 2]
    mask = (
        (y >= y_range[0])
        & (y <= y_range[1])
        & (cb >= cb_range[0])
        & (cb <= cb_range[1])
        & (cr >= cr_range[0])
        & (cr <= cr_range[1])
    )
    mask = clean_mask(mask)
    if restrict_to_largest and mask.sum() <= max_pixels_for_component:
        mask = largest_component(mask)
    return mask


def bounding_box(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.nonzero(mask)
    if ys.size == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def region_masks(mask: np.ndarray) -> dict[str, np.ndarray]:
    """Split a face mask into the brief's sampling regions.

    Falls back to the whole mask if the face is too small or off-frame for any
    region to reach ``MIN_REGION_PIXELS``.
    """
    bbox = bounding_box(mask)
    if bbox is None:
        return {}
    x_min, y_min, x_max, y_max = bbox
    bw = x_max - x_min
    bh = y_max - y_min
    regions: dict[str, np.ndarray] = {}
    for name, (x0, x1, y0, y1) in REGION_BOXES.items():
        xs = x_min + int(round(x0 * bw))
        xe = x_min + int(round(x1 * bw))
        ys = y_min + int(round(y0 * bh))
        ye = y_min + int(round(y1 * bh))
        rect = np.zeros_like(mask, dtype=bool)
        rect[max(ys, 0) : max(ye, 0), max(xs, 0) : max(xe, 0)] = True
        region = rect & mask
        if int(region.sum()) >= MIN_REGION_PIXELS:
            regions[name] = region
    if not regions:
        regions["face"] = mask
    return regions


def union_masks(masks: dict[str, np.ndarray]) -> np.ndarray:
    if not masks:
        return np.zeros((0, 0), dtype=bool)
    out = np.zeros_like(next(iter(masks.values())), dtype=bool)
    for mask in masks.values():
        out |= mask
    return out


def robust_lab(
    lab: np.ndarray, mask: np.ndarray, trim: tuple[float, float] = (20.0, 80.0)
) -> dict[str, float | int]:
    """Median LAB over pixels between the ``trim`` L* percentiles."""
    values = np.asarray(lab, dtype=np.float64)[mask]
    if values.size == 0:
        raise ValueError("no pixels selected for measurement")
    l_values = values[:, 0]
    lo, hi = np.percentile(l_values, trim)
    keep = (l_values >= lo) & (l_values <= hi)
    if not keep.any():
        keep = np.ones_like(l_values, dtype=bool)
    selected = values[keep]
    median = np.median(selected, axis=0)
    return {
        "L": float(median[0]),
        "a": float(median[1]),
        "b": float(median[2]),
        "n_pixels": int(values.shape[0]),
        "n_trimmed": int(selected.shape[0]),
        "L_p05": float(np.percentile(l_values, 5)),
        "L_p95": float(np.percentile(l_values, 95)),
    }


def skin_features(rgb_linear: np.ndarray) -> dict[str, float]:
    """Starter-code equivalent from the brief for an (N, 3) linear RGB array."""
    rgb = np.asarray(rgb_linear, dtype=np.float64)
    lab = linear_rgb_to_lab(rgb.reshape(-1, 1, 3)).reshape(-1, 3)
    stats = robust_lab(lab, np.ones(lab.shape[0], dtype=bool))
    l_star = stats["L"]
    a_star = stats["a"]
    b_star = stats["b"]
    return {
        "L": l_star,
        "a": a_star,
        "b": b_star,
        "hue": float(_hue_angle(np.array([l_star, a_star, b_star]))),
        "chroma": float(_chroma(np.array([l_star, a_star, b_star]))),
        "ita": float(_ita(np.array([l_star, a_star, b_star]))),
    }


def region_statistics(lab: np.ndarray, regions: dict[str, np.ndarray]) -> dict[str, RegionStats]:
    stats: dict[str, RegionStats] = {}
    for name, mask in regions.items():
        values = np.asarray(lab, dtype=np.float64)[mask]
        if values.size == 0:
            continue
        median = np.median(values, axis=0)
        stats[name] = RegionStats(
            name=name,
            n_pixels=int(values.shape[0]),
            L=float(median[0]),
            a=float(median[1]),
            b=float(median[2]),
            hue=float(_hue_angle(median)),
            chroma=float(_chroma(median)),
        )
    return stats


def region_agreement(regions: dict[str, RegionStats]) -> dict[str, float | int]:
    """How consistent hue and L* are across independently sampled regions."""
    if not regions:
        return {"n_regions": 0, "hue_std": float("nan"), "L_std": float("nan")}
    hues = np.array([r.hue for r in regions.values()], dtype=np.float64)
    ls = np.array([r.L for r in regions.values()], dtype=np.float64)
    return {
        "n_regions": int(hues.size),
        "hue_std": float(np.std(hues)),
        "L_std": float(np.std(ls)),
    }


def _wrap180(degrees: float) -> float:
    return (float(degrees) + 180.0) % 360.0 - 180.0


def circular_mean_deg(
    values: np.ndarray, weights: np.ndarray | None = None
) -> float:
    """Weighted circular mean of angles in degrees."""
    angles = np.radians(np.asarray(values, dtype=np.float64))
    if weights is None:
        weights = np.ones_like(angles)
    else:
        weights = np.asarray(weights, dtype=np.float64)
    x = float(np.sum(weights * np.cos(angles)))
    y = float(np.sum(weights * np.sin(angles)))
    if x == 0.0 and y == 0.0:
        return 0.0
    return float(np.degrees(np.arctan2(y, x)))


def circular_std_deg(
    values: np.ndarray, weights: np.ndarray | None = None
) -> float:
    """Circular standard deviation of angles in degrees."""
    angles = np.radians(np.asarray(values, dtype=np.float64))
    if weights is None:
        weights = np.ones_like(angles)
    else:
        weights = np.asarray(weights, dtype=np.float64)
    total = float(np.sum(weights))
    if total <= 0.0:
        return float("nan")
    resultant = float(
        np.hypot(
            np.sum(weights * np.cos(angles)) / total,
            np.sum(weights * np.sin(angles)) / total,
        )
    )
    resultant = float(np.clip(resultant, 1e-12, 1.0))
    return float(np.degrees(np.sqrt(max(-2.0 * np.log(resultant), 0.0))))


def fuse_region_hues(
    regions: dict[str, RegionStats],
    outlier_deg: float = 6.0,
    weight_power: float = 0.5,
) -> dict[str, object]:
    """Combine per-region hues into one robust estimate.

    Region medians already resist per-pixel noise, but one contaminated region
    (beard shadow, glasses, a specular patch) can still pull the union median.
    This takes the circular median of the region hues, drops regions that
    disagree by more than ``outlier_deg`` (or 2.5 robust sigma), and returns the
    pixel-weighted circular mean of the survivors.

    ``weight_power`` controls how strongly large regions dominate; 0.5 uses
    ``sqrt(n_pixels)`` so a big region cannot swamp a well-measured small one.
    """
    if not regions:
        return {
            "hue": float("nan"),
            "hue_std": float("nan"),
            "hue_sem": float("nan"),
            "n_regions": 0,
            "used": [],
            "rejected": [],
        }

    names = list(regions)
    hues = np.array([regions[name].hue for name in names], dtype=np.float64)
    counts = np.array([max(int(regions[name].n_pixels), 1) for name in names], dtype=np.float64)
    weights = counts**weight_power

    if hues.size == 1:
        return {
            "hue": float(hues[0]),
            "hue_std": 0.0,
            "hue_sem": 0.0,
            "n_regions": 1,
            "used": names,
            "rejected": [],
        }

    reference = circular_mean_deg(hues, weights)
    # Unwrap around the reference so skin hues near a wrap boundary stay
    # contiguous; skin is normally 0-90 degrees, but this keeps the code general.
    unwrapped = reference + np.array([_wrap180(h - reference) for h in hues])
    median = float(np.median(unwrapped))
    deviations = np.abs(unwrapped - median)
    mad = float(np.median(deviations))
    robust_sigma = 1.4826 * mad
    threshold = max(float(outlier_deg), 2.5 * robust_sigma)

    keep = deviations <= threshold
    if not keep.any():
        keep[int(np.argmin(deviations))] = True

    kept_hues = hues[keep]
    kept_weights = weights[keep]
    hue = circular_mean_deg(kept_hues, kept_weights)
    hue_std = circular_std_deg(kept_hues, kept_weights) if kept_hues.size > 1 else 0.0
    n_used = int(kept_hues.size)
    return {
        "hue": float(hue),
        "hue_std": float(hue_std),
        "hue_sem": float(hue_std / np.sqrt(n_used)) if n_used > 1 else 0.0,
        "n_regions": int(hues.size),
        "used": [names[i] for i in np.flatnonzero(keep)],
        "rejected": [names[i] for i in np.flatnonzero(~keep)],
    }
