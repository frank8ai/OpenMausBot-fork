"""AER Verify Acceptance Test for Cross-Project Solo Watcher Daemon."""

from pathlib import Path


def test_solo_watcher_contract():
    repo_root = Path(__file__).resolve().parent.parent
    target_watcher = repo_root / "server" / "solo-watcher.ts"
    target_cli = repo_root / "server" / "solo-status-cli.ts"
    assert target_watcher.is_file(), "server/solo-watcher.ts must exist"
    assert target_cli.is_file(), "server/solo-status-cli.ts must exist"
