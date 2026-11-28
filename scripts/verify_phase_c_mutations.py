#!/usr/bin/env python3
"""
Phase C Mutation Testing Verification Runner

Executes M1, M2, and M3 mutation tests:
- M1: CompiledRuleDraftSchema exclusion_boundaries check mutation
- M2: Cross-family blind review same-family model check mutation
- M3: HMAC verification integrity check mutation

Asserts 100% kill rate (3/3 killed, 0 survived).
Restores all mutated files safely in finally blocks using git restore.
"""

from __future__ import annotations

import pathlib
import subprocess
import sys

repo_root = pathlib.Path(__file__).resolve().parent.parent

def run_cmd(cmd: list[str]) -> tuple[int, str, str]:
    res = subprocess.run(
        cmd,
        cwd=repo_root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        shell=True,
    )
    return res.returncode, res.stdout, res.stderr


print("=" * 70)
print("Phase C Mutation Testing (M1 / M2 / M3) - Apex Reliability & E2E")
print("=" * 70)

mutants_killed = 0
total_mutants = 3

# -------------------------------------------------------------
# Baseline Run: Ensure tests pass 100% before introducing mutants
# -------------------------------------------------------------
print("\n[Baseline] Running initial unmutated test suite...")
code, stdout, stderr = run_cmd(["pnpm", "vitest", "run", "server/micro-loop/"])
if code != 0:
    print(f"FAILED: Baseline tests failed with exit code {code}!\n{stdout}\n{stderr}")
    sys.exit(1)
print("✓ Baseline test suite: 100% PASS (clean state verified)")

# -------------------------------------------------------------
# Mutant M1: Remove exclusion_boundaries check from CompiledRuleDraftSchema
# -------------------------------------------------------------
m1_rel = "server/micro-loop/contracts/compiled-rule.schema.ts"
m1_target = repo_root / pathlib.Path(m1_rel)
m1_original = m1_target.read_text(encoding="utf-8")
try:
    print("\n[M1] Injecting mutant: Removing exclusion_boundaries >= 1 check...")
    mutated_content = m1_original.replace(
        "exclusion_boundaries: z.array(z.string().min(5).max(240)).min(1).max(5),",
        "exclusion_boundaries: z.array(z.string().min(5).max(240)).max(5).default([]),",
    )
    if mutated_content == m1_original:
        raise RuntimeError("Failed to inject mutant M1: target pattern not found")
    m1_target.write_text(mutated_content, encoding="utf-8")

    code, stdout, stderr = run_cmd(["pnpm", "vitest", "run", "server/micro-loop/contracts.test.ts"])
    if code != 0:
        mutants_killed += 1
        print(f"✓ MUTANT M1 KILLED! Test failed as expected (Exit Code: {code}).")
        print("  Evidence: Test caught missing exclusion_boundaries constraint.")
    else:
        print("✗ MUTANT M1 SURVIVED! Test suite did not catch mutant!")
finally:
    run_cmd(["git", "checkout", "--", m1_rel])
    print(f"  Restored clean {m1_rel}")

# -------------------------------------------------------------
# Mutant M2: Tamper selectCrossFamilyReviewer to allow same-family model
# -------------------------------------------------------------
m2_rel = "server/micro-loop/service/micro-loop-bridge.service.ts"
m2_target = repo_root / pathlib.Path(m2_rel)
m2_original = m2_target.read_text(encoding="utf-8")
try:
    print("\n[M2] Injecting mutant: Permitting same-family self review...")
    mutated_content = m2_original.replace(
        'return "gemini-4-hydrogen";',
        'return "claude-3-7-sonnet";',  # Return same family for claude-3-7-sonnet!
    )
    if mutated_content == m2_original:
        raise RuntimeError("Failed to inject mutant M2: target pattern not found")
    m2_target.write_text(mutated_content, encoding="utf-8")

    code, stdout, stderr = run_cmd(["pnpm", "vitest", "run", "server/micro-loop/phase-c-acceptance.test.ts"])
    if code != 0:
        mutants_killed += 1
        print(f"✓ MUTANT M2 KILLED! Test failed as expected (Exit Code: {code}).")
        print("  Evidence: Test caught same-family model reviewer selection.")
    else:
        print("✗ MUTANT M2 SURVIVED! Test suite did not catch mutant!")
finally:
    run_cmd(["git", "checkout", "--", m2_rel])
    print(f"  Restored clean {m2_rel}")

# -------------------------------------------------------------
# Mutant M3: Bypass HMAC verification in verifyManifestHmac
# -------------------------------------------------------------
m3_rel = "server/micro-loop/runtime/lkg-hot-reload.runtime.ts"
m3_target = repo_root / pathlib.Path(m3_rel)
m3_original = m3_target.read_text(encoding="utf-8")
try:
    print("\n[M3] Injecting mutant: Bypassing manifest HMAC verification (always return true)...")
    mutated_content = m3_original.replace(
        'return timingSafeEqual(',
        'return true; // return timingSafeEqual(',
    )
    if mutated_content == m3_original:
        raise RuntimeError("Failed to inject mutant M3: target pattern not found")
    m3_target.write_text(mutated_content, encoding="utf-8")

    code, stdout, stderr = run_cmd(["pnpm", "vitest", "run", "server/micro-loop/lkg-hot-reload.test.ts"])
    if code != 0:
        mutants_killed += 1
        print(f"✓ MUTANT M3 KILLED! Test failed as expected (Exit Code: {code}).")
        print("  Evidence: Test caught bypassed HMAC verification on invalid/tampered manifest.")
    else:
        print("✗ MUTANT M3 SURVIVED! Test suite did not catch mutant!")
finally:
    run_cmd(["git", "checkout", "--", m3_rel])
    print(f"  Restored clean {m3_rel}")

# -------------------------------------------------------------
# Final Verdict
# -------------------------------------------------------------
kill_rate = (mutants_killed / total_mutants) * 100
print("\n" + "=" * 70)
print(f"MUTATION TESTING SUMMARY: {mutants_killed}/{total_mutants} mutants killed ({kill_rate:.1f}%)")
print("=" * 70)

if mutants_killed != total_mutants:
    print(f"CRITICAL: Mutation kill rate is {kill_rate:.1f}% (< 100%). Quality Gate REJECTED.")
    sys.exit(1)

print("QA PASS: Mutation score = 100.0%. All assertion fences verified lethal.")
sys.exit(0)
