import numpy as np
import pytest

from undertone.calibration import PatchTracker, find_gray_patch, find_stable_patch
from undertone.demo import render_face


def test_finds_synthetic_gray_patch():
    image = render_face()
    detection = find_gray_patch(image)
    assert detection is not None
    x, y, w, h = detection.rect
    assert (x, y) == pytest.approx((12, 12), abs=2)
    assert w == pytest.approx(46, abs=3)
    assert h == pytest.approx(46, abs=3)
    assert detection.rectangularity > 0.9
    assert detection.chroma < 5.0
    assert detection.L_std < 1.0
    assert detection.contrast > 5.0
    assert detection.aspect == pytest.approx(1.0, abs=0.2)


def test_returns_none_when_no_patch_is_present():
    assert find_gray_patch(render_face(patch=False)) is None


def test_accepts_uint8_images():
    image = (render_face() * 255.0).round().astype(np.uint8)
    detection = find_gray_patch(image)
    assert detection is not None
    assert detection.rect[2] > 20


def test_rejects_non_image_input():
    with pytest.raises(ValueError):
        find_gray_patch(np.zeros((10, 10)))


def test_detection_serializes():
    detection = find_gray_patch(render_face())
    payload = detection.to_dict()
    assert set(payload) == {
        "rect",
        "area",
        "rectangularity",
        "contrast",
        "chroma",
        "L",
        "L_std",
        "aspect",
        "score",
    }


def test_rejects_candidates_without_surrounding_contrast():
    assert find_gray_patch(render_face(), min_contrast=100.0) is None


def test_rejects_neutral_regions_touching_the_frame_edge():
    image = np.full((240, 320, 3), (0.24, 0.31, 0.48), dtype=float)
    image[:, :70] = 0.5
    assert find_gray_patch(image, fallback_anywhere=True) is None


def test_falls_back_to_a_centered_patch():
    image = np.full((240, 320, 3), (0.24, 0.31, 0.48), dtype=float)
    image[120:180, 220:280] = 0.5
    detection = find_gray_patch(image)
    assert detection is not None
    assert detection.rect == (220, 120, 60, 60)


def test_finds_card_on_a_neutral_wall_via_edges():
    pytest.importorskip("cv2")
    image = np.full((240, 320, 3), 0.35, dtype=float)
    image[120:180, 220:280] = 0.5
    detection = find_gray_patch(image)
    assert detection is not None
    assert detection.rect == (220, 120, 60, 60)


def test_rejects_extremely_elongated_regions():
    image = np.full((240, 320, 3), (0.24, 0.31, 0.48), dtype=float)
    image[110:125, 100:220] = 0.5
    assert find_gray_patch(image) is None


def test_tracker_needs_consecutive_confirmations():
    frame = render_face()
    tracker = PatchTracker(confirmations=2)
    assert tracker.update(frame, force=True) is None
    detection = tracker.update(frame, force=True)
    assert detection is not None
    assert detection.rect == (12, 12, 46, 46)


def test_tracker_drops_a_removed_patch_after_misses():
    frame = render_face()
    empty = render_face(patch=False)
    tracker = PatchTracker(confirmations=1, max_missed=3)
    assert tracker.update(frame, force=True) is not None
    assert tracker.update(empty, force=True) is not None
    assert tracker.update(empty, force=True) is not None
    assert tracker.update(empty, force=True) is None


def test_find_stable_patch_across_frames():
    frames = [render_face() for _ in range(3)]
    detection = find_stable_patch(frames)
    assert detection is not None
    assert detection.rect == (12, 12, 46, 46)
    assert find_stable_patch([render_face()]) is None
