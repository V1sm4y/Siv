"""Command-line entry points.

    python -m undertone demo
    python -m undertone analyze face.png --patch 20 20 60 60
    python -m undertone pair on.png off.png --patch 20 20 60 60
    python -m undertone camera --synthetic
    python -m undertone camera --index 0 --tier ideal --pairs --patch 20 20 60 60

No images are written or sent anywhere by these commands.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .calibration import find_gray_patch, find_stable_patch
from .camera import (
    CameraSettings,
    CapturePlan,
    OpenCVCamera,
    SyntheticCamera,
    lighting_stability,
    lighting_thresholds_for_tier,
    run_capture_test,
)
from .demo import render_face
from .detect import AnalysisConfig, analyze_pair_srgb, analyze_srgb, failure_hints
from .warmcool import (
    WarmCoolCalibration,
    evaluate_warm_cool,
    fit_warm_cool,
    read_samples_csv,
)


def _load_image(path: str) -> Any:
    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise SystemExit(
            "Pillow is required to read image files. Install with: pip install pillow"
        ) from exc
    with Image.open(path) as image:
        return image.convert("RGB")


def _parse_patch(values: list[int] | None) -> tuple[int, int, int, int] | None:
    if values is None:
        return None
    if len(values) != 4:
        raise SystemExit("--patch needs four integers: x y width height")
    return tuple(int(v) for v in values)  # type: ignore[return-value]


def _config_from_args(args: argparse.Namespace) -> AnalysisConfig:
    config = AnalysisConfig(
        tier=getattr(args, "tier", "minimum"),
        reference_hue_mean=getattr(args, "reference_mean", None),
        reference_hue_std=getattr(args, "reference_std", None),
    )
    calibration_path = getattr(args, "calibration", None)
    if calibration_path:
        config = WarmCoolCalibration.load(calibration_path).apply(config)
    return config


def _resolve_patch(
    image: Any, values: list[int] | None, auto: bool
) -> tuple[int, int, int, int] | None:
    explicit = _parse_patch(values)
    if explicit is not None or not auto:
        return explicit
    detection = find_gray_patch(image)
    if detection is None:
        print(
            "Auto patch: no neutral reference patch found; continuing without "
            "white balance.",
            file=sys.stderr,
        )
        return None
    x, y, w, h = detection.rect
    print(
        f"Auto patch: x={x} y={y} w={w} h={h} "
        f"(rect={detection.rectangularity:.2f}, contrast={detection.contrast:.1f}, "
        f"chroma={detection.chroma:.1f})",
        file=sys.stderr,
    )
    return detection.rect


def _print_result(result: dict[str, Any], source: str) -> None:
    print(f"Undertone measurement ({source})")
    q = result["quality"]
    passed = bool(q.get("passed"))
    measurement = result.get("measurement")
    if measurement is None:
        print("  No usable skin pixels.")
    elif not passed:
        print(
            "  Result     withheld (quality gate failed; use --json for raw values)."
        )
    else:
        m = result["measurement"]
        d = result["depth"]
        wc = result["warm_cool"]
        c = result["confidence"]
        sign = "+" if wc["score"] >= 0 else ""
        print(
            f"  Depth      L*={m['L']:.1f}  ITA={d['ita']:.1f} deg  "
            f"({d['label']}; palette {d['palette_bucket']})"
        )
        print(
            f"  Warm-cool  hue={wc['hue']:.1f} deg  score={sign}{wc['score']:.2f}  "
            f"-> {wc['label']}"
        )
        if "hue_std" in wc:
            stable = wc.get("stable")
            stability = (
                "stable" if stable is True else "UNSTABLE" if stable is False else "n/a"
            )
            print(
                f"             hue std={wc['hue_std']:.2f} deg  "
                f"score 95% CI={wc['score_ci95'][0]:+.2f}..{wc['score_ci95'][1]:+.2f}  "
                f"{stability}"
            )
        if wc.get("calibrated"):
            print("             calibrated anchors (labelled swatch data)")
        if "z" in wc:
            print(f"  Relative   z={wc['z']:+.2f} vs store reference group")
        print(
            f"  Confidence {c['score']:.2f} ({c['label']}); "
            f"confirmation: {c['requirement']}"
        )

    status = "pass" if passed else "FAILED"
    print(f"  Quality    {status}")
    if not passed:
        failures = q.get("failures", [])
        print(f"             reasons: {', '.join(failures)}")
        for hint in failure_hints(failures):
            print(f"             hint: {hint}")
    if result.get("palette"):
        names = ", ".join(item["name"] for item in result["palette"])
        print(f"  Palette    {names}")
    for note in result.get("notes", []):
        print(f"  Note       {note}")


def _cmd_demo(args: argparse.Namespace) -> int:
    image = render_face(
        width=args.width,
        height=args.height,
        skin_lab=tuple(args.skin_lab),
        cast=tuple(args.cast),
        patch=not args.no_patch,
        shading=not args.no_shading,
        seed=args.seed,
    )
    result = analyze_srgb(
        image,
        reference_patch=None if args.no_patch else _default_patch(image),
        config=_config_from_args(args),
    )
    if args.save:
        try:
            from PIL import Image
        except ImportError as exc:  # pragma: no cover
            raise SystemExit("Pillow is required for --save") from exc
        out = Path(args.save)
        Image.fromarray((image * 255).round().astype("uint8")).save(out)
        print(f"Saved synthetic image to {out}\n", file=sys.stderr)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        _print_result(result, "synthetic demo")
    return 0


def _default_patch(image: Any) -> tuple[int, int, int, int]:
    import numpy as np

    height, width = np.asarray(image).shape[:2]
    size = int(min(width, height) * 0.11)
    margin = max(8, int(min(width, height) * 0.03))
    return margin, margin, size, size


def _cmd_analyze(args: argparse.Namespace) -> int:
    import numpy as np

    image = np.asarray(_load_image(args.image), dtype=np.float64) / 255.0
    result = analyze_srgb(
        image,
        reference_patch=_resolve_patch(image, args.patch, args.auto_patch),
        config=_config_from_args(args),
    )
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        _print_result(result, str(args.image))
    return 0 if result.get("ok") else 2


def _cmd_pair(args: argparse.Namespace) -> int:
    import numpy as np

    on = np.asarray(_load_image(args.on), dtype=np.float64) / 255.0
    off = np.asarray(_load_image(args.off), dtype=np.float64) / 255.0
    result = analyze_pair_srgb(
        on,
        off,
        reference_patch=_resolve_patch(off, args.patch, args.auto_patch),
        config=_config_from_args(args),
    )
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        _print_result(result, f"{args.on} - {args.off}")
    return 0 if result.get("ok") else 2


def _manual_led_controller() -> Any:
    """Ask the operator to toggle the mirror LEDs before each state change."""
    state: dict[str, bool] = {}

    def set_led(on: bool) -> None:
        if state.get("on") == on:
            return
        state["on"] = on
        action = "ON" if on else "OFF"
        input(f"Turn the mirror LEDs {action}, keep the person still, then press Enter...")

    return set_led


def _print_repeatability(summary: dict[str, Any]) -> None:
    if "hue_std" not in summary:
        print(
            f"  Repeatability  insufficient data "
            f"({summary.get('n_valid', 0)}/{summary.get('n_frames', 0)} valid frames)"
        )
        return
    status = "PASS" if summary.get("passed") else "FAIL"
    print(
        f"  Repeatability  hue std={summary['hue_std']:.2f} deg  "
        f"L* std={summary['L_std']:.2f}  dE max={summary['delta_e_max']:.2f}  {status}"
    )
    if not summary.get("passed"):
        print(f"                 reasons: {', '.join(summary.get('failures', []))}")


def _print_capture(capture: dict[str, Any]) -> None:
    if not capture:
        return
    backend = capture.get("backend", "unknown")
    unsupported = capture.get("unsupported", [])
    unverified = capture.get("unverified", [])
    locked = capture.get("locked", {})
    not_locked = [name for name, state in locked.items() if state is False]
    print(f"  Capture        backend={backend}")
    if unsupported or not_locked:
        names = list(dict.fromkeys([*not_locked, *unsupported]))
        print(f"                 NOT LOCKED: {', '.join(names)}")
    if unverified:
        print(f"                 unverified: {', '.join(unverified)}")


def _cmd_camera(args: argparse.Namespace) -> int:
    from .camera import flicker_safe_exposure

    if args.frames < 1:
        raise SystemExit("--frames must be at least 1")
    if args.pairs and args.frames < 2:
        raise SystemExit("--pairs needs at least 2 repetitions")

    plan_patch = _parse_patch(args.patch)
    plan = CapturePlan(
        tier=args.tier,
        frames=args.frames,
        warmup=args.warmup,
        settle=args.settle,
        flash_pair=args.pairs,
        reference_patch=plan_patch,
    )
    config = _config_from_args(args)
    width = args.width if args.width is not None else (420 if args.synthetic else 1280)
    height = args.height if args.height is not None else (520 if args.synthetic else 720)

    if args.synthetic:
        source: Any = SyntheticCamera(
            width=width,
            height=height,
            ambient_scale=0.35 if args.pairs else 1.0,
            led_strength=1.2 if args.pairs else 0.0,
        )
        if plan.reference_patch is None and not args.auto_patch:
            plan.reference_patch = source.patch_rect
        label = "synthetic camera"
        set_led = source.set_led if args.pairs else None
    else:
        settings = CameraSettings(
            width=width,
            height=height,
            fps=args.fps,
            exposure_seconds=args.exposure_seconds,
            exposure_raw=args.exposure_raw,
            gain=args.gain,
            white_balance=args.white_balance,
            mains_hz=args.mains_hz,
        )
        source = OpenCVCamera(index=args.index, settings=settings)
        label = f"camera {args.index}"
        set_led = _manual_led_controller() if args.pairs else None

    auto_patch_info: dict[str, Any] | None = None
    try:
        if plan.reference_patch is None and args.auto_patch:
            probes = [source.read() for _ in range(3)]
            detection = find_stable_patch(probes, confirmations=2)
            if detection is None:
                print(
                    "Auto patch: no stable neutral reference patch found; "
                    "continuing without white balance.",
                    file=sys.stderr,
                )
            else:
                auto_patch_info = detection.to_dict()
                plan.reference_patch = detection.rect
                print(
                    f"Auto patch: x={detection.rect[0]} y={detection.rect[1]} "
                    f"w={detection.rect[2]} h={detection.rect[3]} "
                    f"contrast={detection.contrast:.1f}",
                    file=sys.stderr,
                )
        outcome = run_capture_test(source, plan, config=config, set_led=set_led)
    finally:
        source.close()

    lighting: dict[str, Any] | None = None
    if args.lighting_check:
        if not args.synthetic:
            raise SystemExit("--lighting-check currently needs --synthetic")
        casts = {
            "neutral": (1.0, 1.0, 1.0),
            "warm_store_light": (1.08, 1.0, 0.88),
            "cool_store_light": (0.90, 0.98, 1.10),
        }
        sessions: dict[str, Any] = {}
        for name, cast in casts.items():
            cam = SyntheticCamera(
                width=width,
                height=height,
                cast=cast,
                ambient_scale=0.35 if args.pairs else 1.0,
                led_strength=1.2 if args.pairs else 0.0,
            )
            try:
                sessions[name] = run_capture_test(
                    cam,
                    plan,
                    config=config,
                    set_led=cam.set_led if args.pairs else None,
                )
            finally:
                cam.close()
        lighting = lighting_stability(
            sessions, lighting_thresholds_for_tier(args.tier)
        )
        lighting["conditions"] = {
            name: session["repeatability"] for name, session in sessions.items()
        }

    payload = dict(outcome)
    payload["reference_patch"] = (
        None if plan.reference_patch is None else list(plan.reference_patch)
    )
    if auto_patch_info is not None:
        payload["auto_patch"] = auto_patch_info
    if lighting is not None:
        payload["lighting_stability"] = lighting

    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print(
            f"Camera capture test ({label}, tier={args.tier}, mode={outcome['mode']})\n"
        )
        exp = flicker_safe_exposure(
            args.exposure_seconds if args.exposure_seconds is not None else 1.0 / args.fps,
            args.mains_hz,
        )
        print(
            f"  Plan           frames={args.frames} warmup={args.warmup} "
            f"exposure={exp * 1000:.0f} ms (mains {args.mains_hz:.0f} Hz)"
        )
        if plan.reference_patch is None:
            print("  Patch          none (no white balance)")
        else:
            x, y, w, h = plan.reference_patch
            source_label = "auto" if auto_patch_info is not None else "set"
            print(f"  Patch          {source_label} x={x} y={y} w={w} h={h}")
        _print_capture(outcome["capture"])
        _print_result(outcome["result"], "median capture")
        _print_repeatability(outcome["repeatability"])
        if lighting is not None:
            status = "PASS" if lighting.get("passed") else "FAIL"
            if "hue_shift" in lighting:
                print(
                    f"  Lighting       hue shift={lighting['hue_shift']:.2f} deg  "
                    f"L* shift={lighting['L_shift']:.2f}  "
                    f"dE max={lighting['delta_e_max']:.2f}  {status}"
                )
            else:
                print(f"  Lighting       insufficient conditions  {status}")

    return 0 if outcome["ok"] and (lighting is None or lighting.get("passed", False)) else 2


def _cmd_live(args: argparse.Namespace) -> int:
    from .live import run_live_demo

    width = args.width if args.width is not None else (420 if args.synthetic else 1280)
    height = args.height if args.height is not None else (520 if args.synthetic else 720)
    config = _config_from_args(args)
    patch = _parse_patch(args.patch)

    if args.synthetic:
        source: Any = SyntheticCamera(width=width, height=height)
        if patch is None and not args.auto_patch:
            patch = source.patch_rect
    else:
        settings = CameraSettings(
            width=width,
            height=height,
            fps=args.fps,
            exposure_seconds=args.exposure_seconds,
            exposure_raw=args.exposure_raw,
            gain=args.gain,
            white_balance=args.white_balance,
            mains_hz=args.mains_hz,
        )
        source = OpenCVCamera(index=args.index, settings=settings)

    print("Live undertone demo. Press q or Esc to quit.")
    return run_live_demo(
        source,
        config=config,
        patch=patch,
        every=args.every,
        mirror=args.mirror,
        max_frames=args.max_frames,
        auto_patch=args.auto_patch,
    )


def _cmd_calibrate(args: argparse.Namespace) -> int:
    samples = read_samples_csv(args.samples)
    calibration = fit_warm_cool(
        samples, depth_reference_L=args.depth_reference
    )
    config = calibration.apply()
    eval_samples = read_samples_csv(args.eval) if args.eval else samples
    metrics = evaluate_warm_cool(eval_samples, config)
    if args.output:
        calibration.save(args.output)

    if args.json:
        print(
            json.dumps(
                {
                    "calibration": calibration.to_dict(),
                    "evaluation": metrics,
                    "evaluated_on": args.eval or args.samples,
                },
                indent=2,
            )
        )
        return 0

    print("Warm-cool calibration")
    print(
        f"  Anchors      neutral_hue={calibration.neutral_hue:.2f} deg  "
        f"span={calibration.hue_span:.2f} deg  "
        f"neutral_band={calibration.neutral_band:.2f}"
    )
    print(
        f"  Depth        slope={calibration.depth_hue_slope:+.3f} deg/L*  "
        f"reference L*={calibration.depth_reference_L:.1f}"
    )
    print(
        f"  Samples      n={calibration.n_samples}  "
        f"warm/cool separation={calibration.separation_deg:.1f} deg"
    )
    print(f"  Output       {args.output or '(not saved)'}")
    label = "held-out" if args.eval else "training"
    print(
        f"  {label.capitalize():<12} accuracy={metrics['accuracy']:.3f}  "
        f"balanced={metrics['balanced_accuracy']:.3f}  "
        f"score MAE={metrics['mean_score_error']:.2f}  n={metrics['n']}"
    )
    if not args.eval:
        print(
            "               (training accuracy; pass --eval with unseen "
            "samples for an honest number)"
        )
    for note in calibration.notes:
        print(f"  Note         {note}")
    return 0


def _cmd_detect_patch(args: argparse.Namespace) -> int:
    import numpy as np

    image = np.asarray(_load_image(args.image), dtype=np.float64) / 255.0
    detection = find_gray_patch(
        image,
        border_only=not args.anywhere,
        max_chroma=args.max_chroma,
    )
    if args.json:
        print(json.dumps(None if detection is None else detection.to_dict(), indent=2))
    elif detection is None:
        print("No neutral reference patch found.")
    else:
        x, y, w, h = detection.rect
        print(f"Patch: x={x} y={y} w={w} h={h}")
        print(
            f"  area={detection.area} rectangularity={detection.rectangularity:.2f} "
            f"aspect={detection.aspect:.2f} contrast={detection.contrast:.1f} "
            f"chroma={detection.chroma:.1f} L*={detection.L:.1f} "
            f"L* std={detection.L_std:.2f} score={detection.score:.3f}"
        )
    return 0 if detection is not None else 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="undertone",
        description=(
            "Measure skin depth and a warm-to-cool position from a camera frame. "
            "Results are estimates and must be confirmed with swatches."
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    def add_common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--tier", choices=["ideal", "minimum"], default="minimum")
        p.add_argument("--reference-mean", type=float, default=None)
        p.add_argument("--reference-std", type=float, default=None)
        p.add_argument(
            "--calibration",
            default=None,
            help="JSON warm/cool calibration from the calibrate command",
        )
        p.add_argument("--json", action="store_true", help="print full JSON")

    demo = sub.add_parser("demo", help="run on a synthetic face")
    demo.add_argument("--width", type=int, default=420)
    demo.add_argument("--height", type=int, default=520)
    demo.add_argument("--skin-lab", nargs=3, type=float, default=(60.0, 12.0, 22.0))
    demo.add_argument("--cast", nargs=3, type=float, default=(1.0, 0.99, 0.95))
    demo.add_argument("--seed", type=int, default=0)
    demo.add_argument("--no-patch", action="store_true")
    demo.add_argument("--no-shading", action="store_true")
    demo.add_argument("--save", default=None)
    add_common(demo)
    demo.set_defaults(func=_cmd_demo)

    analyze = sub.add_parser("analyze", help="measure one image")
    analyze.add_argument("image")
    analyze.add_argument("--patch", nargs=4, type=int, default=None)
    analyze.add_argument(
        "--auto-patch",
        action="store_true",
        help="find the neutral reference patch automatically",
    )
    add_common(analyze)
    analyze.set_defaults(func=_cmd_analyze)

    pair = sub.add_parser("pair", help="measure a flash/no-flash pair")
    pair.add_argument("on")
    pair.add_argument("off")
    pair.add_argument("--patch", nargs=4, type=int, default=None)
    pair.add_argument(
        "--auto-patch",
        action="store_true",
        help="find the neutral reference patch automatically in the no-flash image",
    )
    add_common(pair)
    pair.set_defaults(func=_cmd_pair)

    calibrate = sub.add_parser(
        "calibrate",
        help="fit warm/cool anchors from a labelled swatch CSV (L,a,b,label)",
    )
    calibrate.add_argument("samples", help="CSV with columns L,a,b,label")
    calibrate.add_argument(
        "--output", default=None, help="write the calibration JSON here"
    )
    calibrate.add_argument(
        "--eval",
        default=None,
        help="separate labelled CSV for an honest held-out accuracy",
    )
    calibrate.add_argument("--depth-reference", type=float, default=60.0)
    calibrate.add_argument("--json", action="store_true", help="print full JSON")
    calibrate.set_defaults(func=_cmd_calibrate)

    detect = sub.add_parser(
        "detect-patch",
        help="locate a neutral reference patch in an image",
    )
    detect.add_argument("image")
    detect.add_argument(
        "--anywhere",
        action="store_true",
        help="search the whole frame instead of only the border",
    )
    detect.add_argument("--max-chroma", type=float, default=5.0)
    detect.add_argument("--json", action="store_true", help="print full JSON")
    detect.set_defaults(func=_cmd_detect_patch)

    camera = sub.add_parser(
        "camera",
        help="run the fixed-camera capture test (repeatability, not accuracy)",
    )
    camera.add_argument(
        "--synthetic",
        action="store_true",
        help="use the synthetic camera fixture instead of hardware",
    )
    camera.add_argument("--index", type=int, default=0, help="camera index")
    camera.add_argument("--frames", type=int, default=8)
    camera.add_argument("--warmup", type=int, default=5)
    camera.add_argument("--settle", type=int, default=2)
    camera.add_argument(
        "--pairs",
        action="store_true",
        help="capture flash/no-flash pairs (toggles LEDs or prompts the operator)",
    )
    camera.add_argument(
        "--lighting-check",
        action="store_true",
        help="synthetic only: repeat under three store-light casts",
    )
    camera.add_argument("--patch", nargs=4, type=int, default=None)
    camera.add_argument(
        "--auto-patch",
        action="store_true",
        help="find the neutral reference patch from a probe frame",
    )
    camera.add_argument("--width", type=int, default=None)
    camera.add_argument("--height", type=int, default=None)
    camera.add_argument("--fps", type=float, default=20.0)
    camera.add_argument(
        "--exposure-seconds",
        type=float,
        default=None,
        help="requested exposure; rounded to a whole flicker cycle",
    )
    camera.add_argument(
        "--exposure-raw",
        type=float,
        default=None,
        help="backend-specific exposure value written to the camera",
    )
    camera.add_argument("--gain", type=float, default=0.0)
    camera.add_argument("--white-balance", type=float, default=4500.0)
    camera.add_argument("--mains-hz", type=float, default=50.0)
    add_common(camera)
    camera.set_defaults(func=_cmd_camera)

    live = sub.add_parser(
        "live",
        help="open a live camera preview with the measurement drawn on it",
    )
    live.add_argument(
        "--synthetic",
        action="store_true",
        help="run the preview on the synthetic camera fixture",
    )
    live.add_argument("--index", type=int, default=0, help="camera index")
    live.add_argument("--patch", nargs=4, type=int, default=None)
    live.add_argument(
        "--auto-patch",
        action="store_true",
        help="find the reference patch once from the first frame",
    )
    live.add_argument("--every", type=int, default=3, help="measure every N frames")
    live.add_argument("--mirror", action="store_true", help="mirror the preview")
    live.add_argument(
        "--max-frames",
        type=int,
        default=0,
        help="stop after N frames (0 runs until q)",
    )
    live.add_argument("--width", type=int, default=None)
    live.add_argument("--height", type=int, default=None)
    live.add_argument("--fps", type=float, default=20.0)
    live.add_argument("--exposure-seconds", type=float, default=None)
    live.add_argument("--exposure-raw", type=float, default=None)
    live.add_argument("--gain", type=float, default=0.0)
    live.add_argument("--white-balance", type=float, default=4500.0)
    live.add_argument("--mains-hz", type=float, default=50.0)
    add_common(live)
    live.set_defaults(func=_cmd_live)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
