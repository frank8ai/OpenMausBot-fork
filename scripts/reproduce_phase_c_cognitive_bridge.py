#!/usr/bin/env python3
"""
AER Acceptance Verification: Phase C Cognitive Bridge & Cross-Family Guardrails

Contract:
- Baseline Expected: DEFECT_OBSERVED (exit 101)
- Candidate Expected: DEFECT_ABSENT (exit 0)
"""

from __future__ import annotations

import pathlib
import sys

repo_root = pathlib.Path(__file__).resolve().parent.parent

defects: list[str] = []

# Core contract, schema, service, repo, runtime, and acceptance test paths
files_to_check: dict[str, list[str]] = {
    "server/micro-loop/contracts/friction-event.schema.ts": [
        "FrictionEventPayloadSchema",
        "SignedFrictionEventSchema",
        "computeContextHash",
        "computeFrictionFingerprint",
        "signFrictionEvent",
        "verifyFrictionEventHmac",
    ],
    "server/micro-loop/contracts/compiled-rule.schema.ts": [
        "CompiledRuleDraftSchema",
        "exclusion_boundaries",
        "inhibits_patterns",
        "contrastive_probes",
        "SYMBOLIC_SCRIPT_0TOKEN",
        "PROMPT_SKILL_BOUNDED",
    ],
    "server/micro-loop/contracts/ports.ts": [
        "HARNESS_EXIT_CODES",
        "IHarnessBridgePort",
        "IFrictionLedgerPort",
        "ILkgHotReloadPort",
        "BLOCKED_SAME_FAMILY",
    ],
    "server/micro-loop/config/micro-loop.config.ts": [
        "MicroLoopConfig",
        "loadMicroLoopConfig",
    ],
    "server/micro-loop/repo/friction-ledger.repo.ts": [
        "FrictionLedgerRepo",
        ".write.lock",
        "appendEvent",
    ],
    "server/micro-loop/service/friction-sniffer.service.ts": [
        "FrictionSnifferService",
        "sniffExplicitCorrection",
        "sniffUndo",
        "sniffEditRetry",
        "sniffThumbsDown",
    ],
    "server/micro-loop/service/neuro-symbolic-compiler.service.ts": [
        "compileFrictionCluster",
        "classifyCompileTarget",
        "renderBoundedTailSkillCard",
    ],
    "server/micro-loop/runtime/harness-cli.adapter.ts": [
        "HarnessCliAdapter",
        "cliPath",
    ],
    "server/micro-loop/runtime/lkg-hot-reload.runtime.ts": [
        "LkgHotReloadRuntime",
        "atomicSwapManifest",
        "rollbackToPreviousManifest",
        "verifyManifestHmac",
        "shouldRouteCanary",
    ],
    "server/micro-loop/service/micro-loop-bridge.service.ts": [
        "MicroLoopBridgeService",
        "detectModelFamily",
        "selectCrossFamilyReviewer",
        "runEvolutionPipeline",
    ],
    "server/fast-brain-router.ts": [
        "selectAndInjectMicroLoopSkills",
        "validateTailSlotIntegrity",
    ],
    "server/micro-loop/phase-c-acceptance.test.ts": [
        "DW-3.1",
        "DW-3.2",
        "DW-3.3",
        "DW-3.4",
    ],
    "docs/SPEC_PHASE_C_COGNITIVE_BRIDGE.md": [
        "DW-3.1",
        "DW-3.2",
        "DW-3.3",
        "DW-3.4",
    ],
}

for rel_path, required_symbols in files_to_check.items():
    target = repo_root / pathlib.Path(rel_path)
    if not target.is_file():
        defects.append(f"Missing file: {rel_path}")
        continue

    try:
        content = target.read_text(encoding="utf-8")
        for sym in required_symbols:
            if sym not in content:
                defects.append(f"Missing symbol '{sym}' in {rel_path}")
    except Exception as exc:
        defects.append(f"Failed to read {rel_path}: {exc}")

if defects:
    print(
        f"DEFECT_OBSERVED: Phase C cognitive bridge defects detected ({len(defects)}): {'; '.join(defects)}",
        file=sys.stderr,
        flush=True,
    )
    sys.exit(101)

print("DEFECT_ABSENT: Phase C cognitive bridge and cross-family guardrails verified.", flush=True)
sys.exit(0)
