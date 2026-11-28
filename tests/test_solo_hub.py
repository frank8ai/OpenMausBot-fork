"""AER Verify Acceptance Test for Solo Company UI v5."""

from pathlib import Path


def test_solo_hub_contract():
    repo_root = Path(__file__).resolve().parent.parent
    target_matrix = repo_root / "src" / "components" / "solo-hub" / "SoloProjectMatrix.tsx"
    target_card = repo_root / "src" / "components" / "solo-hub" / "SingleDecisionCard.tsx"
    assert target_matrix.is_file(), "src/components/solo-hub/SoloProjectMatrix.tsx must exist"
    assert target_card.is_file(), "src/components/solo-hub/SingleDecisionCard.tsx must exist"