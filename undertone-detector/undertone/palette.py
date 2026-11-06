"""Palette lookup and garment-to-palette scoring.

The bundled palette is a *starter*: it is not stylist-approved, and it is not a
claim about measured skin. Treat it as data to replace, then tune against
customer swatch overrides.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

import numpy as np

from .color import delta_e_ciede2000, linear_rgb_to_lab, srgb_to_linear

DEPTHS = ("light", "medium", "deep")
UNDERTONES = ("warm", "cool", "neutral")

_UNDERTONE_ALIASES = {
    "warm": "warm",
    "cool": "cool",
    "neutral": "neutral",
    "olive": "neutral",
}


@dataclass(frozen=True)
class PaletteColor:
    undertone: str
    depth: str
    name: str
    lab: np.ndarray
    tolerance: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "lab": [float(v) for v in self.lab],
            "tolerance": float(self.tolerance),
            "undertone": self.undertone,
            "depth": self.depth,
        }


def normalize_undertone(value: str) -> str:
    key = str(value).strip().lower()
    if key not in _UNDERTONE_ALIASES:
        raise ValueError(f"undertone must be one of {sorted(_UNDERTONE_ALIASES)}, got {value!r}")
    return _UNDERTONE_ALIASES[key]


def normalize_depth(value: str) -> str:
    key = str(value).strip().lower()
    aliases = {
        "light": "light",
        "very_light": "light",
        "intermediate": "medium",
        "medium": "medium",
        "tan": "medium",
        "brown": "deep",
        "deep": "deep",
        "dark": "deep",
    }
    if key not in aliases:
        raise ValueError(f"depth must be one of {sorted(aliases)}, got {value!r}")
    return aliases[key]


def depth_from_ita(ita_degrees: float) -> str:
    """Map ITA to the coarse depth buckets the palette table uses.

    The full ITA bands from the brief are reported separately; these three
    buckets only drive palette lookup.
    """
    if ita_degrees > 41.0:
        return "light"
    if ita_degrees > 10.0:
        return "medium"
    return "deep"


class Palette:
    def __init__(self, palettes: dict[str, Any], tolerance_default: float = 12.0):
        self._tolerance_default = float(tolerance_default)
        self._colors: dict[tuple[str, str], list[PaletteColor]] = {}
        for undertone, depths in palettes.items():
            u = normalize_undertone(undertone)
            for depth, entries in depths.items():
                if depth == "tolerance":
                    continue
                d = normalize_depth(depth)
                built: list[PaletteColor] = []
                for entry in entries:
                    built.append(
                        PaletteColor(
                            undertone=u,
                            depth=d,
                            name=str(entry["name"]),
                            lab=np.asarray(entry["lab"], dtype=np.float64),
                            tolerance=float(
                                entry.get(
                                    "tolerance",
                                    depths.get("tolerance", self._tolerance_default)
                                    if isinstance(depths, dict)
                                    else self._tolerance_default,
                                )
                            ),
                        )
                    )
                self._colors[(u, d)] = built

    @classmethod
    def from_json(cls, path: str | Path | None = None) -> "Palette":
        if path is None:
            path = Path(__file__).resolve().parent / "data" / "palette.json"
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return cls(payload["palettes"], float(payload.get("tolerance_default", 12.0)))

    def colors(self, undertone: str, depth: str) -> list[PaletteColor]:
        key = (normalize_undertone(undertone), normalize_depth(depth))
        if key not in self._colors:
            raise KeyError(f"no palette for {key}")
        return list(self._colors[key])

    def suggest(self, undertone: str, depth: str, limit: int | None = None) -> list[dict[str, Any]]:
        colors = self.colors(undertone, depth)
        if limit is not None:
            colors = colors[:limit]
        return [c.to_dict() for c in colors]

    def score_garment(
        self,
        garment_colors: Iterable[Any],
        undertone: str,
        depth: str,
    ) -> dict[str, Any]:
        """Score a garment against a palette.

        ``garment_colors`` accepts ``{"lab": [L, a, b], "weight": w}`` dicts,
        plain ``[L, a, b]`` sequences, or ``([L, a, b], weight)`` pairs.
        Lower is better; the score is the area-weighted CIEDE2000 distance from
        each garment colour to its nearest palette colour.
        """
        palette = self.colors(undertone, depth)
        palette_labs = np.stack([c.lab for c in palette])
        colors = _normalize_garment_colors(garment_colors)

        weighted = 0.0
        per_color: list[dict[str, Any]] = []
        for lab, weight in colors:
            distances = delta_e_ciede2000(lab[None, :], palette_labs)
            best = int(np.argmin(distances))
            best_distance = float(distances[best])
            weighted += weight * best_distance
            per_color.append(
                {
                    "lab": [float(v) for v in lab],
                    "weight": float(weight),
                    "best_match": palette[best].name,
                    "distance": best_distance,
                    "within_tolerance": bool(best_distance <= palette[best].tolerance),
                }
            )
        return {
            "score": float(weighted),
            "undertone": normalize_undertone(undertone),
            "depth": normalize_depth(depth),
            "per_color": per_color,
        }

    def rank_garments(
        self,
        garments: Sequence[dict[str, Any]],
        undertone: str,
        depth: str,
        score_key: str = "score",
    ) -> list[dict[str, Any]]:
        ranked: list[dict[str, Any]] = []
        for garment in garments:
            result = self.score_garment(garment.get("colors", []), undertone, depth)
            item = dict(garment)
            item[score_key] = result["score"]
            item["color_matches"] = result["per_color"]
            ranked.append(item)
        ranked.sort(key=lambda item: item[score_key])
        return ranked


def _normalize_garment_colors(garment_colors: Iterable[Any]) -> list[tuple[np.ndarray, float]]:
    normalized: list[tuple[np.ndarray, float]] = []
    for item in garment_colors:
        weight = 1.0
        if isinstance(item, dict):
            lab = item.get("lab", item.get("color"))
            weight = float(item.get("weight", 1.0))
        elif (
            isinstance(item, (tuple, list))
            and len(item) == 2
            and np.asarray(item[0]).shape == (3,)
        ):
            lab, weight = item[0], float(item[1])
        else:
            lab = item
        arr = np.asarray(lab, dtype=np.float64).reshape(3)
        normalized.append((arr, max(weight, 0.0)))
    if not normalized:
        raise ValueError("garment has no colors to score")
    total = sum(w for _, w in normalized)
    if total <= 0.0:
        even = 1.0 / len(normalized)
        return [(lab, even) for lab, _ in normalized]
    return [(lab, w / total) for lab, w in normalized]


def _kmeans_lab(
    pixels: np.ndarray, k: int, iterations: int = 25, seed: int = 0
) -> tuple[np.ndarray, np.ndarray]:
    pixels = np.asarray(pixels, dtype=np.float64)
    n = pixels.shape[0]
    k = max(1, min(k, n))
    rng = np.random.default_rng(seed)

    centers = [pixels[int(rng.integers(0, n))]]
    for _ in range(1, k):
        distances = np.min(
            ((pixels[:, None, :] - np.array(centers)[None, :, :]) ** 2).sum(axis=-1),
            axis=1,
        )
        total = distances.sum()
        if total <= 0.0:
            centers.append(pixels[int(rng.integers(0, n))])
        else:
            centers.append(pixels[int(rng.choice(n, p=distances / total))])
    centers_arr = np.array(centers, dtype=np.float64)

    labels = np.zeros(n, dtype=np.int32)
    for _ in range(iterations):
        distances = ((pixels[:, None, :] - centers_arr[None, :, :]) ** 2).sum(axis=-1)
        labels = np.argmin(distances, axis=1)
        changed = False
        for index in range(k):
            members = pixels[labels == index]
            if members.size == 0:
                far = int(np.argmax(np.min(distances, axis=1)))
                new_center = pixels[far]
            else:
                new_center = members.mean(axis=0)
            if not np.allclose(new_center, centers_arr[index]):
                changed = True
            centers_arr[index] = new_center
        if not changed:
            break

    counts = np.array([(labels == i).sum() for i in range(k)], dtype=np.float64)
    return centers_arr, counts


def dominant_colors(
    srgb: np.ndarray,
    mask: np.ndarray | None = None,
    k: int = 3,
    seed: int = 0,
    max_pixels: int = 20_000,
) -> list[dict[str, Any]]:
    """K-means dominant colours in CIELAB, with area weights.

    ``srgb`` is an (H, W, 3) gamma-encoded image in [0, 1].
    """
    rgb = np.asarray(srgb, dtype=np.float64)
    if rgb.ndim != 3 or rgb.shape[-1] != 3:
        raise ValueError("srgb must have shape (H, W, 3)")
    if mask is None:
        mask = np.ones(rgb.shape[:2], dtype=bool)
    mask = np.asarray(mask, dtype=bool)
    if mask.shape != rgb.shape[:2]:
        raise ValueError("mask shape must match image")
    pixels = rgb[mask]
    if pixels.shape[0] == 0:
        raise ValueError("mask selects no pixels")
    lab = linear_rgb_to_lab(srgb_to_linear(pixels))
    if lab.shape[0] > max_pixels:
        idx = np.linspace(0, lab.shape[0] - 1, max_pixels, dtype=int)
        lab = lab[idx]
    centers, counts = _kmeans_lab(lab, k, seed=seed)
    order = np.argsort(-counts)
    total = counts.sum()
    return [
        {
            "lab": [float(v) for v in centers[i]],
            "weight": float(counts[i] / total) if total > 0 else 0.0,
        }
        for i in order
    ]
