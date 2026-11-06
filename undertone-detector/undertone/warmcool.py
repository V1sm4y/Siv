"""Data-driven calibration of the warm-to-cool position.

The default anchors (``neutral_hue=55``, ``hue_span=12``) are a presentation
choice. This module lets a store fit those anchors on its own labelled swatch
picks, which is the only way to claim an accuracy figure for this task.

It also removes the melanin/lightness confound: darker skin has a higher ``b*``
and therefore a higher raw hue. A fixed-effects slope estimates how hue moves
with ``L*`` *within* a label, and the position is computed from the residual.
That keeps depth from masquerading as warmth.

No data is bundled or sent anywhere. Pass a list of
``{"L": ..., "a": ..., "b": ..., "label": "warm"|"cool"|"neutral"}`` records,
or a CSV with those columns.
"""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Iterable, Mapping

import numpy as np

from .detect import AnalysisConfig, warm_cool_position
from .features import _wrap180, circular_mean_deg

LABELS = ("warm", "neutral", "cool")
_LABEL_TARGET = {"warm": 1.0, "neutral": 0.0, "cool": -1.0}
_LABEL_ALIASES = {
    "warm": "warm",
    "golden": "warm",
    "yellow": "warm",
    "cool": "cool",
    "pink": "cool",
    "blue": "cool",
    "neutral": "neutral",
    "olive": "neutral",
    "n": "neutral",
    "w": "warm",
    "c": "cool",
}


def _normalize_label(value: Any) -> str:
    key = str(value).strip().lower()
    if key not in _LABEL_ALIASES:
        raise ValueError(
            f"label must be warm, cool, or neutral (got {value!r})"
        )
    return _LABEL_ALIASES[key]


def _hue(a: float, b: float) -> float:
    return float(np.degrees(np.arctan2(float(b), float(a))))


def coerce_samples(samples: Iterable[Any]) -> list[dict[str, Any]]:
    """Normalize dicts, CSV rows, or ``(L, a, b, label)`` tuples."""
    normalized: list[dict[str, Any]] = []
    for item in samples:
        if isinstance(item, Mapping):
            if not {"L", "a", "b", "label"} <= set(item):
                raise ValueError("each sample needs L, a, b, and label")
            record = {
                "L": float(item["L"]),
                "a": float(item["a"]),
                "b": float(item["b"]),
                "label": _normalize_label(item["label"]),
            }
        elif isinstance(item, (tuple, list)) and len(item) == 4:
            record = {
                "L": float(item[0]),
                "a": float(item[1]),
                "b": float(item[2]),
                "label": _normalize_label(item[3]),
            }
        else:
            raise ValueError(
                "samples must be dicts or (L, a, b, label) sequences"
            )
        if not all(np.isfinite([record["L"], record["a"], record["b"]])):
            raise ValueError("sample color components must be finite")
        normalized.append(record)
    if not normalized:
        raise ValueError("no samples supplied")
    return normalized


def read_samples_csv(path: str | Path) -> list[dict[str, Any]]:
    """Read a CSV with case-insensitive ``L,a,b,label`` columns."""
    with open(path, "r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError("CSV has no header row")
        names = {name.strip().lower(): name for name in reader.fieldnames}
        missing = {"l", "a", "b", "label"} - set(names)
        if missing:
            raise ValueError(
                f"CSV needs columns {sorted(missing)}; found {reader.fieldnames}"
            )
        rows = [
            {
                "L": row[names["l"]],
                "a": row[names["a"]],
                "b": row[names["b"]],
                "label": row[names["label"]],
            }
            for row in reader
            if any((value or "").strip() for value in row.values())
        ]
    return coerce_samples(rows)


def _fixed_effects_slope(
    ls: np.ndarray, hues: np.ndarray, labels: list[str]
) -> tuple[float, int]:
    """Hue-per-L* slope estimated within label groups (removes class means)."""
    numerator = 0.0
    denominator = 0.0
    groups = 0
    for label in set(labels):
        idx = np.array([i for i, value in enumerate(labels) if value == label])
        if idx.size < 2:
            continue
        mean_hue = circular_mean_deg(hues[idx])
        local_hues = mean_hue + np.array(
            [_wrap180(value - mean_hue) for value in hues[idx]]
        )
        mean_l = float(np.mean(ls[idx]))
        dh = local_hues - np.mean(local_hues)
        dl = ls[idx] - mean_l
        numerator += float(np.sum(dh * dl))
        denominator += float(np.sum(dl * dl))
        groups += 1
    if groups < 1 or denominator <= 1e-9:
        return 0.0, groups
    # A physically implausible slope is almost always small-sample noise.
    return float(np.clip(numerator / denominator, -1.0, 1.0)), groups


@dataclass(frozen=True)
class WarmCoolCalibration:
    neutral_hue: float
    hue_span: float
    neutral_band: float
    depth_hue_slope: float = 0.0
    depth_reference_L: float = 60.0
    n_samples: int = 0
    class_means: Mapping[str, float] | None = None
    separation_deg: float = 0.0
    notes: tuple[str, ...] = ()

    def apply(self, config: AnalysisConfig | None = None) -> AnalysisConfig:
        base = config or AnalysisConfig()
        return replace(
            base,
            neutral_hue=float(self.neutral_hue),
            hue_span=float(self.hue_span),
            neutral_band=float(self.neutral_band),
            depth_hue_slope=float(self.depth_hue_slope),
            depth_reference_L=float(self.depth_reference_L),
            calibrated=True,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": 1,
            "neutral_hue": float(self.neutral_hue),
            "hue_span": float(self.hue_span),
            "neutral_band": float(self.neutral_band),
            "depth_hue_slope": float(self.depth_hue_slope),
            "depth_reference_L": float(self.depth_reference_L),
            "n_samples": int(self.n_samples),
            "class_means": dict(self.class_means or {}),
            "separation_deg": float(self.separation_deg),
            "notes": list(self.notes),
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "WarmCoolCalibration":
        return cls(
            neutral_hue=float(payload["neutral_hue"]),
            hue_span=float(payload["hue_span"]),
            neutral_band=float(payload["neutral_band"]),
            depth_hue_slope=float(payload.get("depth_hue_slope", 0.0)),
            depth_reference_L=float(payload.get("depth_reference_L", 60.0)),
            n_samples=int(payload.get("n_samples", 0)),
            class_means={
                str(key): float(value)
                for key, value in dict(payload.get("class_means", {})).items()
            },
            separation_deg=float(payload.get("separation_deg", 0.0)),
            notes=tuple(str(note) for note in payload.get("notes", [])),
        )

    def save(self, path: str | Path) -> None:
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(self.to_dict(), handle, indent=2)
            handle.write("\n")

    @classmethod
    def load(cls, path: str | Path) -> "WarmCoolCalibration":
        with open(path, "r", encoding="utf-8") as handle:
            return cls.from_dict(json.load(handle))


def fit_warm_cool(
    samples: Iterable[Any],
    *,
    depth_reference_L: float = 60.0,
    min_samples: int = 6,
) -> WarmCoolCalibration:
    """Fit neutral hue, span, neutral band, and depth slope from labelled data."""
    records = coerce_samples(samples)
    if len(records) < int(min_samples):
        raise ValueError(
            f"need at least {min_samples} labelled samples, got {len(records)}"
        )

    ls = np.array([record["L"] for record in records], dtype=np.float64)
    hues = np.array(
        [_hue(record["a"], record["b"]) for record in records], dtype=np.float64
    )
    labels = [record["label"] for record in records]

    slope, slope_groups = _fixed_effects_slope(ls, hues, labels)
    adjusted = hues - slope * (ls - float(depth_reference_L))

    class_means: dict[str, float] = {}
    for label in LABELS:
        values = adjusted[np.array([value == label for value in labels])]
        if values.size:
            class_means[label] = circular_mean_deg(values)

    notes: list[str] = []
    has_warm_cool = "warm" in class_means and "cool" in class_means
    if has_warm_cool:
        gap = abs(_wrap180(class_means["warm"] - class_means["cool"]))
        separation = float(gap)
        neutral_hue = float(
            class_means["warm"] + _wrap180(class_means["cool"] - class_means["warm"]) / 2.0
        )
        # Place the warm/cool class means at roughly +/-0.75 on the score scale.
        hue_span = float(np.clip(separation / 1.5, 3.0, 40.0))
    else:
        separation = 0.0
        neutral_hue = float(
            class_means.get("neutral", circular_mean_deg(adjusted))
        )
        hue_span = 12.0
        notes.append(
            "Warm and cool labels were both required to set the span; using the "
            "default 12 degrees."
        )

    neutral_values = adjusted[
        np.array([value == "neutral" for value in labels])
    ]
    if neutral_values.size >= 3:
        deviations = np.abs(
            np.array([_wrap180(value - neutral_hue) for value in neutral_values])
        )
        band = float(np.percentile(deviations, 80) / max(hue_span, 1e-9))
        neutral_band = float(np.clip(band, 0.10, 0.50))
    else:
        neutral_band = 0.25
        notes.append(
            "Fewer than three neutral samples; the neutral band stays at 0.25."
        )

    if not has_warm_cool:
        notes.append("Only one warm/cool class is present; calibrate both.")
    elif separation < 4.0:
        notes.append(
            f"Warm/cool separation is only {separation:.1f} deg; collect more "
            "samples or re-check labels."
        )
    if slope_groups < 2:
        notes.append(
            "Depth correction needs at least two labels with repeated L* values."
        )
    if len(records) < 20:
        notes.append(
            f"{len(records)} samples is small; treat fitted anchors as provisional."
        )

    return WarmCoolCalibration(
        neutral_hue=neutral_hue,
        hue_span=hue_span,
        neutral_band=neutral_band,
        depth_hue_slope=slope,
        depth_reference_L=float(depth_reference_L),
        n_samples=len(records),
        class_means=class_means,
        separation_deg=separation,
        notes=tuple(notes),
    )


def evaluate_warm_cool(
    samples: Iterable[Any], config: AnalysisConfig
) -> dict[str, Any]:
    """Accuracy of a config on labelled samples (the only honest accuracy claim).

    Reports plain accuracy, balanced accuracy (mean per-class recall), a
    confusion matrix, and mean absolute error of the continuous score against
    warm=+1, neutral=0, cool=-1.
    """
    records = coerce_samples(samples)
    confusion = {true: {pred: 0 for pred in LABELS} for true in LABELS}
    score_errors: list[float] = []
    correct = 0
    for record in records:
        position = warm_cool_position(
            _hue(record["a"], record["b"]),
            config,
            L=record["L"],
        )
        true = record["label"]
        pred = position["label"]
        confusion[true][pred] += 1
        correct += int(pred == true)
        score_errors.append(
            abs(float(position["score"]) - _LABEL_TARGET[true])
        )

    per_class: dict[str, dict[str, float] | None] = {}
    recalls: list[float] = []
    for label in LABELS:
        total = sum(confusion[label].values())
        if total:
            recall = confusion[label][label] / total
            recalls.append(recall)
            per_class[label] = {
                "n": total,
                "recall": float(recall),
            }
        else:
            per_class[label] = None

    return {
        "n": len(records),
        "accuracy": float(correct / len(records)),
        "balanced_accuracy": float(np.mean(recalls)) if recalls else 0.0,
        "mean_score_error": float(np.mean(score_errors)),
        "confusion": confusion,
        "per_class": per_class,
    }
