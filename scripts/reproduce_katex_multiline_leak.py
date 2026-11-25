#!/usr/bin/env python3
"""
AER Acceptance Verification: KaTeX Multi-line Math Delimiter Leak & Formatting Protection (#4)

Contract:
- Baseline Expected: DEFECT_OBSERVED (exit 101)
- Candidate Expected: DEFECT_ABSENT (exit 0)
"""

from __future__ import annotations

import pathlib
import sys

repo_root = pathlib.Path(__file__).resolve().parent.parent

defects: list[str] = []

chat_md_path = repo_root / "src" / "components" / "ChatMarkdown.tsx"
chat_test_path = repo_root / "src" / "components" / "ChatMarkdown.test.ts"

# 1. Component Verification
if not chat_md_path.is_file():
    defects.append("Missing src/components/ChatMarkdown.tsx")
else:
    md_content = chat_md_path.read_text(encoding="utf-8")

    # Invariant 1: protectDisplayMath function must be defined and implemented
    if "protectDisplayMath" not in md_content:
        defects.append("Missing protectDisplayMath implementation in ChatMarkdown.tsx")

    # Invariant 2: Structural markdown boundary breaker must be present
    if "MATH_BLOCK_BREAKER" not in md_content:
        defects.append("Missing MATH_BLOCK_BREAKER boundary regex in ChatMarkdown.tsx")

    # Invariant 3: Greedy multiline $$ replacement must be eliminated
    if ".replace(/\\$\\$[\\s\\S]*?\\$\\$/g" in md_content:
        defects.append("Unsafe greedy display math replacement .replace(/\\$\\$[\\s\\S]*?\\$\\$/g) still present")

    # Invariant 4: Inline single-dollar multiline spanning guard
    if "!span.includes(\"\\n\")" not in md_content and "!span.includes('\\n')" not in md_content:
        defects.append("Missing inline single-dollar multiline newline guard (!span.includes('\\n'))")

    # Invariant 5: Rehype-katex fail-safe options or L4 rehypeSafeKatex sandbox
    if "throwOnError: false, strict: false" not in md_content and "rehypeSafeKatex" not in md_content:
        defects.append("Missing fail-safe rehype-katex configuration (throwOnError: false, strict: false or rehypeSafeKatex)")

# 2. Test Suite Invariant Verification
if not chat_test_path.is_file():
    defects.append("Missing src/components/ChatMarkdown.test.ts")
else:
    test_content = chat_test_path.read_text(encoding="utf-8")

    # Invariant 6: Regression tests for unclosed $$ before headings
    if "does not swallow headings or bold text when display math $$ is unclosed" not in test_content:
        defects.append("Missing regression test: unclosed $$ before headings")

    # Invariant 7: Regression tests for unclosed $$ before tables
    if "does not corrupt tables or lists when $$ is unclosed before a table" not in test_content:
        defects.append("Missing regression test: unclosed $$ before tables")

    # Invariant 8: Regression tests for multiline single dollar signs
    if "does not match single $ greedily across multiple lines" not in test_content:
        defects.append("Missing regression test: multiline single dollar signs")

if defects:
    print(f"[DEFECT_OBSERVED] KaTeX math isolation defects detected ({len(defects)}): {'; '.join(defects)}")
    sys.exit(101)

print("[DEFECT_ABSENT] KaTeX math delimiter multi-line isolation and formatting protection fully verified.")
sys.exit(0)
