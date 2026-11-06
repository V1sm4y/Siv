"""Camera capture setup and repeatability testing.

This module implements build-order steps 1 and 7 of the brief:

* keep one fixed capture setup per store (locked exposure, gain, white balance);
* capture flash/no-flash pairs or a locked-settings burst;
* report repeatability and lighting stability instead of accuracy, because
  there is no labelled ground truth for undertone.

The same code drives a real camera through OpenCV and a synthetic camera used
by the test suite, so the whole capture path can be exercised without hardware.
"""

from __future__ import annotations

import sys
import time
from dataclasses import dataclass, replace
from typing import Any, Callable, Iterable, Protocol, Sequence, runtime_checkable

import numpy as np

from .color import (
    delta_e_ciede2000,
    lab_to_srgb,
    linear_to_srgb,
    srgb_to_linear,
)
from .demo import render_face
from .detect import AnalysisConfig, analyze_pair_srgb, analyze_srgb
from .features import skin_mask_srgb


# ---------------------------------------------------------------------------
# Exposure and flicker
# ---------------------------------------------------------------------------


def flicker_period(mains_hz: float = 50.0) -> float:
    """Seconds per lamp flicker cycle (mains frequency doubled)."""
    if mains_hz <= 0.0:
        raise ValueError("mains_hz must be positive")
    return 1.0 / (2.0 * mains_hz)


def flicker_safe_exposure(
    seconds: float, mains_hz: float = 50.0, *, mode: str = "nearest"
) -> float:
    """Round an exposure time to a whole number of flicker cycles.

    On 50 Hz mains the lamps flicker at 100 Hz, so one cycle is 10 ms and the
    allowed exposures are 10, 20, 30 ms, ... Exposing for whole cycles averages
    the flicker out and avoids brightness banding.
    """
    if seconds <= 0.0:
        raise ValueError("exposure must be positive")
    period = flicker_period(mains_hz)
    ratio = seconds / period
    if mode == "nearest":
        n = max(1, int(round(ratio)))
    elif mode == "down":
        n = max(1, int(np.floor(ratio)))
    elif mode == "up":
        n = max(1, int(np.ceil(ratio)))
    else:
        raise ValueError("mode must be 'nearest', 'down', or 'up'")
    return n * period


def is_flicker_safe(
    seconds: float, mains_hz: float = 50.0, tolerance: float = 1e-6
) -> bool:
    period = flicker_period(mains_hz)
    ratio = seconds / period
    return bool(abs(ratio - round(ratio)) <= tolerance * max(1.0, abs(ratio)))


# Backends whose CAP_PROP_EXPOSURE is expressed in log2 seconds. Writing the
# exposure time directly to these backends is a common source of black or
# blown-out captures.
LOG2_EXPOSURE_BACKENDS = frozenset({"V4L2", "DSHOW", "CAP_V4L2", "CAP_DSHOW"})


def log2_exposure(seconds: float) -> float:
    """Convert an exposure time in seconds to log2-seconds."""
    if seconds <= 0.0:
        raise ValueError("exposure must be positive")
    return float(np.log2(seconds))


def exposure_for_backend(
    seconds: float, backend_name: str | None
) -> tuple[float, bool]:
    """Return ``(value, is_log2)`` to write to ``CAP_PROP_EXPOSURE``.

    V4L2 and DirectShow expect log2 seconds; other backends are
    backend-specific, so raw seconds are written and the operator should
    verify or supply ``exposure_raw`` explicitly.
    """
    name = (backend_name or "").upper()
    if name in LOG2_EXPOSURE_BACKENDS:
        return log2_exposure(seconds), True
    return float(seconds), False


# ---------------------------------------------------------------------------
# Camera settings and sources
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CameraSettings:
    """Capture settings that must stay fixed for a store.

    ``exposure_seconds`` is the human-meaningful exposure time and is always
    rounded to a flicker-safe multiple. ``exposure_raw`` is the value actually
    written to the camera API; its unit is backend-specific (OpenCV's
    ``CAP_PROP_EXPOSURE`` is log2 seconds on V4L2 and driver-defined elsewhere),
    so set it when the backend needs a raw value.
    """

    width: int = 1280
    height: int = 720
    fps: float = 20.0
    exposure_seconds: float | None = None
    exposure_raw: float | None = None
    gain: float | None = 0.0
    white_balance: float | None = 4500.0
    fourcc: str = "MJPG"
    mains_hz: float = 50.0
    auto_exposure_manual_value: float = 0.25
    settle_frames: int = 10

    def resolved_exposure_seconds(self) -> float:
        requested = (
            self.exposure_seconds
            if self.exposure_seconds is not None
            else 1.0 / max(self.fps, 1e-6)
        )
        return flicker_safe_exposure(requested, self.mains_hz)

    def to_dict(self) -> dict[str, Any]:
        return {
            "width": int(self.width),
            "height": int(self.height),
            "fps": float(self.fps),
            "exposure_seconds": self.resolved_exposure_seconds(),
            "exposure_raw": self.exposure_raw,
            "gain": self.gain,
            "white_balance": self.white_balance,
            "fourcc": self.fourcc,
            "mains_hz": float(self.mains_hz),
            "flicker_safe": is_flicker_safe(
                self.resolved_exposure_seconds(), self.mains_hz
            ),
        }


@runtime_checkable
class FrameSource(Protocol):
    def read(self) -> np.ndarray:
        ...

    def close(self) -> None:
        ...


class SyntheticCamera:
    """Deterministic camera fixture that renders the synthetic face.

    It is a real ``FrameSource``: the capture session, flash/no-flash pair,
    quality gate, and repeatability code all run unchanged. Nothing is written
    to disk.
    """

    def __init__(
        self,
        skin_lab: Sequence[float] = (60.0, 12.0, 22.0),
        cast: Sequence[float] = (1.0, 0.99, 0.95),
        width: int = 420,
        height: int = 520,
        seed: int = 0,
        ambient_scale: float = 1.0,
        led_strength: float = 0.0,
        drift_lab: Sequence[float] = (0.0, 0.0, 0.0),
    ) -> None:
        self.skin_lab = tuple(float(v) for v in skin_lab)
        self.cast = tuple(float(v) for v in cast)
        self.width = int(width)
        self.height = int(height)
        self.seed = int(seed)
        self.ambient_scale = float(ambient_scale)
        self.led_strength = float(led_strength)
        self.drift_lab = tuple(float(v) for v in drift_lab)
        self.led_on = False
        self._index = 0
        self._closed = False

    def set_led(self, on: bool) -> None:
        self.led_on = bool(on)

    @property
    def patch_rect(self) -> tuple[int, int, int, int]:
        size = int(min(self.width, self.height) * 0.11)
        margin = max(8, int(min(self.width, self.height) * 0.03))
        return margin, margin, size, size

    def read(self) -> np.ndarray:
        if self._closed:
            raise RuntimeError("camera is closed")
        drift = np.asarray(self.drift_lab) * self._index
        lab = np.asarray(self.skin_lab) + drift
        frame_seed = self.seed + self._index
        self._index += 1

        image = render_face(
            width=self.width,
            height=self.height,
            skin_lab=tuple(float(v) for v in lab),
            cast=(1.0, 1.0, 1.0),
            patch=True,
            shading=True,
            seed=frame_seed,
        )
        # Apply the store-light cast in linear light (the physical place it
        # belongs) so the reference-patch white balance can undo it.
        linear = (
            srgb_to_linear(image)
            * self.ambient_scale
            * np.asarray(self.cast, dtype=np.float64)
        )
        if self.led_on and self.led_strength:
            mask = skin_mask_srgb(image, restrict_to_largest=False)
            base = srgb_to_linear(
                lab_to_srgb(np.asarray(self.skin_lab, dtype=np.float64))
            )
            linear[mask] = linear[mask] + self.led_strength * base
        return linear_to_srgb(linear)

    def close(self) -> None:
        self._closed = True

    def report(self) -> dict[str, Any]:
        return {
            "backend": "synthetic",
            "settings": {
                "width": self.width,
                "height": self.height,
                "ambient_scale": self.ambient_scale,
                "led_strength": self.led_strength,
            },
            "locked": {
                "width": True,
                "height": True,
                "exposure": True,
                "gain": True,
                "white_balance": True,
            },
            "unverified": [],
            "unsupported": [],
        }

    def __enter__(self) -> "SyntheticCamera":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


class OpenCVCamera:
    """OpenCV-backed webcam with explicit locking and a read-back report.

    OpenCV cannot guarantee every backend honours every control. Rather than
    pretend, ``report()`` lists what was requested, what was read back, what is
    verified locked, and what could not be verified. A capture should be
    rejected by the operator when the important controls are unsupported.
    """

    _VERIFY = {
        "width": 1.0,
        "height": 1.0,
        "fps": 1.0,
        "gain": 0.05,
        "white_balance": 150.0,
    }

    def __init__(
        self,
        index: int = 0,
        settings: CameraSettings | None = None,
        backend: int | None = None,
    ) -> None:
        try:
            import cv2
        except ImportError as exc:  # pragma: no cover - depends on environment
            raise ImportError(
                "OpenCV is required for camera capture. Install with: "
                "pip install opencv-python"
            ) from exc

        self._cv2 = cv2
        self.settings = settings or CameraSettings()
        self._readback: dict[str, float] = {}
        self._locked: dict[str, bool | None] = {}
        self._unsupported: list[str] = []
        self._cap, self.backend_name = self._open(int(index), backend)
        self._set_buffer_size(1)
        self._configure()

    def _candidate_backends(self, backend: int | None) -> list[int | None]:
        """Backends to try, in order, when the caller did not pin one."""
        if backend is not None:
            return [backend]
        cv2 = self._cv2
        if sys.platform.startswith("win"):
            options = []
            for name in ("CAP_DSHOW", "CAP_MSMF"):
                value = getattr(cv2, name, None)
                if value is not None:
                    options.append(int(value))
            return options or [None]
        if sys.platform.startswith("linux"):
            value = getattr(cv2, "CAP_V4L2", None)
            return [int(value)] if value is not None else [None]
        return [None]

    def _open(
        self, index: int, backend: int | None
    ) -> tuple[Any, str]:
        """Open the first backend that delivers a frame.

        Some Windows drivers expose the device but never deliver frames on one
        backend. Trying DirectShow then Media Foundation avoids a camera that
        looks open but only returns black frames.
        """
        cv2 = self._cv2
        for candidate in self._candidate_backends(backend):
            cap = (
                cv2.VideoCapture(index)
                if candidate is None
                else cv2.VideoCapture(index, int(candidate))
            )
            if not cap.isOpened():
                cap.release()
                continue
            delivered = False
            for _ in range(5):
                ok, frame = cap.read()
                if ok and frame is not None:
                    delivered = True
                    break
                time.sleep(0.03)
            if not delivered:
                cap.release()
                continue
            try:
                name = str(cap.getBackendName())
            except Exception:  # pragma: no cover - backend specific
                name = "" if candidate is None else str(candidate)
            return cap, name
        raise RuntimeError(
            f"could not open camera index {index}"
            + ("" if backend is not None else " with any available backend")
        )

    def _set_buffer_size(self, size: int) -> None:
        prop = getattr(self._cv2, "CAP_PROP_BUFFERSIZE", None)
        if prop is None:
            return
        try:
            self._cap.set(int(prop), float(size))
        except Exception:  # pragma: no cover - backend specific
            pass

    def _exposure_value(self) -> tuple[float, bool]:
        """``(value, is_log2)`` written to the camera's exposure control."""
        s = self.settings
        if s.exposure_raw is not None:
            return float(s.exposure_raw), False
        return exposure_for_backend(s.resolved_exposure_seconds(), self.backend_name)

    def _property(self, name: str) -> int | None:
        value = getattr(self._cv2, name, None)
        return None if value is None else int(value)

    def _set(self, prop_name: str, value: float, label: str) -> None:
        prop = self._property(prop_name)
        if prop is None:
            self._unsupported.append(label)
            return
        try:
            ok = bool(self._cap.set(prop, float(value)))
        except Exception:  # pragma: no cover - backend specific
            ok = False
        if not ok:
            self._unsupported.append(label)
        try:
            self._readback[label] = float(self._cap.get(prop))
        except Exception:  # pragma: no cover - backend specific
            pass

    def _configure(self) -> None:
        s = self.settings
        cv2 = self._cv2
        if self._property("CAP_PROP_FOURCC") is not None and len(s.fourcc) == 4:
            try:
                self._set(
                    "CAP_PROP_FOURCC",
                    float(cv2.VideoWriter_fourcc(*s.fourcc)),
                    "fourcc",
                )
            except Exception:  # pragma: no cover - backend specific
                self._unsupported.append("fourcc")
        self._set("CAP_PROP_FRAME_WIDTH", s.width, "width")
        self._set("CAP_PROP_FRAME_HEIGHT", s.height, "height")
        self._set("CAP_PROP_FPS", s.fps, "fps")
        self._set("CAP_PROP_AUTOFOCUS", 0.0, "autofocus")

        self._set("CAP_PROP_AUTO_EXPOSURE", s.auto_exposure_manual_value, "auto_exposure")
        exposure_value, _ = self._exposure_value()
        self._set("CAP_PROP_EXPOSURE", exposure_value, "exposure")
        if s.gain is not None:
            self._set("CAP_PROP_GAIN", s.gain, "gain")
        if s.white_balance is not None:
            self._set("CAP_PROP_AUTO_WB", 0.0, "auto_wb")
            self._set("CAP_PROP_WB_TEMPERATURE", s.white_balance, "white_balance")

        for label, tolerance in self._VERIFY.items():
            target = (
                s.fps
                if label == "fps"
                else s.white_balance
                if label == "white_balance"
                else s.gain
                if label == "gain"
                else getattr(s, label)
            )
            if target is None or label not in self._readback:
                self._locked[label] = None
                continue
            applied = self._readback[label]
            self._locked[label] = bool(abs(applied - float(target)) <= tolerance)

        # Exposure is only verifiable when we know the backend units: log2
        # seconds on V4L2/DirectShow, or an explicit raw value from the
        # operator. Anything else is reported honestly as unverified.
        self._locked["exposure"] = None
        if "exposure" in self._readback:
            applied = self._readback["exposure"]
            if s.exposure_raw is not None:
                target = float(s.exposure_raw)
                self._locked["exposure"] = bool(
                    abs(applied - target) <= max(1e-6, abs(target) * 0.05)
                )
            else:
                target, is_log2 = self._exposure_value()
                if is_log2:
                    # Cameras quantise exposure to whole log2 steps, so allow
                    # roughly one stop of rounding either way.
                    self._locked["exposure"] = bool(abs(applied - target) <= 0.5)

        for label in ("auto_exposure", "auto_wb", "autofocus"):
            if label in self._readback:
                self._locked[label] = None

    def read(self) -> np.ndarray:
        ok, frame = self._cap.read()
        if not ok or frame is None:
            raise RuntimeError("camera read failed; check the connection and settings")
        bgr = np.asarray(frame, dtype=np.float64) / 255.0
        srgb = bgr[..., ::-1]
        return np.ascontiguousarray(np.clip(srgb, 0.0, 1.0))

    def close(self) -> None:
        self._cap.release()

    def report(self) -> dict[str, Any]:
        exposure_value, is_log2 = self._exposure_value()
        if self.settings.exposure_raw is not None:
            exposure_units = "operator_raw"
        elif is_log2:
            exposure_units = "log2_seconds"
        else:
            exposure_units = "backend_seconds"
        return {
            "backend": "opencv",
            "backend_name": self.backend_name,
            "exposure_control": {
                "value": exposure_value,
                "units": exposure_units,
            },
            "settings": self.settings.to_dict(),
            "readback": dict(self._readback),
            "locked": dict(self._locked),
            "unverified": [k for k, v in self._locked.items() if v is None],
            "unsupported": list(dict.fromkeys(self._unsupported)),
        }

    def __enter__(self) -> "OpenCVCamera":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


# ---------------------------------------------------------------------------
# Capture plans
# ---------------------------------------------------------------------------


@dataclass
class CapturePlan:
    tier: str = "minimum"
    frames: int = 8
    warmup: int = 5
    settle: int = 2
    frames_per_state: int = 1
    flash_pair: bool = False
    reference_patch: Any = None

    def __post_init__(self) -> None:
        if self.tier not in {"ideal", "minimum"}:
            raise ValueError("tier must be 'ideal' or 'minimum'")
        if self.frames < 1:
            raise ValueError("frames must be at least 1")
        if self.warmup < 0 or self.settle < 0:
            raise ValueError("warmup and settle must be non-negative")
        if self.frames_per_state < 1:
            raise ValueError("frames_per_state must be at least 1")


@dataclass(frozen=True)
class RepeatabilityThresholds:
    max_hue_std: float = 2.0
    max_hue_range: float = 5.0
    max_L_std: float = 2.0
    max_delta_e: float = 2.5


def thresholds_for_tier(tier: str) -> RepeatabilityThresholds:
    """Repeatability limits. Minimum tier is wider because light is uncontrolled.

    These are engineering limits, not validated accuracy figures.
    """
    if tier == "ideal":
        return RepeatabilityThresholds()
    if tier == "minimum":
        return RepeatabilityThresholds(
            max_hue_std=3.0,
            max_hue_range=7.0,
            max_L_std=3.0,
            max_delta_e=4.0,
        )
    raise ValueError("tier must be 'ideal' or 'minimum'")


def lighting_thresholds_for_tier(tier: str) -> RepeatabilityThresholds:
    """Allowed shift across lights. Larger than the repeatability limits.

    Changing the light is a bigger perturbation than repeating a capture in the
    same light, so these bands are deliberately wider.
    """
    if tier == "ideal":
        return RepeatabilityThresholds(
            max_hue_std=3.0,
            max_hue_range=5.0,
            max_L_std=3.0,
            max_delta_e=5.0,
        )
    if tier == "minimum":
        return RepeatabilityThresholds(
            max_hue_std=4.0,
            max_hue_range=7.0,
            max_L_std=4.0,
            max_delta_e=7.0,
        )
    raise ValueError("tier must be 'ideal' or 'minimum'")


def default_patch(image: np.ndarray) -> tuple[int, int, int, int]:
    """Top-left gray-patch rectangle used by the synthetic fixture."""
    height, width = np.asarray(image).shape[:2]
    size = int(min(width, height) * 0.11)
    margin = max(8, int(min(width, height) * 0.03))
    return margin, margin, size, size


# ---------------------------------------------------------------------------
# Capture
# ---------------------------------------------------------------------------


def _read(source: FrameSource) -> np.ndarray:
    frame = np.asarray(source.read(), dtype=np.float64)
    if frame.ndim != 3 or frame.shape[-1] != 3:
        raise ValueError("camera frames must have shape (H, W, 3)")
    return np.clip(frame, 0.0, 1.0)


def capture_frames(
    source: FrameSource, plan: CapturePlan
) -> list[np.ndarray]:
    """Discard warm-up frames, then return a locked-settings burst."""
    for _ in range(plan.warmup):
        _read(source)
    return [_read(source) for _ in range(plan.frames)]


def capture_pairs(
    source: FrameSource,
    plan: CapturePlan,
    set_led: Callable[[bool], None] | None = None,
) -> dict[str, Any]:
    """Capture flash/no-flash pairs and return median in each state.

    ``set_led`` is typically a hardware hook. When omitted, a ``set_led``
    method on the source is used (the synthetic camera provides one).
    """
    if set_led is None:
        set_led = getattr(source, "set_led", None)
    if set_led is None:
        raise ValueError("flash/no-flash capture needs an LED controller")

    for _ in range(plan.warmup):
        _read(source)

    on_stack: list[np.ndarray] = []
    off_stack: list[np.ndarray] = []
    for _ in range(plan.frames):
        set_led(False)
        for _ in range(plan.settle):
            _read(source)
        off_frames = [_read(source) for _ in range(plan.frames_per_state)]
        off_stack.append(np.median(np.stack(off_frames), axis=0))

        set_led(True)
        for _ in range(plan.settle):
            _read(source)
        on_frames = [_read(source) for _ in range(plan.frames_per_state)]
        on_stack.append(np.median(np.stack(on_frames), axis=0))

    set_led(False)
    return {
        "on": np.median(np.stack(on_stack), axis=0),
        "off": np.median(np.stack(off_stack), axis=0),
        "on_frames": on_stack,
        "off_frames": off_stack,
        "n_pairs": len(on_stack),
    }


# ---------------------------------------------------------------------------
# Repeatability and lighting stability
# ---------------------------------------------------------------------------


def _measurement_lab(item: Any) -> np.ndarray | None:
    """Pull a LAB vector out of an analysis result, summary, or LAB array.

    Results whose quality gate failed are ignored: a rejected capture is not a
    valid measurement, even if the numeric fields are present.
    """
    if item is None:
        return None
    if isinstance(item, dict) and item.get("ok") is False:
        return None
    if isinstance(item, dict) and "result" in item:
        return _measurement_lab(item["result"])
    if isinstance(item, dict):
        measurement = item.get("measurement")
        if isinstance(measurement, dict):
            return np.array(
                [measurement["L"], measurement["a"], measurement["b"]],
                dtype=np.float64,
            )
        if all(key in item for key in ("L", "a", "b")):
            return np.array([item["L"], item["a"], item["b"]], dtype=np.float64)
        return None
    arr = np.asarray(item, dtype=np.float64)
    if arr.shape == (3,):
        return arr
    return None


def _circular_mean_deg(values: np.ndarray) -> float:
    angles = np.radians(np.asarray(values, dtype=np.float64))
    return float(np.degrees(np.arctan2(np.sin(angles).mean(), np.cos(angles).mean())))


def _circular_std_deg(values: np.ndarray) -> float:
    angles = np.radians(np.asarray(values, dtype=np.float64))
    resultant = np.hypot(np.sin(angles).mean(), np.cos(angles).mean())
    resultant = float(np.clip(resultant, 1e-12, 1.0))
    return float(np.degrees(np.sqrt(max(-2.0 * np.log(resultant), 0.0))))


def _hue_of(lab: np.ndarray) -> float:
    return float(np.degrees(np.arctan2(lab[2], lab[1])))


def _ita_of(lab: np.ndarray) -> float:
    b = lab[2]
    if abs(b) < 1e-9:
        return float("nan")
    return float(np.degrees(np.arctan((lab[0] - 50.0) / b)))


def repeatability(
    measurements: Iterable[Any],
    thresholds: RepeatabilityThresholds | None = None,
) -> dict[str, Any]:
    """Spread of hue, L*, ITA, and delta E for one person's repeated captures.

    ``measurements`` may be analysis results or LAB vectors. Frames whose gate
    failed (no measurement) are counted but excluded from the spread.
    """
    items = list(measurements)
    labs = [lab for lab in (_measurement_lab(item) for item in items) if lab is not None]
    thresholds = thresholds or RepeatabilityThresholds()
    n_frames = len(items)
    n_valid = len(labs)
    if n_valid < 2:
        return {
            "n_frames": n_frames,
            "n_valid": n_valid,
            "n_gate_failures": n_frames - n_valid,
            "passed": False,
            "failures": ["insufficient_measurements"],
            "thresholds": {
                "max_hue_std": thresholds.max_hue_std,
                "max_hue_range": thresholds.max_hue_range,
                "max_L_std": thresholds.max_L_std,
                "max_delta_e": thresholds.max_delta_e,
            },
        }

    array = np.stack(labs)
    hues = np.array([_hue_of(lab) for lab in labs])
    ita_values = np.array([_ita_of(lab) for lab in labs])
    mean_lab = array.mean(axis=0)
    delta_e = np.array([float(delta_e_ciede2000(lab, mean_lab)) for lab in labs])

    hue_mean = _circular_mean_deg(hues)
    hue_std = _circular_std_deg(hues)
    hue_range = float(
        np.degrees(
            np.ptp(np.unwrap(np.radians(hues)))
        )
    )
    L_std = float(np.std(array[:, 0]))
    L_range = float(np.ptp(array[:, 0]))

    failures: list[str] = []
    if hue_std > thresholds.max_hue_std:
        failures.append("hue_std")
    if hue_range > thresholds.max_hue_range:
        failures.append("hue_range")
    if L_std > thresholds.max_L_std:
        failures.append("L_std")
    if float(delta_e.max()) > thresholds.max_delta_e:
        failures.append("delta_e")

    return {
        "n_frames": n_frames,
        "n_valid": n_valid,
        "n_gate_failures": n_frames - n_valid,
        "hue_mean": hue_mean,
        "hue_std": hue_std,
        "hue_range": hue_range,
        "L_mean": float(array[:, 0].mean()),
        "L_std": L_std,
        "L_range": L_range,
        "ita_mean": float(np.nanmean(ita_values)) if np.isfinite(ita_values).any() else None,
        "ita_std": float(np.nanstd(ita_values)) if np.isfinite(ita_values).any() else None,
        "delta_e_mean": float(delta_e.mean()),
        "delta_e_max": float(delta_e.max()),
        "mean_lab": [float(v) for v in mean_lab],
        "passed": not failures,
        "failures": failures,
        "thresholds": {
            "max_hue_std": thresholds.max_hue_std,
            "max_hue_range": thresholds.max_hue_range,
            "max_L_std": thresholds.max_L_std,
            "max_delta_e": thresholds.max_delta_e,
        },
    }


def lighting_stability(
    conditions: dict[str, Any],
    thresholds: RepeatabilityThresholds | None = None,
) -> dict[str, Any]:
    """Shift for the same person under different lights.

    ``conditions`` maps a label ("daylight", "spotlight") to an analysis result,
    a ``run_capture_test`` result, or a LAB vector. A smaller shift means the
    calibration and gate handled the light change better.
    """
    thresholds = thresholds or RepeatabilityThresholds(
        max_hue_std=3.0, max_hue_range=5.0, max_L_std=3.0, max_delta_e=5.0
    )
    per_condition: dict[str, list[float]] = {}
    labs: list[np.ndarray] = []
    for label, item in conditions.items():
        lab = _measurement_lab(item)
        if lab is None:
            per_condition[label] = [float("nan")] * 3
            continue
        labs.append(lab)
        per_condition[label] = [
            float(lab[0]),
            _hue_of(lab),
            _ita_of(lab),
        ]
    if len(labs) < 2:
        return {
            "n_conditions": len(labs),
            "passed": False,
            "failures": ["insufficient_conditions"],
            "per_condition": per_condition,
        }

    array = np.stack(labs)
    hues = np.array([_hue_of(lab) for lab in labs])
    mean_lab = array.mean(axis=0)
    shifts = np.array([float(delta_e_ciede2000(lab, mean_lab)) for lab in labs])
    hue_shift = float(
        np.degrees(np.ptp(np.unwrap(np.radians(hues))))
    )
    L_shift = float(np.ptp(array[:, 0]))

    failures: list[str] = []
    if hue_shift > thresholds.max_hue_range:
        failures.append("hue_shift")
    if L_shift > thresholds.max_L_std * 2.0:
        failures.append("L_shift")
    if float(shifts.max()) > thresholds.max_delta_e:
        failures.append("delta_e_shift")

    return {
        "n_conditions": len(labs),
        "per_condition": per_condition,
        "hue_shift": hue_shift,
        "L_shift": L_shift,
        "delta_e_max": float(shifts.max()),
        "passed": not failures,
        "failures": failures,
    }


# ---------------------------------------------------------------------------
# End-to-end capture test
# ---------------------------------------------------------------------------


def run_capture_test(
    source: FrameSource,
    plan: CapturePlan | None = None,
    config: AnalysisConfig | None = None,
    set_led: Callable[[bool], None] | None = None,
) -> dict[str, Any]:
    """Capture a burst or flash/no-flash pairs, measure, and check repeatability.

    Nothing is persisted. The returned ``result`` is the normal analysis output
    for the median frame; ``repeatability`` is the spread across the burst.
    """
    plan = plan or CapturePlan()
    config = config or AnalysisConfig(tier=plan.tier)
    if config.tier != plan.tier:
        config = replace(config, tier=plan.tier)

    if plan.flash_pair:
        pair = capture_pairs(source, plan, set_led=set_led)
        result = analyze_pair_srgb(
            pair["on"], pair["off"], reference_patch=plan.reference_patch, config=config
        )
        per_frame = [
            analyze_pair_srgb(on, off, reference_patch=plan.reference_patch, config=config)
            for on, off in zip(pair["on_frames"], pair["off_frames"])
        ]
        mode = "flash_pair"
    else:
        frames = capture_frames(source, plan)
        stack = np.stack(frames)
        result = analyze_srgb(
            np.median(stack, axis=0),
            reference_patch=plan.reference_patch,
            config=config,
        )
        per_frame = [
            analyze_srgb(frame, reference_patch=plan.reference_patch, config=config)
            for frame in frames
        ]
        mode = "locked_burst"

    summary = repeatability(per_frame, thresholds_for_tier(plan.tier))
    report = source.report() if hasattr(source, "report") else {}
    return {
        "tier": plan.tier,
        "mode": mode,
        "frames": plan.frames,
        "result": result,
        "repeatability": summary,
        "capture": report,
        "ok": bool(result.get("ok")) and bool(summary.get("passed")),
    }
