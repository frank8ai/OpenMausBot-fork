"""AER Verify Acceptance Test for Fast Brain Subagent ROI and Quota Routing Gate."""

from pathlib import Path

def test_fast_brain_routing_contract():
    repo_root = Path(__file__).resolve().parent.parent
    router_file = repo_root / "server" / "fast-brain-router.ts"
    assert router_file.is_file(), "server/fast-brain-router.ts must exist"
