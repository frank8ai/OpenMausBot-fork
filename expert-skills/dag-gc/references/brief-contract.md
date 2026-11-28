# DAG Dispatch Brief Contract & Thread Hygiene (v2.0)

## 1. Allowed Ring 1 + Ring 2 Work Roster (12 Seats)
- **Ring 1 Core (10)**: `MausBot首席幕僚长` (`9e5114b7`), `技术与竞品情报官` (`d25420bf`), `软件架构师` (`484c328a`), `全栈开发` (`486bda01`), `测试质保员` (`b537ed1e`), `代码评审员` (`bb1549bf`), `运维工程师` (`7b90b552`), `产品与商业官` (`5356dd4a`), `增长与运营官` (`674a9113`), `客户成功与复现官` (`2c92ff05`).
- **Ring 2 Specialist Plugins (2, Explicit-Trigger Only)**: `体验设计师` (`82d7e194`, UI/UX only), `逆向分析师` (`29cf6cf1`, reverse engineering & anti-detect only).
- **Ring 3 Solo Vault (Hard Blocked)**: `首席科学家与基础理论架构师` (`90bfa817`).

## 2. Allowed Action Verbs (8, Single Source of Truth with `dag_gate.py`)
`investigate | specify | implement | test | audit | deploy | document | reconcile`

## 3. Minimal `PLAN_DAG` JSON Contract (with Two-Strike & Timeout Fuse Fields)
```json
{
  "nodes": [
    {
      "id": "impl-auth",
      "action_verb": "implement",
      "target_object": "src/auth/token.ts",
      "dependencies": ["spec-auth"],
      "assigned_bot_id": "486bda01-f875-40a3-8407-a974dba32ac3",
      "done_when": "pytest tests/auth/test_token.py exits 0",
      "rework_count": 0,
      "elapsed_sec": 120,
      "timeout_sec": 900
    }
  ]
}
```

## 4. Thread GC Exemption Contract (`gc-audit`)
Threads matching ANY of the following MUST be exempted from `gc_candidates` and reported under `exempted`:
- `status` in `{"WAITING_HUMAN", "WAITING_USER"}`
- `standing: true` OR `persistent: true` OR `thread_type == "standing"`
