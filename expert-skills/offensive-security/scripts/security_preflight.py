#!/usr/bin/env python3
"""Deterministic static security preflight for Mode A (internal-defense) and Mode B (external-antidetect)."""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import sys
from pathlib import Path

MODE_A_RULES = [
    ("P0", "CWE-798", "hardcoded_secret", re.compile(r"(?i)(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{30,}|-----BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY-----)")),
    ("P0", "CWE-78", "command_injection_sink", re.compile(r"\bsubprocess\.(?:run|Popen|call)\([^)]*shell\s*=\s*True")),
    ("P1", "CWE-95", "dynamic_code_eval", re.compile(r"\b(?:eval|exec)\s*\(")),
    ("P1", "CWE-208", "non_constant_time_sig", re.compile(r"(?i)(?:signature|hmac|digest)\s*(?:==|!=)\s*")),
    ("P1", "CWE-295", "tls_verify_disabled", re.compile(r"(?i)verify\s*=\s*False|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['\"]0['\"]")),
]

MODE_B_LINE_RULES = [
    ("P1", "FP-DOM", "main_world_navigator_patch", re.compile(r"Object\.defineProperty\(\s*navigator\b")),
    ("P1", "FP-SCOPE", "broad_domain_override", re.compile(r"accounts\.google\.com/\*")),
]

SCAN_EXTS = {".py", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".yaml", ".yml", ".env"}


def is_test_file(path: Path) -> bool:
    parts = {p.lower() for p in path.parts}
    if parts & {"tests", "test", "fixtures", "__tests__"}:
        return True
    name = path.name.lower()
    if name.startswith("test_") or name.endswith("_test.py") or ".test." in name or ".spec." in name:
        return True
    return False


def matches_exclude(path: Path, excludes: list[str]) -> bool:
    path_str = str(path).replace("\\", "/")
    for pat in excludes:
        pat_norm = pat.replace("\\", "/")
        if fnmatch.fnmatch(path_str, pat_norm) or fnmatch.fnmatch(path.name, pat_norm):
            return True
    return False


def scan_path(
    target: Path,
    mode: str,
    excludes: list[str] | None = None,
    exclude_tests: bool = False,
) -> tuple[int, dict]:
    valid_modes = {"internal-defense", "external-antidetect"}
    if mode not in valid_modes:
        return 2, {
            "status": "SPEC_INVALID",
            "error": f"invalid mode '{mode}', must be one of {sorted(valid_modes)}",
            "scanned_files": 0,
            "finding_count": 0,
            "findings": [],
        }

    if not target.exists():
        return 2, {"status": "SPEC_INVALID", "error": f"target does not exist: {target}"}

    exclude_list = excludes or []
    read_errors: list[str] = []

    if target.is_file():
        candidates = [target]
    else:
        def on_walk_error(err: OSError) -> None:
            read_errors.append(f"failed to access {getattr(err, 'filename', str(target))}: {type(err).__name__}: {err}")

        candidates = []
        for root, dirs, fnames in os.walk(target, onerror=on_walk_error):
            dirs[:] = [d for d in dirs if d not in {".git", "node_modules"}]
            for fname in sorted(fnames):
                p = Path(root) / fname
                if p.suffix.lower() in SCAN_EXTS:
                    candidates.append(p)

    files: list[Path] = []
    for f in candidates:
        if exclude_tests and is_test_file(f):
            continue
        if exclude_list and matches_exclude(f, exclude_list):
            continue
        files.append(f)

    if not files:
        if read_errors:
            return 2, {
                "status": "SPEC_INVALID",
                "error": "incomplete scan: one or more files failed strict UTF-8 read",
                "read_errors": read_errors,
                "scanned_files": 0,
                "failed_files": len(read_errors),
                "finding_count": 0,
                "findings": [],
            }
        return 2, {
            "status": "SPEC_INVALID",
            "error": f"empty scan: no scannable files found in target {target}",
            "scanned_files": 0,
            "finding_count": 0,
            "findings": [],
        }

    findings: list[dict] = []

    for fpath in files:
        try:
            raw_text = fpath.read_text(encoding="utf-8", errors="strict")
            lines = raw_text.splitlines()
        except (UnicodeDecodeError, OSError) as exc:
            read_errors.append(f"failed to read {fpath}: {type(exc).__name__}: {exc}")
            continue

        if mode == "internal-defense":
            for idx, line in enumerate(lines, start=1):
                for sev, code, rule_id, regex in MODE_A_RULES:
                    if regex.search(line):
                        if rule_id == "non_constant_time_sig":
                            if "compare_digest" in line or "timingSafeEqual" in line:
                                continue
                        findings.append({
                            "severity": sev,
                            "code": code,
                            "rule": rule_id,
                            "file": str(fpath),
                            "line": idx,
                        })
        else:
            # Mode B: external-antidetect
            # 1. Line-level standard rules
            for idx, line in enumerate(lines, start=1):
                for sev, code, rule_id, regex in MODE_B_LINE_RULES:
                    if regex.search(line):
                        findings.append({
                            "severity": sev,
                            "code": code,
                            "rule": rule_id,
                            "file": str(fpath),
                            "line": idx,
                        })

            # 2. MV3 extension origin leak (context-aware)
            has_dnr = bool(
                ("declarativeNetRequest" in raw_text or "modifyHeaders" in raw_text)
                and ("remove" in raw_text.lower() or "strip" in raw_text.lower())
            )
            explicit_leak_pat = re.compile(
                r"(?i)(?:origin\s*[:=]|access-control-allow-origin|header\s*[:=]\s*['\"]origin['\"]).*chrome-extension://"
            )

            for idx, line in enumerate(lines, start=1):
                if "chrome-extension://" in line:
                    if has_dnr:
                        if explicit_leak_pat.search(line):
                            findings.append({
                                "severity": "P0",
                                "code": "FP-EXT",
                                "rule": "mv3_extension_origin_leak",
                                "file": str(fpath),
                                "line": idx,
                            })
                    else:
                        findings.append({
                            "severity": "P0",
                            "code": "FP-EXT",
                            "rule": "mv3_extension_origin_leak",
                            "file": str(fpath),
                            "line": idx,
                        })

            # 3. Extension flag collision (file-level semantic check)
            has_disable_ext = bool(re.search(r"(?<![a-zA-Z0-9_-])--disable-extensions\b(?!-except)", raw_text))
            has_load_ext = bool(re.search(r"--load-extension\b|--disable-extensions-except\b", raw_text))

            if has_disable_ext and has_load_ext:
                for idx, line in enumerate(lines, start=1):
                    if re.search(r"--disable-extensions\b|--load-extension\b", line):
                        findings.append({
                            "severity": "P0",
                            "code": "FP-LAUNCH",
                            "rule": "extension_flag_collision",
                            "file": str(fpath),
                            "line": idx,
                        })

    if read_errors:
        failed_count = len(read_errors)
        scanned_count = max(0, len(files) - failed_count)
        return 2, {
            "status": "SPEC_INVALID",
            "error": "incomplete scan: one or more files failed strict UTF-8 read",
            "read_errors": read_errors,
            "scanned_files": scanned_count,
            "failed_files": failed_count,
            "finding_count": len(findings),
            "findings": findings[:50],
        }

    exit_code = 1 if findings else 0
    return exit_code, {
        "status": "REJECT_FINDINGS" if findings else "CLEAN",
        "mode": mode,
        "scanned_files": len(files),
        "finding_count": len(findings),
        "findings": findings[:50],
    }


def main() -> None:
    p = argparse.ArgumentParser(description="Dual-Mode Security Preflight Scanner")
    p.add_argument("--target", required=True, type=Path)
    p.add_argument("--mode", choices=("internal-defense", "external-antidetect"), required=True)
    p.add_argument("--exclude", action="append", default=[])
    p.add_argument("--exclude-tests", action="store_true", default=False)
    args = p.parse_args()

    code, report = scan_path(
        args.target,
        args.mode,
        excludes=args.exclude,
        exclude_tests=args.exclude_tests,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(code)


if __name__ == "__main__":
    main()
