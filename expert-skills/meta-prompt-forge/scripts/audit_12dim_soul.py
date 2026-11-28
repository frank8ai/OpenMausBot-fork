#!/usr/bin/env python3
"""Deterministic static gate for L0-L6 SOUL.md and OpenMausBot SKILL.md."""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import sys
from pathlib import Path

DYNAMIC_HEAD_PATTERNS = [
    r"\{\{\s*(now|current_time|timestamp|date|session_id)\s*\}\}",
    r"(?i)current\s+time\s*:",
]

REQUIRED_META_FIELDS = (
    "author_model",
    "candidate_sha256",
    "issued_at",
    "issuer",
    "reviewer_model",
    "run_id",
)


EXPERT_SKILLS_6 = (
    "dag-gc",
    "docs-diataxis-release",
    "meta-prompt-forge",
    "offensive-security",
    "opc-legal-finance",
    "unit-economics",
)


def read_normalized_bytes(p: Path) -> bytes:
    """Read file bytes with cross-platform newline normalization (CRLF/CR -> LF).
    Ensures bitwise-identical SHA-256 digests across Windows (CRLF) and Linux/macOS (LF) checkouts.
    """
    raw = p.read_bytes()
    return raw.replace(bytes([13, 10]), bytes([10])).replace(bytes([13]), bytes([10]))


def resolve_canonical_skill_entries(
    base_dir: Path,
    skill_names: tuple[str, ...] | list[str] = EXPERT_SKILLS_6,
) -> tuple[int, dict]:
    """Deterministic resolution and validation of canonical expert skills and their SKILL.md files.
    Validates directory existence, SKILL.md existence, UTF-8 readability, and non-emptiness.
    Returns:
        (0, {"status": "PASS", "entries": [Path, ...], "count": 6})
        (2, {"status": "SPEC_INVALID", "errors": [...]})
    """
    if not base_dir.exists() or not base_dir.is_dir():
        return 2, {"status": "SPEC_INVALID", "errors": [f"base skills directory not found: {base_dir}"]}

    errors: list[str] = []
    entries: list[Path] = []
    for s_name in sorted(skill_names, key=lambda s: s.lower()):
        s_dir = base_dir / s_name
        if not s_dir.exists() or not s_dir.is_dir():
            errors.append(f"missing required expert skill directory: {s_name}")
            continue
        s_file = s_dir / "SKILL.md"
        if not s_file.exists() or not s_file.is_file():
            errors.append(f"missing SKILL.md in expert skill: {s_name}")
            continue
        try:
            raw = s_file.read_text(encoding="utf-8")
        except Exception as exc:
            errors.append(f"failed to read {s_name}/SKILL.md: {exc}")
            continue
        if not raw.strip():
            errors.append(f"{s_name}/SKILL.md is empty or contains only whitespace")
            continue
        entries.append(s_file)

    if errors:
        return 2, {"status": "SPEC_INVALID", "errors": errors}
    return 0, {"status": "PASS", "entries": entries, "count": len(entries)}


def compute_skills_composite_digest(base_dir: Path, skill_names: tuple[str, ...] | list[str] = EXPERT_SKILLS_6) -> str:
    """Compute deterministic composite SHA-256 digest covering all 6 expert skill artifacts.
    Enforces cross-platform sorting consistency by explicitly sorting via normalized lowercase POSIX relative paths.
    """
    code, report = resolve_canonical_skill_entries(base_dir, skill_names)
    if code != 0:
        first_err = report.get("errors", ["skill specification invalid"])[0]
        if "not found" in first_err or "missing" in first_err:
            raise FileNotFoundError(first_err)
        raise ValueError(first_err)

    h = hashlib.sha256()
    for s_name in sorted(skill_names, key=lambda s: s.lower()):
        s_dir = base_dir / s_name
        skill_files: list[Path] = []
        for p in s_dir.rglob("*"):
            if not p.is_file():
                continue
            rel_parts = p.relative_to(base_dir).parts
            if any(part.startswith(".") or part in ("__pycache__", "evidence", "node_modules", ".pytest_cache") for part in rel_parts):
                continue
            skill_files.append(p)
        skill_files.sort(key=lambda p: (p.relative_to(base_dir).as_posix().lower(), p.relative_to(base_dir).as_posix()))
        for f in skill_files:
            rel = f.relative_to(base_dir).as_posix()
            file_hash = hashlib.sha256(read_normalized_bytes(f)).hexdigest()
            h.update(f"{file_hash}  {rel}\n".encode("utf-8"))
    return h.hexdigest()


def _is_canonical_skills_root(path: Path) -> bool:
    """Return True if path is a canonical skills root directory."""
    if not path.is_dir():
        return False
    if path.name == "expert-skills":
        return True
    return all((path / s).is_dir() for s in EXPERT_SKILLS_6)


def _is_covered_by_composite(target: Path, canonical_root: Path) -> bool:
    """Strictly verify if target is canonical_root itself, or its relative first-level
    subpath belongs to EXPERT_SKILLS_6 and does not contain any hidden or excluded directory parts.
    """
    try:
        rel = target.resolve().relative_to(canonical_root.resolve())
    except ValueError:
        try:
            rel = target.relative_to(canonical_root)
        except ValueError:
            return False

    parts = rel.parts
    if not parts:
        return True
    if parts[0] not in EXPERT_SKILLS_6:
        return False
    excluded_names = {"__pycache__", "evidence", "node_modules", ".pytest_cache"}
    if any(p.startswith(".") or p in excluded_names for p in parts):
        return False
    return True


def compute_candidate_digest(target: Path) -> str:
    """Compute deterministic SHA-256 digest of target file or directory."""
    if not target.exists():
        raise FileNotFoundError(f"target not found: {target}")
    if target.is_file():
        return hashlib.sha256(read_normalized_bytes(target)).hexdigest()
    elif target.is_dir():
        if _is_canonical_skills_root(target):
            return compute_skills_composite_digest(target)
        h = hashlib.sha256()
        files: list[Path] = []
        for p in target.rglob("*"):
            if not p.is_file():
                continue
            rel_parts = p.relative_to(target).parts
            if any(part.startswith(".") or part in ("__pycache__", "evidence", "node_modules", ".pytest_cache") for part in rel_parts):
                continue
            files.append(p)
        files.sort(key=lambda p: (p.relative_to(target).as_posix().lower(), p.relative_to(target).as_posix()))
        for f in files:
            rel = f.relative_to(target).as_posix()
            file_hash = hashlib.sha256(read_normalized_bytes(f)).hexdigest()
            h.update(f"{file_hash}  {rel}\n".encode("utf-8"))
        return h.hexdigest()
    else:
        raise ValueError(f"unsupported target type: {target}")


def _normalize_meta_payload(payload: dict) -> dict:
    p = dict(payload)
    if "candidate_sha256" not in p and "candidate_digest" in p:
        p["candidate_sha256"] = p["candidate_digest"]
    return p


def sign_orchestrator_meta(payload: dict, secret: str) -> str:
    p = _normalize_meta_payload(payload)
    subset = {k: str(p[k]) for k in sorted(REQUIRED_META_FIELDS) if k in p}
    canonical = json.dumps(subset, sort_keys=True, separators=(",", ":"))
    return hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()


def normalize_family(family: str) -> str:
    f = family.strip().lower()
    if any(k in f for k in ("gemini", "google")):
        return "gemini"
    if any(k in f for k in ("gpt", "openai", "codex", "o1", "o3", "o4")):
        return "openai"
    if any(k in f for k in ("claude", "anthropic")):
        return "anthropic"
    if any(k in f for k in ("grok", "xai")):
        return "xai"
    return f or "unknown"


def audit_file(
    target: Path,
    kind: str,
    author_family: str | None = None,
    reviewer_family: str | None = None,
    orchestrator_meta: Path | None = None,
    allow_self_check: bool = False,
    hmac_key: str | None = None,
) -> tuple[int, dict]:
    if not target.exists():
        return 2, {"status": "SPEC_INVALID", "errors": [f"file not found: {target}"]}

    af_raw = author_family or ""
    rf_raw = reviewer_family or ""
    meta_parsed: dict | None = None
    warnings: list[str] = []

    try:
        actual_digest = compute_candidate_digest(target)
    except Exception as exc:
        return 2, {"status": "SPEC_INVALID", "errors": [f"failed to compute candidate digest: {exc}"]}

    if orchestrator_meta:
        if not orchestrator_meta.exists():
            return 2, {"status": "SPEC_INVALID", "errors": [f"orchestrator-meta not found: {orchestrator_meta}"]}
        try:
            raw_meta = json.loads(orchestrator_meta.read_text(encoding="utf-8"))
            if not isinstance(raw_meta, dict):
                return 2, {"status": "SPEC_INVALID", "errors": ["orchestrator-meta must be a JSON object"]}
            meta_parsed = _normalize_meta_payload(raw_meta)
            af_raw = str(meta_parsed.get("author_model") or meta_parsed.get("author_family") or "").strip()
            rf_raw = str(meta_parsed.get("reviewer_model") or meta_parsed.get("reviewer_family") or "").strip()
        except Exception as e:
            return 2, {"status": "SPEC_INVALID", "errors": [f"failed to parse orchestrator-meta JSON: {e}"]}

    # 同族硬拦截 EXIT 30 优先级最高：只要解析出 author 与 reviewer 模型/家族，
    # 无论生产模式还是 --allow-self-check，同族一律先返回 EXIT 30 (BLOCKED_SAME_FAMILY)，严禁被溯源错误掩盖。
    if af_raw and rf_raw:
        af = normalize_family(af_raw)
        rf = normalize_family(rf_raw)
        if af == "unknown" or rf == "unknown" or af == rf:
            effective_key = hmac_key or os.environ.get("OPENMAUSBOT_ORCHESTRATOR_HMAC_KEY")
            is_verified = False
            if meta_parsed and effective_key:
                has_req = all(isinstance(meta_parsed.get(k), str) and meta_parsed.get(k).strip() != "" for k in REQUIRED_META_FIELDS)
                sig = str(meta_parsed.get("signature") or "")
                if has_req and sig:
                    expected = sign_orchestrator_meta(meta_parsed, effective_key)
                    if hmac.compare_digest(sig, expected):
                        meta_digest = str(meta_parsed.get("candidate_sha256") or "").strip().lower()
                        if hmac.compare_digest(actual_digest.lower(), meta_digest):
                            is_verified = True

            prov = "ORCHESTRATOR_VERIFIED" if is_verified else ("ORCHESTRATOR_DECLARED" if meta_parsed else "SELF_DECLARED")
            return 30, {
                "status": "BLOCKED_SAME_FAMILY",
                "provenance": prov,
                "author_family": af,
                "reviewer_family": rf,
                "candidate_sha256": actual_digest,
                "reason": "Cross-family heterogeneous review required (e.g., gemini <-> openai/anthropic)",
            }
    else:
        af = ""
        rf = ""

    # 门禁与验签判定
    if allow_self_check:
        if not af_raw or not rf_raw:
            return 2, {"status": "SPEC_INVALID", "errors": ["missing author/reviewer family or orchestrator-meta"]}
        provenance = "LOCAL_SELF_CHECK_ONLY"
        production_gate_eligible = False
        warnings.append("local self-check mode enabled; ineligible for production gate")
    else:
        # 生产模式 (allow_self_check=False)
        if not orchestrator_meta or meta_parsed is None:
            return 2, {
                "status": "PROVENANCE_UNVERIFIED",
                "provenance": "SELF_DECLARED_REJECTED",
                "production_gate_eligible": False,
                "candidate_sha256": actual_digest,
                "errors": ["production gate requires signed orchestrator-meta (--orchestrator-meta)"],
            }

        effective_key = hmac_key or os.environ.get("OPENMAUSBOT_ORCHESTRATOR_HMAC_KEY")
        has_req = all(isinstance(meta_parsed.get(k), str) and meta_parsed.get(k).strip() != "" for k in REQUIRED_META_FIELDS)
        sig = str(meta_parsed.get("signature") or "")

        sig_valid = False
        if effective_key and has_req and sig:
            expected = sign_orchestrator_meta(meta_parsed, effective_key)
            if hmac.compare_digest(sig, expected):
                sig_valid = True

        if not sig_valid:
            return 2, {
                "status": "PROVENANCE_UNVERIFIED",
                "provenance": "UNVERIFIED_META_REJECTED",
                "production_gate_eligible": False,
                "candidate_sha256": actual_digest,
                "errors": ["orchestrator-meta verification failed: missing required fields, key, or invalid signature"],
            }

        # Validate issued_at TTL (max age 30 days, rejects expired timestamps)
        issued_at_str = str(meta_parsed.get("issued_at") or "").strip()
        try:
            from datetime import datetime, timezone
            issued_dt = datetime.fromisoformat(issued_at_str.replace("Z", "+00:00"))
            if issued_dt.tzinfo is None:
                issued_dt = issued_dt.replace(tzinfo=timezone.utc)
            now_dt = datetime.now(timezone.utc)
            age_sec = (now_dt - issued_dt).total_seconds()
            if age_sec > 30 * 86400 or age_sec < -3600:
                return 2, {
                    "status": "PROVENANCE_UNVERIFIED",
                    "provenance": "UNVERIFIED_META_REJECTED",
                    "production_gate_eligible": False,
                    "candidate_sha256": actual_digest,
                    "errors": [f"orchestrator-meta issued_at expired or out of TTL: {issued_at_str}"],
                }
        except Exception as exc:
            return 2, {
                "status": "PROVENANCE_UNVERIFIED",
                "provenance": "UNVERIFIED_META_REJECTED",
                "production_gate_eligible": False,
                "candidate_sha256": actual_digest,
                "errors": [f"invalid issued_at format: {issued_at_str} ({exc})"],
            }

        # Validate run_id format
        run_id_val = str(meta_parsed.get("run_id") or "").strip()
        if not run_id_val or not re.match(r"^[\w.-]+$", run_id_val):
            return 2, {
                "status": "PROVENANCE_UNVERIFIED",
                "provenance": "UNVERIFIED_META_REJECTED",
                "production_gate_eligible": False,
                "candidate_sha256": actual_digest,
                "errors": [f"invalid run_id in orchestrator-meta: '{run_id_val}'"],
            }

        # 校验传入候选文件/目录的实际 sha256 摘要与 meta 中的 digest 是否严格匹配
        meta_digest = str(meta_parsed.get("candidate_sha256") or "").strip().lower()
        composite_digest = None
        for parent in [target] + list(target.parents):
            if parent.is_dir() and _is_canonical_skills_root(parent):
                if _is_covered_by_composite(target, parent):
                    try:
                        composite_digest = compute_skills_composite_digest(parent).lower()
                    except Exception:
                        composite_digest = None
                break

        matches_digest = hmac.compare_digest(actual_digest.lower(), meta_digest) or (
            composite_digest is not None and hmac.compare_digest(composite_digest, meta_digest)
        )

        if not matches_digest:
            return 2, {
                "status": "PROVENANCE_UNVERIFIED",
                "provenance": "DIGEST_MISMATCH",
                "production_gate_eligible": False,
                "candidate_sha256": actual_digest,
                "expected_sha256": meta_digest,
                "errors": [f"candidate digest mismatch: expected {meta_digest}, got {actual_digest}"],
            }

        provenance = "ORCHESTRATOR_VERIFIED"
        production_gate_eligible = True

    if not af:
        af = normalize_family(af_raw)
    if not rf:
        rf = normalize_family(rf_raw)

    allowed = {
        "SOUL", "SKILL", "SCHEMA", "STRICT", "OPENAI", "GEMINI", "CLAUDE", "PROMPT", "OWASP",
        "CACHE", "SEMVER", "CHANGELOG", "ADDED", "CHANGED", "FIXED", "BLOCKED", "LOCKED",
        "READY", "RUNNING", "SETTLED", "BLACK", "GREEN", "YELLOW", "TRUST", "UNTRUSTED",
        "PASS", "FAIL", "EXIT", "SPEC_INVALID", "BLOCKED_SAME_FAMILY", "FREEZE_TWO_STRIKE",
        "PROVENANCE_UNVERIFIED", "RECONCILIATION_ALERT", "BREAKING_SEMVER_VIOLATION",
    }

    if target.is_dir():
        if kind == "skill":
            if _is_canonical_skills_root(target):
                code, report = resolve_canonical_skill_entries(target)
                if code != 0:
                    return code, report
                candidates = report["entries"]
            else:
                candidates = [p for p in target.rglob("SKILL.md") if p.is_file()]
                if not candidates:
                    return 2, {"status": "SPEC_INVALID", "errors": [f"no SKILL.md files found in {target}"]}
                candidates.sort(key=lambda p: (p.relative_to(target).as_posix().lower(), p.relative_to(target).as_posix()))
        else:
            candidates = [p for p in target.rglob("SOUL.md") if p.is_file()]
            if not candidates:
                return 2, {"status": "SPEC_INVALID", "errors": [f"no {kind.upper()}.md files found in {target}"]}
            candidates.sort(key=lambda p: (p.relative_to(target).as_posix().lower(), p.relative_to(target).as_posix()))
        files_to_audit = candidates
    else:
        files_to_audit = [target]

    total_lines = 0
    total_bytes = 0
    errors: list[str] = []

    for f_target in files_to_audit:
        try:
            raw = f_target.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
        except Exception as exc:
            return 2, {"status": "SPEC_INVALID", "errors": [f"failed to read {f_target}: {exc}"]}
        if not raw.strip():
            return 2, {"status": "SPEC_INVALID", "errors": [f"{f_target.parent.name}/{f_target.name} is empty or contains only whitespace"]}
        lines = raw.splitlines()
        byte_len = len(raw.encode("utf-8"))
        total_lines += len(lines)
        total_bytes += byte_len

        head_chunk = "\n".join(lines[:30])
        for pat in DYNAMIC_HEAD_PATTERNS:
            if re.search(pat, head_chunk):
                errors.append(f"{f_target.name} KV-Cache hazard: dynamic pattern '{pat}' found in top 30 lines")

        caps_words = re.findall(r"\b[A-Z]{5,}\b", raw)
        noisy_caps = [w for w in caps_words if w not in allowed]
        if len(noisy_caps) > 15:
            warnings.append(f"{f_target.name}: high ALL-CAPS shout density ({len(noisy_caps)} tokens)")

        if kind == "skill":
            if len(lines) > 120:
                errors.append(f"{f_target.parent.name}/{f_target.name} line budget exceeded: {len(lines)} > 120")
            if not raw.startswith("---\n"):
                errors.append(f"{f_target.parent.name}/{f_target.name} missing YAML frontmatter opening '---'")
            else:
                fm_end = raw.find("\n---", 4)
                if fm_end == -1:
                    errors.append(f"{f_target.parent.name}/{f_target.name} unclosed YAML frontmatter")
                else:
                    fm = raw[4:fm_end]
                    if not re.search(r"(?m)^name:\s*\S+", fm):
                        errors.append(f"{f_target.parent.name}/{f_target.name} frontmatter missing 'name'")
                    if not re.search(r"(?m)^description:\s*\S+", fm):
                        errors.append(f"{f_target.parent.name}/{f_target.name} frontmatter missing 'description'")
            if "DO NOT" not in raw and "Excluded When" not in raw and "排除边界" not in raw:
                errors.append(f"{f_target.parent.name}/{f_target.name} missing exclusion boundary ('Excluded When' / 'DO NOT')")
            if "Verification" not in raw and "验收" not in raw:
                errors.append(f"{f_target.parent.name}/{f_target.name} missing Verification section")
        else:
            if byte_len > 24000:
                errors.append(f"{f_target.parent.name}/{f_target.name} byte budget exceeded: {byte_len} > 24000")
            for marker in ("L0", "L1", "L2", "L3", "L4", "L5", "L6"):
                if marker not in raw:
                    errors.append(f"{f_target.parent.name}/{f_target.name} missing layer marker {marker}")
            if "non_scope_never" not in raw and "DO NOT" not in raw:
                errors.append(f"{f_target.parent.name}/{f_target.name} missing negative boundary (non_scope_never / DO NOT)")

    status = "PASS" if not errors else "SPEC_INVALID"
    return (0 if not errors else 2), {
        "status": status,
        "kind": kind,
        "provenance": provenance,
        "production_gate_eligible": production_gate_eligible,
        "candidate_sha256": actual_digest,
        "lines": total_lines if target.is_dir() else len(lines),
        "bytes": total_bytes if target.is_dir() else byte_len,
        "author_family": af,
        "reviewer_family": rf,
        "errors": errors,
        "warnings": warnings,
    }


def main() -> None:
    p = argparse.ArgumentParser(description="12-Dim Static & Cross-Family Gate")
    p.add_argument("--target", required=True, type=Path)
    p.add_argument("--kind", choices=("soul", "skill"), required=True)
    p.add_argument("--author-family", default=None)
    p.add_argument("--reviewer-family", default=None)
    p.add_argument("--orchestrator-meta", type=Path, default=None)
    p.add_argument("--allow-self-check", action="store_true", default=False)
    args = p.parse_args()

    # CLI strictly disallows caller-supplied --hmac-key argument;
    # Must and only resolve from OPENMAUSBOT_ORCHESTRATOR_HMAC_KEY env var
    env_key = os.environ.get("OPENMAUSBOT_ORCHESTRATOR_HMAC_KEY")

    code, report = audit_file(
        args.target,
        args.kind,
        author_family=args.author_family,
        reviewer_family=args.reviewer_family,
        orchestrator_meta=args.orchestrator_meta,
        allow_self_check=args.allow_self_check,
        hmac_key=env_key,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(code)


if __name__ == "__main__":
    main()
