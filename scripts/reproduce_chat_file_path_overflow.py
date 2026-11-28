#!/usr/bin/env python3
"""
AER Acceptance Verification: Chat Bubble and Attachment Chip Overflow Protection

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
attach_path = repo_root / "src" / "components" / "AttachmentPreview.tsx"
theme_css_path = repo_root / "src" / "assets" / "custom-theme.css"
test_path = repo_root / "src" / "components" / "ChatMarkdown.test.ts"

# 1. ChatMarkdown link & path wrapping constraints
if not chat_md_path.is_file():
    defects.append("Missing src/components/ChatMarkdown.tsx")
else:
    content = chat_md_path.read_text(encoding="utf-8")
    if "[overflow-wrap:anywhere]" not in content:
        defects.append("ChatMarkdown missing overflow-wrap:anywhere on file links")
    if "break-all" not in content:
        defects.append("ChatMarkdown missing break-all on file links")

# 2. AttachmentPreview chip constraint & caller override compatibility
if not attach_path.is_file():
    defects.append("Missing src/components/AttachmentPreview.tsx")
else:
    content = attach_path.read_text(encoding="utf-8")
    if "max-w-[min(280px,100%)]" not in content:
        defects.append("AttachmentPreview missing max-w-[min(280px,100%)] responsive constraint")
    if "sm:max-w-[280px]" in content:
        defects.append("AttachmentPreview contains sm:max-w-[280px] which collides with caller max-w-none")

# 3. Custom theme wrapping rules
if not theme_css_path.is_file():
    defects.append("Missing src/assets/custom-theme.css")
else:
    content = theme_css_path.read_text(encoding="utf-8")
    if "overflow-wrap: anywhere;" not in content:
        defects.append("custom-theme.css missing overflow-wrap: anywhere rule for chat-md")

# 4. ChatMarkdown test suite coverage
if not test_path.is_file():
    defects.append("Missing src/components/ChatMarkdown.test.ts")
else:
    content = test_path.read_text(encoding="utf-8")
    if "constrains long file paths to max-w-full and applies break-all to prevent bubble overflow" not in content:
        defects.append("ChatMarkdown.test.ts missing long file path bubble overflow test case")

if defects:
    print(f"DEFECT_OBSERVED: Chat bubble/chip overflow defects detected ({len(defects)}): {'; '.join(defects)}", file=sys.stderr, flush=True)
    sys.exit(101)

print("DEFECT_ABSENT: Chat bubble and attachment chip overflow protection verified.", flush=True)
sys.exit(0)