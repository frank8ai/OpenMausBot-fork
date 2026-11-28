#!/usr/bin/env python3
"""
AER Acceptance Verification: Cross-Project Local Watcher Daemon & Solo Company Hub Status CLI

Contract:
- Baseline Expected: DEFECT_OBSERVED (exit 101)
- Candidate Expected: DEFECT_ABSENT (exit 0)
"""

from __future__ import annotations

import pathlib
import sys

repo_root = pathlib.Path(__file__).resolve().parent.parent

defects: list[str] = []

watcher_path = repo_root / "server" / "solo-watcher.ts"
cli_status_path = repo_root / "server" / "solo-status-cli.ts"
watcher_test_path = repo_root / "server" / "solo-watcher.test.ts"
cli_status_test_path = repo_root / "server" / "solo-status-cli.test.ts"
status_route_path = repo_root / "server" / "routes" / "status.ts"
cli_path = repo_root / "server" / "cli.ts"

if not watcher_path.is_file():
    defects.append("Missing server/solo-watcher.ts")
else:
    content = watcher_path.read_text(encoding="utf-8")
    if "SoloWatcherDaemon" not in content:
        defects.append("Missing SoloWatcherDaemon export in server/solo-watcher.ts")
    if "inspectAllProjects" not in content:
        defects.append("Missing inspectAllProjects in server/solo-watcher.ts")

if not cli_status_path.is_file():
    defects.append("Missing server/solo-status-cli.ts")
else:
    content = cli_status_path.read_text(encoding="utf-8")
    if "runSoloStatusCli" not in content:
        defects.append("Missing runSoloStatusCli export in server/solo-status-cli.ts")

if not watcher_test_path.is_file():
    defects.append("Missing server/solo-watcher.test.ts")

if not cli_status_test_path.is_file():
    defects.append("Missing server/solo-status-cli.test.ts")

if status_route_path.is_file():
    content = status_route_path.read_text(encoding="utf-8")
    if "/api/solo-status" not in content:
        defects.append("Missing //api/solo-status route registration in server/routes/status.ts")
else:
    defects.append("Missing server/routes/status.ts")

if cli_path.is_file():
    content = cli_path.read_text(encoding="utf-8")
    if "solo-status" not in content:
        defects.append("Missing solo-status command routing in server/cli.ts")
else:
    defects.append("Missing server/cli.ts")

if defects:
    print(f"[DEFECT_OBSERVED] Solo Watcher defects detected ({len(defects)}): {'; '.join(defects)}")
    sys.exit(101)

print("[DEFECT_ABSENT] Cross-Project Local Watcher Daemon & Solo Status CLI verified.")
sys.exit(0)
