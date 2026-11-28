#!/usr/bin/env python3
"""
AER Acceptance Verification: DW-05/06 Fast Brain Subagent ROI & Quota Routing

Contract:
- Baseline Expected: DEFECT_OBSERVED (exit 101)
- Candidate Expected: DEFECT_ABSENT (exit 0)
"""

from __future__ import annotations

import pathlib
import sys

repo_root = pathlib.Path(__file__).resolve().parent.parent

defects: list[str] = []

router_path = repo_root / "server" / "fast-brain-router.ts"
router_test_path = repo_root / "server" / "fast-brain-router.test.ts"

# 1. Router implementation verification
if not router_path.is_file():
    defects.append("Missing server/fast-brain-router.ts")
else:
    content = router_path.read_text(encoding="utf-8")
    if "evaluateSubagentDispatchROI" not in content:
        defects.append("Missing evaluateSubagentDispatchROI in server/fast-brain-router.ts")
    if "resolveQuotaAwareRouting" not in content:
        defects.append("Missing resolveQuotaAwareRouting in server/fast-brain-router.ts")
    if "injectTailSlotContext" not in content:
        defects.append("Missing injectTailSlotContext in server/fast-brain-router.ts")
    if "SUBAGENT_COLD_START_TOKENS" not in content:
        defects.append("Missing SUBAGENT_COLD_START_TOKENS in server/fast-brain-router.ts")
    if "POOL_C_CRITICAL_QUOTA_THRESHOLD" not in content:
        defects.append("Missing POOL_C_CRITICAL_QUOTA_THRESHOLD in server/fast-brain-router.ts")

# 2. Router test verification
if not router_test_path.is_file():
    defects.append("Missing server/fast-brain-router.test.ts")
else:
    test_content = router_test_path.read_text(encoding="utf-8")
    if "evaluateSubagentDispatchROI" not in test_content:
        defects.append("Missing evaluateSubagentDispatchROI assertions in test file")
    if "resolveQuotaAwareRouting" not in test_content:
        defects.append("Missing resolveQuotaAwareRouting assertions in test file")

if defects:
    print(f"DEFECT_OBSERVED: Fast brain routing defects detected ({len(defects)}): {'; '.join(defects)}", file=sys.stderr, flush=True)
    sys.exit(101)

print("DEFECT_ABSENT: Fast brain routing verified.", flush=True)
sys.exit(0)
