#!/usr/bin/env python3
"""
AER Acceptance Verification: OpenMausBot UI v5.0 Solo Company Mode & Scannable Decision Flow

Contract:
- Baseline Expected: DEFECT_OBSERVED (exit 101)
- Candidate Expected: DEFECT_ABSENT (exit 0)
"""

from __future__ import annotations

import pathlib
import sys

repo_root = pathlib.Path(__file__).resolve().parent.parent

defects: list[str] = []

matrix_path = repo_root / "src" / "components" / "solo-hub" / "SoloProjectMatrix.tsx"
decision_card_path = repo_root / "src" / "components" / "solo-hub" / "SingleDecisionCard.tsx"
capsule_path = repo_root / "src" / "components" / "solo-hub" / "PipelineStatusCapsule.tsx"
folded_path = repo_root / "src" / "components" / "solo-hub" / "FoldedVerboseMessage.tsx"
hub_lib_path = repo_root / "src" / "lib" / "solo-hub.ts"
flow_lib_path = repo_root / "src" / "lib" / "solo-decision-flow.ts"
test_path = repo_root / "src" / "components" / "solo-hub" / "SoloHub.dom.test.ts"

if not matrix_path.is_file():
    defects.append("Missing src/components/solo-hub/SoloProjectMatrix.tsx")
else:
    content = matrix_path.read_text(encoding="utf-8")
    if "SoloProjectMatrix" not in content:
        defects.append("Missing SoloProjectMatrix export")
    if "pendingTotal > 0 &&" in content:
        defects.append("Violation of DESIGN.md: pendingTotal badge above sidebar list")

if not decision_card_path.is_file():
    defects.append("Missing src/components/solo-hub/SingleDecisionCard.tsx")
else:
    content = decision_card_path.read_text(encoding="utf-8")
    if "SingleDecisionCard" not in content:
        defects.append("Missing SingleDecisionCard export")
    if "useStoreDispatch" not in content:
        defects.append("SingleDecisionCard must use selective store dispatch")
    if "SkillRequestPreview" not in content:
        defects.append("SingleDecisionCard must preserve SkillRequestPreview")

if not hub_lib_path.is_file():
    defects.append("Missing src/lib/solo-hub.ts")

if not flow_lib_path.is_file():
    defects.append("Missing src/lib/solo-decision-flow.ts")

if not test_path.is_file():
    defects.append("Missing src/components/solo-hub/SoloHub.dom.test.ts")

if defects:
    print(f"[DEFECT_OBSERVED] Solo Hub defects detected ({len(defects)}): {'; '.join(defects)}")
    sys.exit(101)

print("[DEFECT_ABSENT] OpenMausBot UI v5.0 Solo Company Mode & Scannable Decision Flow verified.")
sys.exit(0)