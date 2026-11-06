"""Automatic reference-patch detection.

The capture pipeline needs a neutral reference patch to remove the store light's
color cast. Typing its rectangle by hand is brittle, so this module finds the
largest neutral, uniform, roughly rectangular region in a frame and returns its
bounding box.

It is a convenience, not magic: a white wall, a gray shelf, or a shiny surface
can also look neutral. The detector scores uniformity, rectangularity, aspect
ratio, and contrast against the surrounding ring, can restrict the search to the
frame border where the reference patch normally lives, and returns ``None``
rather than guessing when nothing is plausible.

``PatchTracker`` adds temporal confirmation for live video: a rectangle is
accepted only after it appears in consecutive frames, and is dropped after
several misses.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

import numpy as np

from .color import chroma as _chroma
from .color import delta_e_76, linear_rgb_to_lab, srgb_to_linear
from .features import clean_mask, largest_component

MAX_AREA_FRACTION = 0.25


@dataclass(frozen=True)
class PatchDetection:
    rect: tuple[int, int, int, int]
    area: int
    rectangularity: float
    contrast: float
    chroma: float
    L: float
    L_std: float
    aspect: float
    score: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "rect": list(self.rect),
            "area": int(self.area),
            "rectangularity": float(self.rectangularity),
            "contrast": float(self.contrast),
            "chroma": float(self.chroma),
            "L": float(self.L),
            "L_std": float(self.L_std),
            "aspect": float(self.aspect),
            "score": float(self.score),
        }


def _border_mask(shape: tuple[int, int], fraction: float) -> np.ndarray:
    height, width = shape
    band = max(1, int(round(min(height, width) * fraction)))
    mask = np.zeros(shape, dtype=bool)
    mask[:band, :] = True
    mask[-band:, :] = True
    mask[:, :band] = True
    mask[:, -band:] = True
    return mask


def _components(
    mask: np.ndarray, min_area: int
) -> list[np.ndarray]:
    """Boolean masks for each connected component above ``min_area``."""
    mask = np.asarray(mask, dtype=bool)
    if not mask.any():
        return []
    try:
        import cv2

        count, labels, stats, _ = cv2.connectedComponentsWithStats(
            np.ascontiguousarray(mask, dtype=np.uint8), connectivity=4
        )
        components: list[np.ndarray] = []
        for index in range(1, int(count)):
            if int(stats[index, cv2.CC_STAT_AREA]) < min_area:
                continue
            components.append(labels == index)
        return components
    except (ImportError, AttributeError):
        component = largest_component(mask)
        if int(component.sum()) < min_area:
            return []
        return [component]


def _boundary_contrast(
    lab: np.ndarray, rect: tuple[int, int, int, int], ring: int
) -> float:
    """CIEDE76 distance between the patch median and its surrounding ring."""
    height, width = lab.shape[:2]
    x, y, w, h = rect
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(width, x + w), min(height, y + h)
    if x1 <= x0 or y1 <= y0:
        return float("nan")
    ox0, oy0 = max(0, x0 - ring), max(0, y0 - ring)
    ox1, oy1 = min(width, x1 + ring), min(height, y1 + ring)
    crop = lab[oy0:oy1, ox0:ox1]
    outside = np.ones(crop.shape[:2], dtype=bool)
    outside[y0 - oy0 : y1 - oy0, x0 - ox0 : x1 - ox0] = False
    if not outside.any():
        return float("nan")
    inside_lab = np.median(lab[y0:y1, x0:x1].reshape(-1, 3), axis=0)
    outside_lab = np.median(crop[outside], axis=0)
    return float(delta_e_76(inside_lab, outside_lab))


def _search(
    lab: np.ndarray,
    neutral: np.ndarray,
    *,
    min_area: int,
    min_rectangularity: float,
    max_area_fraction: float,
    max_L_std: float,
    min_contrast: float,
    max_aspect: float,
    reject_edge_touching: bool,
) -> PatchDetection | None:
    height, width = lab.shape[:2]
    chroma = _chroma(lab)
    best: PatchDetection | None = None
    for component in _components(neutral, min_area):
        area = int(component.sum())
        if area <= 0 or area > max_area_fraction * height * width:
            continue
        ys, xs = np.nonzero(component)
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        if reject_edge_touching and (
            x0 <= 0 or y0 <= 0 or x1 >= width or y1 >= height
        ):
            continue
        box_area = max((x1 - x0) * (y1 - y0), 1)
        rectangularity = float(area / box_area)
        if rectangularity < min_rectangularity:
            continue
        aspect = max((x1 - x0) / max(y1 - y0, 1), (y1 - y0) / max(x1 - x0, 1))
        if aspect > max_aspect:
            continue

        values = lab[component]
        L_std = float(np.std(values[:, 0]))
        if L_std > max_L_std:
            continue
        contrast = _boundary_contrast(lab, (x0, y0, x1 - x0, y1 - y0), ring=5)
        if not np.isfinite(contrast) or contrast < min_contrast:
            continue

        median_chroma = float(np.median(chroma[component]))
        score = float(
            area * rectangularity * min(contrast, 20.0) / (1.0 + median_chroma)
        )
        candidate = PatchDetection(
            rect=(x0, y0, x1 - x0, y1 - y0),
            area=area,
            rectangularity=rectangularity,
            contrast=contrast,
            chroma=median_chroma,
            L=float(np.median(values[:, 0])),
            L_std=L_std,
            aspect=aspect,
            score=score,
        )
        if best is None or candidate.score > best.score:
            best = candidate
    return best


def _edge_candidates(
    lab: np.ndarray,
    *,
    max_chroma: float,
    min_L: float,
    max_L: float,
    min_area: int,
    min_rectangularity: float,
    max_area_fraction: float,
    max_L_std: float,
    min_contrast: float,
    max_aspect: float,
    reject_edge_touching: bool,
) -> PatchDetection | None:
    """Find an axis-aligned neutral quadrilateral from image edges.

    This catches a card on a neutral wall, where the low-chroma mask merges the
    card into the background. OpenCV is optional; without it this returns
    ``None`` and the caller keeps the component-based result.
    """
    try:
        import cv2
    except ImportError:
        return None

    height, width = lab.shape[:2]
    gray = np.clip(lab[..., 0] / 100.0 * 255.0, 0.0, 255.0).astype(np.uint8)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 30, 90)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    chroma = _chroma(lab)
    best: PatchDetection | None = None
    for contour in contours:
        area = float(cv2.contourArea(contour))
        if area < min_area or area > max_area_fraction * height * width:
            continue
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(approx) != 4 or not cv2.isContourConvex(approx):
            continue
        x, y, w, h = cv2.boundingRect(approx)
        if w <= 1 or h <= 1:
            continue
        if reject_edge_touching and (
            x <= 0 or y <= 0 or x + w >= width or y + h >= height
        ):
            continue
        rectangularity = float(area / (w * h))
        if rectangularity < min_rectangularity:
            continue
        aspect = max(w / h, h / w)
        if aspect > max_aspect:
            continue

        margin = max(1, int(round(min(w, h) * 0.1)))
        x0, y0 = x + margin, y + margin
        x1, y1 = x + w - margin, y + h - margin
        if x1 <= x0 or y1 <= y0:
            continue
        inside = lab[y0:y1, x0:x1].reshape(-1, 3)
        median_chroma = float(np.median(chroma[y0:y1, x0:x1]))
        if median_chroma > max_chroma:
            continue
        median_L = float(np.median(inside[:, 0]))
        if not (min_L <= median_L <= max_L):
            continue
        L_std = float(np.std(inside[:, 0]))
        if L_std > max_L_std:
            continue
        contrast = _boundary_contrast(lab, (x, y, w, h), ring=5)
        if not np.isfinite(contrast) or contrast < min_contrast:
            continue

        score = float(
            area * rectangularity * min(contrast, 20.0) / (1.0 + median_chroma)
        )
        candidate = PatchDetection(
            rect=(x, y, w, h),
            area=int(round(area)),
            rectangularity=rectangularity,
            contrast=contrast,
            chroma=median_chroma,
            L=median_L,
            L_std=L_std,
            aspect=aspect,
            score=score,
        )
        if best is None or candidate.score > best.score:
            best = candidate
    return best


def find_gray_patch(
    srgb: np.ndarray,
    *,
    max_chroma: float = 5.0,
    min_L: float = 25.0,
    max_L: float = 92.0,
    min_area: int = 400,
    min_rectangularity: float = 0.65,
    max_area_fraction: float = MAX_AREA_FRACTION,
    max_L_std: float = 3.0,
    min_contrast: float = 2.0,
    max_aspect: float = 5.0,
    border_only: bool = True,
    border_fraction: float = 0.30,
    fallback_anywhere: bool = True,
    reject_edge_touching: bool = True,
    edge_fallback: bool = True,
) -> PatchDetection | None:
    """Find the best neutral reference patch in a gamma-encoded sRGB frame.

    A candidate must be neutral, uniform, roughly rectangular, not extremely
    elongated, large enough to measure, small enough not to be the background,
    and visibly different from its surrounding ring. Components touching the
    frame edge are rejected because they are usually walls or furniture.

    When nothing is found in the border, ``fallback_anywhere`` retries the whole
    frame. Returns ``None`` when no candidate is plausible; callers should then
    continue without a reference patch (and treat absolute color as unreliable)
    instead of using a bad patch.
    """
    image = np.asarray(srgb, dtype=np.float64)
    if image.ndim != 3 or image.shape[-1] != 3:
        raise ValueError("image must have shape (H, W, 3)")
    if image.dtype == np.uint8 or (image.size and float(np.nanmax(image)) > 1.5):
        image = image / 255.0
    image = np.clip(image, 0.0, 1.0)
    height, width = image.shape[:2]

    lab = linear_rgb_to_lab(srgb_to_linear(image))
    neutral = (
        (_chroma(lab) <= max_chroma)
        & (lab[..., 0] >= min_L)
        & (lab[..., 0] <= max_L)
    )

    search_kwargs = dict(
        min_area=min_area,
        min_rectangularity=min_rectangularity,
        max_area_fraction=max_area_fraction,
        max_L_std=max_L_std,
        min_contrast=min_contrast,
        max_aspect=max_aspect,
        reject_edge_touching=reject_edge_touching,
    )
    if border_only:
        border = neutral & _border_mask((height, width), border_fraction)
        best = _search(lab, clean_mask(border), **search_kwargs)
        if best is None and fallback_anywhere:
            best = _search(lab, clean_mask(neutral), **search_kwargs)
    else:
        best = _search(lab, clean_mask(neutral), **search_kwargs)

    if best is None and edge_fallback:
        best = _edge_candidates(
            lab,
            max_chroma=max_chroma,
            min_L=min_L,
            max_L=max_L,
            min_area=min_area,
            min_rectangularity=min_rectangularity,
            max_area_fraction=max_area_fraction,
            max_L_std=max_L_std,
            min_contrast=min_contrast,
            max_aspect=max_aspect,
            reject_edge_touching=reject_edge_touching,
        )
    return best


def _iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax0, ay0, aw, ah = a
    bx0, by0, bw, bh = b
    ax1, ay1, bx1, by1 = ax0 + aw, ay0 + ah, bx0 + bw, by0 + bh
    ix = max(0, min(ax1, bx1) - max(ax0, bx0))
    iy = max(0, min(ay1, by1) - max(ay0, by0))
    intersection = ix * iy
    union = aw * ah + bw * bh - intersection
    return float(intersection / union) if union > 0 else 0.0


@dataclass
class PatchTracker:
    """Temporal confirmation for live video.

    ``update`` returns a stable detection only after the same rectangle appears
    in ``confirmations`` consecutive checks. A stable rectangle is reused until
    ``recheck_interval`` calls pass, after which it is re-detected; ``max_missed``
    consecutive misses drop it so a removed card does not stay in the overlay.
    """

    confirmations: int = 2
    max_missed: int = 30
    recheck_interval: int = 120
    _stable: PatchDetection | None = field(default=None, init=False)
    _candidate: PatchDetection | None = field(default=None, init=False)
    _hits: int = field(default=0, init=False)
    _misses: int = field(default=0, init=False)
    _since_check: int = field(default=0, init=False)

    @property
    def detection(self) -> PatchDetection | None:
        return self._stable

    def update(self, srgb: np.ndarray, *, force: bool = False) -> PatchDetection | None:
        self._since_check += 1
        if (
            self._stable is not None
            and not force
            and self._since_check < self.recheck_interval
        ):
            return self._stable

        self._since_check = 0
        found = find_gray_patch(srgb)
        if found is None:
            self._misses += 1
            self._hits = 0
            if self._stable is not None and self._misses >= self.max_missed:
                self._stable = None
                self._candidate = None
            return self._stable

        self._misses = 0
        if self._stable is not None and _iou(self._stable.rect, found.rect) >= 0.4:
            self._stable = found
            self._candidate = found
            self._hits = self.confirmations
            return self._stable

        if (
            self._candidate is not None
            and _iou(self._candidate.rect, found.rect) >= 0.3
        ):
            self._hits += 1
        else:
            self._hits = 1
        self._candidate = found
        if self._hits >= self.confirmations:
            self._stable = found
        return self._stable


def find_stable_patch(
    frames: Iterable[np.ndarray],
    *,
    confirmations: int = 2,
) -> PatchDetection | None:
    """Return a patch confirmed across consecutive frames, or ``None``."""
    tracker = PatchTracker(confirmations=confirmations, recheck_interval=1_000_000)
    result: PatchDetection | None = None
    for frame in frames:
        result = tracker.update(frame, force=True)
    return result
