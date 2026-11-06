import numpy as np
import pytest

from undertone.color import srgb_to_lab
from undertone.palette import Palette, depth_from_ita, dominant_colors


@pytest.fixture(scope="module")
def palette():
    return Palette.from_json()


def test_palette_has_all_groups(palette):
    for undertone in ("warm", "cool", "neutral"):
        for depth in ("light", "medium", "deep"):
            assert len(palette.colors(undertone, depth)) >= 8


def test_exact_color_scores_zero_and_ranks_first(palette):
    target = palette.colors("warm", "medium")[0]
    exact = palette.score_garment([target.lab], "warm", "medium")
    assert exact["score"] == pytest.approx(0.0, abs=1e-6)

    far = palette.score_garment([[20.0, 0.0, -60.0]], "warm", "medium")
    assert far["score"] > exact["score"]

    ranked = palette.rank_garments(
        [
            {"id": "far", "colors": [[20.0, 0.0, -60.0]]},
            {"id": "exact", "colors": [target.lab]},
        ],
        "warm",
        "medium",
    )
    assert [item["id"] for item in ranked] == ["exact", "far"]


def test_weights_are_normalized(palette):
    result = palette.score_garment(
        [{"lab": [50, 0, 0], "weight": 3.0}, {"lab": [60, 0, 0], "weight": 1.0}],
        "neutral",
        "medium",
    )
    assert sum(item["weight"] for item in result["per_color"]) == pytest.approx(1.0)


def test_depth_from_ita_buckets():
    assert depth_from_ita(60.0) == "light"
    assert depth_from_ita(30.0) == "medium"
    assert depth_from_ita(0.0) == "deep"


def test_dominant_colors_recovers_two_clusters():
    red = np.array([0.8, 0.15, 0.15])
    blue = np.array([0.15, 0.2, 0.8])
    image = np.zeros((40, 40, 3))
    image[:20] = red
    image[20:] = blue
    colors = dominant_colors(image, k=2, seed=1)
    expected = [srgb_to_lab(red), srgb_to_lab(blue)]
    recovered = [np.array(c["lab"]) for c in colors]
    for want in expected:
        assert min(np.linalg.norm(got - want) for got in recovered) < 2.0
    assert sum(c["weight"] for c in colors) == pytest.approx(1.0)
    assert colors[0]["weight"] == pytest.approx(0.5, abs=0.02)
