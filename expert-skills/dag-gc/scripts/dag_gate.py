#!/usr/bin/env python3
"""Deterministic DAG topology gate, Ring-3 isolation guard, two-strike fuse, and thread GC audit."""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict, deque
from pathlib import Path

FORBIDDEN_SOLO_BOT_IDS = {"90bfa817-5a81-43f0-8f5d-de55cddfcb9a", "90bfa817"}
VALID_VERBS = {
    "investigate", "specify", "implement", "test", "audit", "deploy", "document", "reconcile"
}


def validate_dag(dag_path: Path) -> tuple[int, dict]:
    data = json.loads(dag_path.read_text(encoding="utf-8"))
    nodes = data.get("nodes", [])
    if not isinstance(nodes, list) or not nodes:
        return 2, {"status": "SPEC_INVALID", "errors": ["nodes must be a non-empty list"]}

    errors: list[str] = []
    two_strike_hits: list[str] = []
    timeout_hits: list[str] = []
    node_ids: set[str] = set()
    adj: dict[str, list[str]] = defaultdict(list)
    indegree: dict[str, int] = {}

    for node in nodes:
        nid = str(node.get("id", "")).strip()
        if not nid:
            errors.append("node missing non-empty id")
            continue
        if nid in node_ids:
            errors.append(f"duplicate node id: {nid}")
        node_ids.add(nid)
        indegree.setdefault(nid, 0)

        bot_id = str(node.get("assigned_bot_id") or "").strip()
        role = str(node.get("assigned_role") or "").strip()
        if not bot_id and not role:
            errors.append(f"node {nid}: missing assigned_bot_id or assigned_role")
        else:
            for assignee in (bot_id, role):
                if assignee and (any(bad in assignee for bad in FORBIDDEN_SOLO_BOT_IDS) or "首席科学家" in assignee):
                    errors.append(f"node {nid}: forbidden Ring-3 solo bot dispatch ({assignee})")
                    break

        verb = str(node.get("action_verb", "")).strip().lower()
        if verb not in VALID_VERBS:
            errors.append(f"node {nid}: invalid action_verb '{verb}'")

        if not str(node.get("target_object", "")).strip():
            errors.append(f"node {nid}: missing target_object")

        done_when = str(node.get("done_when", "")).strip()
        done_lower = done_when.lower()
        vague_substrings = (
            "looks good", "lgtm", "looks fine", "looks ok",
            "everything should be fine", "everything is fine", "all good", "all fine",
            "should be fine", "seems fine", "seems good",
        )
        verifiable_markers = (
            "exit", "pytest", "0", "status", "clean", "assert", "sha256", "diff",
            ".json", ".md", ".py", ".ts", ".log",
        )
        is_vague = (
            not done_when
            or len(done_when) < 6
            or any(sub in done_lower for sub in vague_substrings)
            or not any(marker in done_lower for marker in verifiable_markers)
        )
        if is_vague:
            errors.append(f"node {nid}: missing verifiable done_when ('{done_when}')")

        rework = int(node.get("rework_count", 0))
        if rework >= 2:
            two_strike_hits.append(nid)

        elapsed = float(node.get("elapsed_sec", 0.0))
        timeout = float(node.get("timeout_sec", 900.0))
        if elapsed > timeout:
            timeout_hits.append(nid)

    for node in nodes:
        nid = str(node.get("id", "")).strip()
        for dep in node.get("dependencies", []):
            dep_id = str(dep).strip()
            if dep_id not in node_ids:
                errors.append(f"node {nid}: unknown dependency '{dep_id}'")
            else:
                adj[dep_id].append(nid)
                indegree[nid] = indegree.get(nid, 0) + 1

    # Kahn topological sort for cycle detection
    q = deque([n for n, deg in indegree.items() if deg == 0])
    visited: list[str] = []
    while q:
        cur = q.popleft()
        visited.append(cur)
        for nxt in adj[cur]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                q.append(nxt)

    if len(visited) != len(node_ids):
        cycle_nodes = sorted(node_ids - set(visited))
        errors.append(f"cycle detected involving nodes: {cycle_nodes}")

    if errors:
        return 2, {
            "status": "SPEC_INVALID",
            "errors": errors,
            "two_strike_hits": two_strike_hits,
            "timeout_hits": timeout_hits,
        }
    if two_strike_hits or timeout_hits:
        return 20, {
            "status": "FREEZE_TWO_STRIKE",
            "two_strike_hits": two_strike_hits,
            "timeout_hits": timeout_hits,
            "action": "Freeze branch and escalate to @软件架构师 / @产品与商业官",
        }
    return 0, {"status": "PASS", "topological_order": visited, "node_count": len(visited)}


def gc_audit(threads_path: Path, ttl_hours: float = 24.0) -> tuple[int, dict]:
    items = json.loads(threads_path.read_text(encoding="utf-8"))
    if isinstance(items, dict):
        items = items.get("threads", [])
    now_ms = int(items[0].get("_now_ms", 0)) if items and "_now_ms" in items[0] else 0
    if not now_ms:
        import time
        now_ms = int(time.time() * 1000)

    ttl_ms = int(ttl_hours * 3600 * 1000)
    candidates: list[dict] = []
    exempted: list[dict] = []

    for t in items:
        if t.get("closedAt") or t.get("archivedAt"):
            continue
        status = str(t.get("status", "")).upper()
        is_standing = bool(
            t.get("standing") is True
            or t.get("persistent") is True
            or str(t.get("thread_type", "")).lower() == "standing"
        )
        is_waiting_human = status in {"WAITING_HUMAN", "WAITING_USER"}

        if is_waiting_human or is_standing:
            exempted.append({
                "threadId": t.get("threadId"),
                "title": t.get("title", ""),
                "reason": status if is_waiting_human else "STANDING_PERSISTENT",
            })
            continue

        updated_at = int(t.get("updatedAt", now_ms))
        idle_ms = max(0, now_ms - updated_at)

        # ?????RUNNING ??????? GC ????
        if status == "RUNNING":
            continue

        terminal_statuses = {"SETTLED", "COMPLETED", "FAILED", "CLOSED", "CANCELLED"}
        if status == "SETTLED" or (status in terminal_statuses and idle_ms >= ttl_ms):
            candidates.append({
                "threadId": t.get("threadId"),
                "title": t.get("title", ""),
                "reason": "SETTLED" if status == "SETTLED" else f"IDLE_GT_{ttl_hours}H",
            })

    return 0, {
        "status": "PASS",
        "gc_candidates": candidates,
        "count": len(candidates),
        "exempted": exempted,
        "exempted_count": len(exempted),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="DAG Gate & Thread GC CLI")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_val = sub.add_parser("validate")
    p_val.add_argument("--dag", required=True, type=Path)

    p_gc = sub.add_parser("gc-audit")
    p_gc.add_argument("--threads", required=True, type=Path)
    p_gc.add_argument("--ttl-hours", type=float, default=24.0)

    args = parser.parse_args()
    if args.cmd == "validate":
        code, report = validate_dag(args.dag)
    else:
        code, report = gc_audit(args.threads, args.ttl_hours)

    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(code)


if __name__ == "__main__":
    main()
