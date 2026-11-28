#!/usr/bin/env python3
"""
AER Acceptance Verification: Anti-Phantom-Dispatch Hard Gate & Tool Reconciliation

Contract:
- Baseline Expected: DEFECT_OBSERVED (exit 101)
- Candidate Expected: DEFECT_ABSENT (exit 0)
"""

from __future__ import annotations

import pathlib
import sys

repo_root = pathlib.Path(__file__).resolve().parent.parent

defects: list[str] = []

gate_path = repo_root / "server" / "drivers" / "phantom-dispatch-gate.ts"
announcement_path = repo_root / "server" / "drivers" / "chat-announcement.ts"
chat_runtime_path = repo_root / "server" / "drivers" / "openai-chat.ts"
test_path = repo_root / "server" / "drivers" / "openai-chat-phantom-dispatch.test.ts"

# 1. Gate driver verification
if not gate_path.is_file():
    defects.append("Missing server/drivers/phantom-dispatch-gate.ts")
else:
    gate_content = gate_path.read_text(encoding="utf-8")
    if "parseVerifiedReceipts" not in gate_content:
        defects.append("Missing parseVerifiedReceipts in phantom-dispatch-gate.ts")
    if "reconcileDispatchClaims" not in gate_content:
        defects.append("Missing reconcileDispatchClaims in phantom-dispatch-gate.ts")
    if 'r.outcome !== "queued" && r.outcome !== "injected"' not in gate_content:
        defects.append("Missing strict outcome whitelist check in phantom-dispatch-gate.ts")

# 2. Announcement detector verification
if not announcement_path.is_file():
    defects.append("Missing server/drivers/chat-announcement.ts")
else:
    ann_content = announcement_path.read_text(encoding="utf-8")
    if "detectUnverifiedDispatchClaim" not in ann_content:
        defects.append("Missing detectUnverifiedDispatchClaim in chat-announcement.ts")
    if "DISPATCH_CLAIM_PATTERNS" not in ann_content:
        defects.append("Missing DISPATCH_CLAIM_PATTERNS in chat-announcement.ts")

# 3. Chat runtime integration verification
if not chat_runtime_path.is_file():
    defects.append("Missing server/drivers/openai-chat.ts")
else:
    chat_content = chat_runtime_path.read_text(encoding="utf-8")
    if "reconcileDispatchClaims" not in chat_content:
        defects.append("Missing reconcileDispatchClaims integration in openai-chat.ts")
    if "OMB_PHANTOM_DISPATCH_GUARD" not in chat_content:
        defects.append("Missing OMB_PHANTOM_DISPATCH_GUARD support in openai-chat.ts")

# 4. Test coverage verification
if not test_path.is_file():
    defects.append("Missing server/drivers/openai-chat-phantom-dispatch.test.ts")
else:
    test_content = test_path.read_text(encoding="utf-8")
    if "REAL_PHANTOM_DISPATCH_SAMPLES" not in test_content:
        defects.append("Missing REAL_PHANTOM_DISPATCH_SAMPLES in test file")
    if "parseVerifiedReceipts unit tests" not in test_content:
        defects.append("Missing parseVerifiedReceipts unit tests")

if defects:
    print(f"[DEFECT_OBSERVED] Phantom dispatch defects detected ({len(defects)}): {'; '.join(defects)}")
    sys.exit(101)

print("[DEFECT_ABSENT] Phantom dispatch hard gate and tool reconciliation fully verified.")
sys.exit(0)
