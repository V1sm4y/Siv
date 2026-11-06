"""Live camera preview with the undertone measurement drawn on the frame.

This is the demo front end for the fixed-capture setup. It shows the skin mask
bounding box, the reference patch, the measured depth and warm-to-cool
position, and the quality-gate status in real time. No frames are saved.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from .calibration import PatchTracker
from .detect import AnalysisConfig, analyze_srgb, failure_hints


def _fit_scale(
    lines: list[str], max_width: int, start: float = 0.58, minimum: float = 0.38
) -> float:
    import cv2

    scale = start
    while scale > minimum:
        widths = [
            cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, scale, 1)[0][0]
            for line in lines
        ]
        if max(widths, default=0) + 24 <= max_width:
            return scale
        scale -= 0.04
    return minimum


def _draw_panel(
    bgr: np.ndarray,
    lines: list[str],
    anchor: str,
    max_width: int,
    color: tuple[int, int, int] = (255, 255, 255),
) -> None:
    """Draw a translucent text panel so lines never overlap the video or each other."""
    import cv2

    if not lines:
        return
    scale = _fit_scale(lines, max_width)
    sizes = [
        cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, scale, 1)[0] for line in lines
    ]
    line_h = max(height for _, height in sizes)
    gap = max(4, int(round(7 * scale / 0.58)))
    pad = max(6, int(round(10 * scale / 0.58)))
    panel_w = min(max_width, max((width for width, _ in sizes), default=0) + 2 * pad)
    panel_h = len(lines) * line_h + (len(lines) - 1) * gap + 2 * pad

    height, width = bgr.shape[:2]
    x = 12
    y = 12 if anchor == "top" else max(12, height - panel_h - 12)
    panel_w = min(panel_w, width - 2 * x)
    x = max(0, min(x, width - panel_w))
    y = max(0, min(y, height - panel_h))

    shade = bgr.copy()
    cv2.rectangle(shade, (x, y), (x + panel_w, y + panel_h), (0, 0, 0), -1)
    cv2.addWeighted(shade, 0.62, bgr, 0.38, 0.0, bgr)

    text_y = y + pad + line_h
    for line in lines:
        cv2.putText(
            bgr,
            line,
            (x + pad, text_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            scale,
            color,
            1,
            cv2.LINE_AA,
        )
        text_y += line_h + gap


def draw_overlay(
    rgb: np.ndarray,
    result: dict[str, Any],
    patch: tuple[int, int, int, int] | None = None,
    mirror: bool = False,
) -> np.ndarray:
    """Draw the measurement on a copy of an RGB frame and return BGR for display."""
    import cv2

    frame = np.asarray(rgb, dtype=np.float64)
    if mirror:
        frame = frame[:, ::-1]
    bgr = (np.clip(frame[..., ::-1], 0.0, 1.0) * 255.0).astype(np.uint8)
    height, width = bgr.shape[:2]

    quality = result.get("quality", {})
    passed = bool(result.get("ok"))
    color = (0, 200, 0) if passed else (0, 0, 255)

    bbox = quality.get("face_bbox")
    if bbox is not None and len(bbox) == 4:
        x0, y0, x1, y1 = (int(v) for v in bbox)
        if mirror:
            x0, x1 = width - x1, width - x0
        cv2.rectangle(bgr, (x0, y0), (x1, y1), color, 2)

    if patch is not None:
        x, y, w, h = (int(v) for v in patch)
        if mirror:
            x = width - x - w
        cv2.rectangle(bgr, (x, y), (x + w, y + h), (255, 255, 0), 1)

    measurement = result.get("measurement")
    failures = quality.get("failures", [])
    if measurement is None:
        lines = ["No usable skin pixels - swatch mode"]
        if failures:
            lines.append("fail: " + ", ".join(str(f) for f in failures))
        lines.extend(failure_hints(failures)[:2])
    elif not passed:
        # Do not show numbers that the quality gate rejected: they look like a
        # result even when the capture is unusable.
        lines = ["Measurement withheld - quality gate failed"]
        if failures:
            lines.append("fail: " + ", ".join(str(f) for f in failures))
        lines.extend(failure_hints(failures)[:2])
    else:
        depth = result["depth"]
        warm_cool = result["warm_cool"]
        confidence = result["confidence"]
        undertone_exact = f"{warm_cool['label'].upper()} UNDERTONE"
        if warm_cool.get("is_olive"):
            undertone_exact += " (Olive Subtype)"

        lines = [
            f"UNDERTONE: {undertone_exact}",
            f"L* {measurement['L']:.1f}   ITA {depth['ita']:.1f}   depth {depth['label']}",
            f"hue {warm_cool['hue']:.1f}   warm-cool {warm_cool['score']:+.2f} {warm_cool['label']}",
            f"confidence {confidence['score']:.2f} ({confidence['label']})   "
            f"gate {'PASS' if passed else 'FAIL'}",
        ]
        if "hue_std" in warm_cool:
            stable = warm_cool.get("stable")
            flag = "stable" if stable is True else "UNSTABLE" if stable is False else "n/a"
            lines.insert(
                3,
                f"hue std {warm_cool['hue_std']:.2f} deg   {flag}"
                + ("   calibrated" if warm_cool.get("calibrated") else ""),
            )

    # Reserve one line at the top for status, then a separate bottom panel for
    # the measurements. Both are drawn on translucent backgrounds so they never
    # blend into the video or overlap each other.
    _draw_panel(bgr, [f"{'PASS' if passed else 'FAIL'}   q=quit"], "top", width - 24, color)
    _draw_panel(bgr, lines, "bottom", width - 24)

    # Draw a dedicated color square swatch in the top-right corner
    if passed and measurement is not None:
        wc = result.get("warm_cool", {})
        rgb = wc.get("color_rgb", [210, 160, 120])
        bgr_color = (int(rgb[2]), int(rgb[1]), int(rgb[0]))
        box_size = 46
        bx = width - box_size - 18
        by = 54
        # Drop shadow / border
        cv2.rectangle(bgr, (bx - 2, by - 2), (bx + box_size + 2, by + box_size + 2), (0, 0, 0), -1)
        cv2.rectangle(bgr, (bx - 1, by - 1), (bx + box_size + 1, by + box_size + 1), (255, 255, 255), 2)
        # Swatch fill
        cv2.rectangle(bgr, (bx, by), (bx + box_size, by + box_size), bgr_color, -1)
        # Text label below square
        cv2.putText(
            bgr,
            wc["label"].upper(),
            (bx - 2, by + box_size + 15),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )

    return bgr


def run_live_demo(
    source: Any,
    config: AnalysisConfig | None = None,
    patch: tuple[int, int, int, int] | None = None,
    every: int = 3,
    mirror: bool = False,
    max_frames: int = 0,
    window: str = "Undertone live demo",
    auto_patch: bool = False,
) -> int:
    """Open a preview window and measure every ``every`` frames.

    Press ``q`` or Esc to quit. ``max_frames=0`` runs until the user quits.
    With ``auto_patch``, the reference patch is confirmed across consecutive
    frames, reused, and periodically re-checked. If none is found the capture
    runs without white balance.
    """
    import cv2

    config = config or AnalysisConfig(tier="minimum")
    every = max(1, int(every))
    cv2.namedWindow(window, cv2.WINDOW_NORMAL)
    result: dict[str, Any] = {
        "ok": False,
        "measurement": None,
        "quality": {"face_bbox": None, "failures": ["warming_up"]},
    }
    frame_index = 0
    auto_tracker = (
        PatchTracker(confirmations=2, recheck_interval=60)
        if auto_patch and patch is None
        else None
    )
    last_auto_patch = patch
    auto_search_frames = 0
    auto_search_reported = False
    try:
        while True:
            rgb = source.read()
            if auto_tracker is not None:
                detection = auto_tracker.update(rgb)
                patch = None if detection is None else detection.rect
                if patch != last_auto_patch:
                    if detection is None:
                        print(
                            "Auto patch: lost; running without white balance.",
                            flush=True,
                        )
                    else:
                        x, y, w, h = detection.rect
                        print(
                            f"Auto patch: x={x} y={y} w={w} h={h} "
                            f"contrast={detection.contrast:.1f}",
                            flush=True,
                        )
                    last_auto_patch = patch
                if detection is None:
                    auto_search_frames += 1
                    if not auto_search_reported and auto_search_frames >= 30:
                        print(
                            "Auto patch: none found yet; running without white "
                            "balance.",
                            flush=True,
                        )
                        auto_search_reported = True
                else:
                    auto_search_frames = 0
            if frame_index % every == 0:
                result = analyze_srgb(rgb, reference_patch=patch, config=config)
                measurement = result.get("measurement")
                if measurement is None:
                    print("frame", frame_index, "no skin pixels")
                else:
                    depth = result["depth"]
                    warm_cool = result["warm_cool"]
                    print(
                        f"frame {frame_index:4d}  L*={measurement['L']:.1f}  "
                        f"ITA={depth['ita']:.1f}  hue={warm_cool['hue']:.1f}  "
                        f"{warm_cool['label']}  gate={'PASS' if result['ok'] else 'FAIL'}"
                    )
            cv2.imshow(window, draw_overlay(rgb, result, patch=patch, mirror=mirror))
            key = cv2.waitKey(1) & 0xFF
            frame_index += 1
            if key in (27, ord("q")):
                break
            if max_frames and frame_index >= max_frames:
                break
    finally:
        source.close()
        cv2.destroyAllWindows()
    return 0
