#!/usr/bin/env python3
"""OpenAPI Breaking-Change, SemVer 2.0, and Keep-a-Changelog release gate."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

KEEP_A_CHANGELOG_SECTIONS = {"Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"}


class SpecInvalidError(ValueError):
    """Raised when an OpenAPI specification contains unresolvable/cyclic $ref or invalid structure."""


def resolve_local_ref(obj: object, root_spec: dict, max_depth: int = 16) -> dict:
    if obj is None:
        return {}
    if not isinstance(obj, dict):
        raise SpecInvalidError(f"expected object, got {type(obj).__name__}")
    cur = obj
    seen: set[str] = set()
    while "$ref" in cur:
        ref = cur["$ref"]
        if not isinstance(ref, str) or not ref.startswith("#/") or len(ref) <= 2:
            raise SpecInvalidError(f"unsupported or malformed $ref: {ref!r}")
        if ref in seen or len(seen) >= max_depth:
            raise SpecInvalidError(f"cyclic or overly deep $ref: {ref}")
        seen.add(ref)
        node: object = root_spec
        for raw_seg in ref[2:].split("/"):
            seg = raw_seg.replace("~1", "/").replace("~0", "~")
            if not isinstance(node, dict) or seg not in node:
                raise SpecInvalidError(f"unresolvable $ref: {ref}")
            node = node[seg]
        if not isinstance(node, dict):
            raise SpecInvalidError(f"$ref target is not an object: {ref}")
        cur = node
    return cur


def compare_schemas(
    b_schema: dict,
    t_schema: dict,
    context_label: str,
    base_spec: dict | None = None,
    target_spec: dict | None = None,
) -> list[str]:
    if not isinstance(b_schema, dict):
        raise SpecInvalidError(f"schema for {context_label} (base) must be an object, got {type(b_schema).__name__}")
    if not isinstance(t_schema, dict):
        raise SpecInvalidError(f"schema for {context_label} (target) must be an object, got {type(t_schema).__name__}")

    if base_spec is not None and "$ref" in b_schema:
        b_schema = resolve_local_ref(b_schema, base_spec)
    if target_spec is not None and "$ref" in t_schema:
        t_schema = resolve_local_ref(t_schema, target_spec)

    if not isinstance(b_schema, dict) or not isinstance(t_schema, dict):
        raise SpecInvalidError(f"resolved schema for {context_label} must be an object")

    breaking: list[str] = []
    b_props = b_schema.get("properties") or {}
    t_props = t_schema.get("properties") or {}

    # 1. Removed properties
    for prop in sorted(set(b_props) - set(t_props)):
        breaking.append(f"[BREAKING] removed property '{prop}' from {context_label}")

    # 2. Newly required properties
    b_req = set(b_schema.get("required") or [])
    t_req = set(t_schema.get("required") or [])
    for prop in sorted(t_req - b_req):
        breaking.append(f"[BREAKING] newly required property '{prop}' in {context_label}")

    # 3. Property type changes & enum narrowing
    for prop in sorted(set(b_props) & set(t_props)):
        bp = b_props[prop] if isinstance(b_props[prop], dict) else {}
        tp = t_props[prop] if isinstance(t_props[prop], dict) else {}
        if base_spec is not None and "$ref" in bp:
            bp = resolve_local_ref(bp, base_spec)
        if target_spec is not None and "$ref" in tp:
            tp = resolve_local_ref(tp, target_spec)
        b_type = bp.get("type")
        t_type = tp.get("type")
        if b_type and t_type and b_type != t_type:
            breaking.append(f"[BREAKING] property '{prop}' in {context_label} changed type from '{b_type}' to '{t_type}'")

        if "enum" not in bp and "enum" in tp:
            breaking.append(f"[BREAKING] constrained unconstrained property '{prop}' in {context_label} to enum {tp['enum']}")
        elif "enum" in bp and "enum" in tp:
            removed_enums = set(bp["enum"]) - set(tp["enum"])
            if removed_enums:
                breaking.append(f"[BREAKING] narrowed enum on property '{prop}' in {context_label}: removed {sorted(removed_enums)}")

    # Schema-level enum narrowing
    if "enum" not in b_schema and "enum" in t_schema:
        breaking.append(f"[BREAKING] constrained unconstrained {context_label} to enum {t_schema['enum']}")
    elif "enum" in b_schema and "enum" in t_schema:
        removed_top_enums = set(b_schema["enum"]) - set(t_schema["enum"])
        if removed_top_enums:
            breaking.append(f"[BREAKING] narrowed enum on {context_label}: removed {sorted(removed_top_enums)}")

    return breaking


def detect_breaking_changes(base_spec: dict, target_spec: dict) -> list[str]:
    breaking: list[str] = []
    base_paths = base_spec.get("paths", {})
    target_paths = target_spec.get("paths", {})

    for path in sorted(set(base_paths) - set(target_paths)):
        breaking.append(f"[BREAKING] removed path: {path}")

    for path in sorted(set(base_paths) & set(target_paths)):
        b_methods = base_paths[path]
        t_methods = target_paths[path]
        for method in sorted(set(b_methods) - set(t_methods)):
            breaking.append(f"[BREAKING] removed method {method.upper()} on {path}")

        for method in sorted(set(b_methods) & set(t_methods)):
            b_op = b_methods[method] if isinstance(b_methods[method], dict) else {}
            t_op = t_methods[method] if isinstance(t_methods[method], dict) else {}

            if "parameters" in b_op and b_op["parameters"] is not None:
                if not isinstance(b_op["parameters"], list):
                    raise SpecInvalidError(f"parameters on {method.upper()} {path} must be a list")
                b_params_raw = b_op["parameters"]
            elif "parameters" in b_op and b_op["parameters"] is None:
                raise SpecInvalidError(f"parameters on {method.upper()} {path} cannot be null")
            else:
                b_params_raw = []

            if "parameters" in t_op and t_op["parameters"] is not None:
                if not isinstance(t_op["parameters"], list):
                    raise SpecInvalidError(f"parameters on {method.upper()} {path} must be a list")
                t_params_raw = t_op["parameters"]
            elif "parameters" in t_op and t_op["parameters"] is None:
                raise SpecInvalidError(f"parameters on {method.upper()} {path} cannot be null")
            else:
                t_params_raw = []
            b_params = [
                resolve_local_ref(p, base_spec) if (isinstance(p, dict) and "$ref" in p) else p
                for p in b_params_raw
            ]
            t_params = [
                resolve_local_ref(p, target_spec) if (isinstance(p, dict) and "$ref" in p) else p
                for p in t_params_raw
            ]

            b_req_params = {
                (p.get("name"), p.get("in"))
                for p in b_params
                if isinstance(p, dict) and p.get("required")
            }
            t_req_params = {
                (p.get("name"), p.get("in"))
                for p in t_params
                if isinstance(p, dict) and p.get("required")
            }
            for name, loc in sorted(t_req_params - b_req_params):
                breaking.append(f"[BREAKING] newly required parameter '{name}' ({loc}) on {method.upper()} {path}")

            b_resps = set((b_op.get("responses") or {}).keys())
            t_resps = set((t_op.get("responses") or {}).keys())
            for status_code in sorted(b_resps - t_resps):
                if str(status_code).startswith("2"):
                    breaking.append(f"[BREAKING] removed success response {status_code} on {method.upper()} {path}")

            # RequestBody breaking changes
            b_rb = resolve_local_ref(b_op.get("requestBody"), base_spec)
            t_rb = resolve_local_ref(t_op.get("requestBody"), target_spec)

            b_rb_req = bool(b_rb.get("required", False))
            t_rb_req = bool(t_rb.get("required", False))
            if not b_rb_req and t_rb_req:
                breaking.append(f"[BREAKING] requestBody became required on {method.upper()} {path}")

            b_content_raw = b_rb.get("content")
            if b_content_raw is not None and not isinstance(b_content_raw, dict):
                raise SpecInvalidError("requestBody content must be an object")
            b_content = b_content_raw or {}

            t_content_raw = t_rb.get("content")
            if t_content_raw is not None and not isinstance(t_content_raw, dict):
                raise SpecInvalidError("requestBody content must be an object")
            t_content = t_content_raw or {}

            for media in sorted(set(b_content) - set(t_content)):
                breaking.append(f"[BREAKING] removed requestBody content-type '{media}' on {method.upper()} {path}")
            for media in sorted(set(b_content) & set(t_content)):
                b_media_obj = b_content[media]
                t_media_obj = t_content[media]
                if not isinstance(b_media_obj, dict) or not isinstance(t_media_obj, dict):
                    raise SpecInvalidError(f"media type definition for '{media}' must be an object")
                b_s = b_media_obj.get("schema") or {}
                t_s = t_media_obj.get("schema") or {}
                breaking.extend(compare_schemas(b_s, t_s, f"requestBody ({media}) on {method.upper()} {path}", base_spec=base_spec, target_spec=target_spec))

    # Check top-level component schemas
    b_schemas = (base_spec.get("components") or {}).get("schemas") or {}
    t_schemas = (target_spec.get("components") or {}).get("schemas") or {}
    for sname in sorted(set(b_schemas) - set(t_schemas)):
        breaking.append(f"[BREAKING] removed schema: {sname}")
    for sname in sorted(set(b_schemas) & set(t_schemas)):
        breaking.extend(compare_schemas(b_schemas[sname], t_schemas[sname], f"schema {sname}", base_spec=base_spec, target_spec=target_spec))

    return breaking


def validate_changelog(changelog_path: Path, has_breaking: bool) -> list[str]:
    if not changelog_path.exists():
        return [f"missing changelog file: {changelog_path}"]
    text = changelog_path.read_text(encoding="utf-8")
    errs: list[str] = []
    parts = re.split(r"(?m)^##\s+\[", text)
    if len(parts) < 2:
        return ["CHANGELOG.md missing version header '## [x.y.z]'"]

    latest_block = parts[1]
    found_sections = set(re.findall(r"(?m)^###\s+(Added|Changed|Deprecated|Removed|Fixed|Security)\b", latest_block))
    if not found_sections:
        errs.append("CHANGELOG.md missing Keep-a-Changelog sections (Added/Changed/Deprecated/Removed/Fixed/Security)")
    if has_breaking and "BREAKING CHANGES" not in latest_block:
        errs.append("breaking changes detected but latest CHANGELOG.md section lacks 'BREAKING CHANGES' migration note")

    return errs


def evaluate_release(
    base_spec: dict,
    target_spec: dict,
    bump: str,
    changelog_path: Path | None = None,
) -> tuple[int, dict]:
    try:
        breaking = detect_breaking_changes(base_spec, target_spec)
    except SpecInvalidError as exc:
        return 2, {
            "status": "SPEC_INVALID",
            "error": str(exc),
        }

    if breaking and bump != "major":
        return 1, {
            "status": "BREAKING_SEMVER_VIOLATION",
            "bump": bump,
            "breaking_changes": breaking,
            "action": "Bump MAJOR version or restore backward compatibility",
        }

    if breaking and bump == "major" and changelog_path is None:
        return 2, {
            "status": "SPEC_INVALID",
            "error": "major bump with breaking changes requires --changelog with latest block containing BREAKING CHANGES",
            "breaking_changes": breaking,
        }

    if changelog_path is not None:
        changelog_errors = validate_changelog(changelog_path, bool(breaking))
        if changelog_errors:
            return 2, {
                "status": "SPEC_INVALID",
                "changelog_errors": changelog_errors,
                "breaking_changes": breaking,
            }

    return 0, {
        "status": "PASSED",
        "bump": bump,
        "breaking_count": len(breaking),
    }


def main() -> None:
    p = argparse.ArgumentParser(description="OpenAPI Diff & SemVer Release Gate")
    p.add_argument("--base", required=True, type=Path)
    p.add_argument("--target", required=True, type=Path)
    p.add_argument("--bump", choices=("patch", "minor", "major"), required=True)
    p.add_argument("--changelog", type=Path, default=None)
    args = p.parse_args()

    try:
        base_spec = json.loads(args.base.read_text(encoding="utf-8"))
        target_spec = json.loads(args.target.read_text(encoding="utf-8"))
    except Exception as exc:
        print(json.dumps({"status": "SPEC_INVALID", "error": str(exc)}, ensure_ascii=False, indent=2))
        sys.exit(2)

    code, report = evaluate_release(base_spec, target_spec, args.bump, changelog_path=args.changelog)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(code)


if __name__ == "__main__":
    main()
