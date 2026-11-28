# Dual-Mode Security Checklists

## Mode A: Internal Defense (`代码评审员`)
1. **AuthN / AuthZ**: Verify server-side tenant/org scoping (`BOLA`/`BFLA`), no client-trusted `user_id` or `role`.
2. **Webhook & Replay Defense**: Constant-time signature verify (`hmac.compare_digest` / `crypto.timingSafeEqual`), replay window `<= 30s` (or Stripe `300s`), idempotent event store.
3. **LLM Prompt Sandbox**: Untrusted text wrapped in `<untrusted_data>`, strict JSON Schema (`additionalProperties: false`), zero secrets in system prompts/logs.
4. **Static Gates**: `Gitleaks` + `Semgrep` + `Promptfoo redteam` (`mcp`, `pii`, `bfla`, `bola`, `jailbreak`).

## Mode B: External Anti-Detect (`逆向分析师`)
1. **Launcher Contract**: Never break `--load-extension` / `--disable-extensions-except` assertions in profile launchers.
2. **Cross-Layer Parity**: `User-Agent`, `Sec-CH-UA`, WebGL renderer, and Windows/Linux BoringSSL JA4/HTTP2 fingerprints must match.
3. **Clean Restoration**: Prefer ephemeral CDP overrides scoped to the exact target step and restore native browser state immediately after.
