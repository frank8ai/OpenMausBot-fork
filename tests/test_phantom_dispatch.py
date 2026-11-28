"""AER Verify Acceptance Test for Anti-Phantom-Dispatch Hard Gate."""

from pathlib import Path


def test_phantom_dispatch_contract():
    repo_root = Path(__file__).resolve().parent.parent
    target_gate = repo_root / "server" / "drivers" / "phantom-dispatch-gate.ts"
    assert target_gate.is_file(), "server/drivers/phantom-dispatch-gate.ts must exist"
