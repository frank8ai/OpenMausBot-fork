import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { detectUnverifiedDispatchClaim } from "./chat-announcement.ts";
import { parseVerifiedReceipts, reconcileDispatchClaims } from "./phantom-dispatch-gate.ts";
import { OpenAICompatDriver } from "./openai-compat.ts";
import { recordEvents } from "../testing/events.ts";
import type { SendTurnInput } from "../contracts.ts";

async function waitFor(fn: () => void | Promise<void>, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (true) {
    try {
      await fn();
      return;
    } catch (err) {
      if (Date.now() - start > timeoutMs) throw err;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

describe("detectUnverifiedDispatchClaim unit tests", () => {
  const REAL_PHANTOM_DISPATCH_SAMPLES = [
    // 1. Thread 88103bf0
    "已协调【全栈开发】与【文档版本员】推进架构整改，请稍候。",
    // 2. Thread f1af515e
    "[触发 Rework-1 派发全栈开发精准修复 ⏳]",
    // 3. Thread 8fa18ea3
    "[全栈开发手术式修复 P1 缺陷中 ⚙️]",
    // 4. Thread feb36d01
    "[已派发【全栈开发】与【运维工程师】双轨推进 ⏳]",
    // 5. Thread 7b631f38
    "立即切换为 AutoFabric 底座无头执行",
    // 6. Thread 4faa26f6
    "已派发【全栈开发】执行分支创建与代码修复",
    // 7. Thread 36bb9b6c / 146ac05a
    "已立即呼叫【测试质保员】进场验收",
    // 8. English active dispatch claim
    "I have dispatched the task to the developer agent.",
  ];

  it.each(REAL_PHANTOM_DISPATCH_SAMPLES)(
    "intercepts real phantom dispatch sample: %s",
    (text) => {
      const verdict = detectUnverifiedDispatchClaim(text);
      expect(verdict.claimed).toBe(true);
      expect(verdict.matchedEvidence).toBeTruthy();
    }
  );

  const NEGATIVE_SAMPLES = [
    "[已派发失败 ⚠️] 调度未能执行成功。",
    "未能派发该工单，因为缺少必要的 bot_ids 参数。",
    "无法派发任务到外部系统，请配置 API 凭证。",
    "待您确认后派发【全栈开发】执行修复。",
    "等待您确认设计方案后再进行调度。",
    "需要你先确认是否继续执行后续流程。",
    "是否需要我派发【测试质保员】进行验收？",
    "要不要派发【全栈开发】进行修复？",
    "已完成本地静态类型检查与单测，未触发派发动作。",
    "代码示例如下：\n```ts\n已派发【全栈开发】执行代码修复\n```\n以上仅供参考。",
    "The task could not be dispatched because of network failure.",
  ];

  it.each(NEGATIVE_SAMPLES)(
    "allows negative/unverified guard sample: %s",
    (text) => {
      const verdict = detectUnverifiedDispatchClaim(text);
      expect(verdict.claimed).toBe(false);
      expect(verdict.matchedEvidence).toBeNull();
    }
  );

  const MIXED_AND_CODEBLOCK_POSITIVE_SAMPLES = [
    // 1. 代码块内含否定词，但正文有肯定派发声明：代码块必须被剥离，不得掩盖正文肯定声明
    "代码示例如下：\n```ts\n// 未能派发\nconst status = 'failed';\n```\n已派发【全栈开发】执行分支创建与代码修复",
    // 2. 单行内多语句：前句否定，后句肯定（句号分隔）
    "未能派发【架构师】。已派发【全栈开发】执行代码修复。",
    // 3. 单句内逗号分句：前分句动作否定，后分句肯定派发
    "虽然未能派发【架构师】，但已派发【全栈开发】推进修复。",
    // 4. 英文混合否定与肯定
    "Could not dispatch to QA bot. Dispatched to developer bot.",
    // 5. 多行混合：第一行肯定派发，第二行否定声明
    "已派发【全栈开发】推进修复。\n未能派发【架构师】。",
  ];

  it.each(MIXED_AND_CODEBLOCK_POSITIVE_SAMPLES)(
    "intercepts positive dispatch even with codeblocks or negative clauses: %s",
    (text) => {
      const verdict = detectUnverifiedDispatchClaim(text);
      expect(verdict.claimed).toBe(true);
      expect(verdict.matchedEvidence).toBeTruthy();
    }
  );
});


describe("reconcileDispatchClaims and parseVerifiedReceipts unit tests", () => {
  it("ignores instructionOnly: true in tool receipts", () => {
    const receipts = parseVerifiedReceipts(
      "agents_coordinate_bots",
      "agents_coordinate_bots",
      JSON.stringify({ instructionOnly: true, receipts: [{ botId: "bot-dev", outcome: "queued" }] })
    );
    expect(receipts).toHaveLength(0);
  });

  it("filters out outcome: 'failed' receipts", () => {
    const receipts = parseVerifiedReceipts(
      "agents_coordinate_bots",
      "agents_coordinate_bots",
      JSON.stringify({
        receipts: [
          { botId: "bot-dev", botName: "全栈开发", outcome: "queued" },
          { botId: "bot-qa", botName: "测试质保员", outcome: "failed" },
        ],
      })
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0].botId).toBe("bot-dev");
  });

  it("filters out any outcome not strictly 'queued' or 'injected'", () => {
    const receipts = parseVerifiedReceipts(
      "agents_coordinate_bots",
      "agents_coordinate_bots",
      JSON.stringify({
        receipts: [
          { botId: "bot-dev", botName: "全栈开发", outcome: "queued" },
          { botId: "bot-arch", botName: "架构师", outcome: "injected" },
          { botId: "bot-qa", botName: "测试质保员", outcome: "failed" },
          { botId: "bot-ops", botName: "运维工程师", outcome: "rejected" },
          { botId: "bot-sec", botName: "安全审计官", outcome: "error" },
          { botId: "bot-unknown", botName: "未知", outcome: "unknown" },
        ],
      })
    );
    expect(receipts).toHaveLength(2);
    expect(receipts.map((r) => r.botId)).toEqual(["bot-dev", "bot-arch"]);
    expect(receipts[0].outcome).toBe("queued");
    expect(receipts[1].outcome).toBe("injected");
  });

  it("intercepts affirmative dispatch claims when receipts are empty (zero receipts)", () => {
    const res = reconcileDispatchClaims("已派发【全栈开发】执行代码修复", []);
    expect(res.isUnverified).toBe(true);
    expect(res.verifiedTargetCount).toBe(0);
    expect(res.claimedTargetCount).toBe(1);
    expect(res.reason).toContain("0 verified receipts");
  });

  it("does not increment claimedTargetCount with unnamed summary or badge sentences when named targets exist", () => {
    const receipts = [
      { botId: "bot-dev", botName: "全栈开发", outcome: "queued", toolName: "agents_coordinate_bots" },
    ];
    const text = "[已派发 🚀] 任务调度启动！\n已派发【全栈开发】推进修复。";
    const res = reconcileDispatchClaims(text, receipts);
    expect(res.isUnverified).toBe(false);
    expect(res.claimedTargetCount).toBe(1);
    expect(res.verifiedTargetCount).toBe(1);
  });

  it("does not false-positive on same target in badge and prose summary", () => {
    const receipts = [
      { botId: "bot-dev", botName: "全栈开发", outcome: "queued", toolName: "agents_coordinate_bots" },
    ];
    const text = "[已派发【全栈开发】推进 ⏳]\n已派发【全栈开发】推进代码修复。";
    const res = reconcileDispatchClaims(text, receipts);
    expect(res.isUnverified).toBe(false);
    expect(res.claimedTargetCount).toBe(1);
    expect(res.verifiedTargetCount).toBe(1);
  });

  it("intercepts single call claiming multiple distinct targets", () => {
    const receipts = [
      { botId: "bot-dev", botName: "全栈开发", outcome: "queued", toolName: "agents_coordinate_bots" },
    ];
    const text = "已派发【全栈开发】与【测试质保员】推进修复。";
    const res = reconcileDispatchClaims(text, receipts);
    expect(res.isUnverified).toBe(true);
    expect(res.claimedTargetCount).toBe(2);
    expect(res.verifiedTargetCount).toBe(1);
  });

  it("handles same-line negative clause followed by valid badge", () => {
    const receipts = [
      { botId: "bot-dev", botName: "全栈开发", outcome: "queued", toolName: "agents_coordinate_bots" },
    ];
    const text = "未能派发【架构师】。[已派发【全栈开发】推进 ⏳]";
    const res = reconcileDispatchClaims(text, receipts);
    expect(res.isUnverified).toBe(false);
    expect(res.claimedTargetCount).toBe(1);
    expect(res.verifiedTargetCount).toBe(1);
  });
});

interface ChatRequest {
  messages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string }> | null;
    tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  }>;
}

type Script = (body: ChatRequest, response: ServerResponse, round: number) => void;

const MCP_AGENTS_SCRIPT = [
  'import { appendFileSync, writeFileSync } from "node:fs";',
  'import { join } from "node:path";',
  'import { createInterface } from "node:readline";',
  'const [directory, callback] = process.argv.slice(2);',
  'writeFileSync(join(directory, "pid"), String(process.pid));',
  'const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");',
  'const schema = { type: "object", properties: { bot_ids: { type: "array", items: { type: "string" } }, message: { type: "string" } }, required: ["bot_ids", "message"] };',
  'createInterface({ input: process.stdin }).on("line", async (line) => {',
  '  const request = JSON.parse(line);',
  '  if (request.method === "initialize") {',
  '    reply(request.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "agents", version: "1" } });',
  '  } else if (request.method === "tools/list") {',
  '    reply(request.id, { tools: [{ name: "coordinate_bots", description: "Coordinate with bots", inputSchema: schema }] });',
  '  } else if (request.method === "tools/call") {',
  '    const { name, arguments: args } = request.params;',
  '    if (args && args.message === "FAIL_CALL") {',
  '      reply(request.id, { isError: true, content: [{ type: "text", text: "Coordination failed deliberately." }] });',
  '      return;',
  '    }',
  '    if (args && args.message === "PARTIAL_FAIL") {',
  '      const receipts = [',
  '        { botId: "bot-dev", botName: "全栈开发", outcome: "queued", requestId: "req_1" },',
  '        { botId: "bot-qa", botName: "测试质保员", outcome: "failed", requestId: "req_2" },',
  '      ];',
  '      reply(request.id, { content: [{ type: "text", text: JSON.stringify({ receipts }) }] });',
  '      return;',
  '    }',
  '    if (args && args.message === "INSTRUCTION_ONLY") {',
  '      reply(request.id, { content: [{ type: "text", text: JSON.stringify({ instructionOnly: true, receipts: [] }) }] });',
  '      return;',
  '    }',
  '    appendFileSync(join(directory, "dispatches.ndjson"), JSON.stringify({ name, ...args }) + "\\n");',
  '    const botIds = Array.isArray(args?.bot_ids) ? args.bot_ids : ["bot-dev"];',
  '    const receipts = botIds.map((id) => ({ botId: id, botName: id === "bot-dev" ? "全栈开发" : id, outcome: "queued", requestId: "req_12345" }));',
  '    reply(request.id, { content: [{ type: "text", text: JSON.stringify({ receipts }) }] });',
  '  } else if (request.id !== undefined && request.method === "ping") reply(request.id, {});',
  '});',
].join("\n");

function sse(response: ServerResponse, chunks: unknown[], done = true) {
  response.writeHead(200, { "content-type": "text/event-stream" });
  for (const value of chunks) response.write(`data: ${JSON.stringify(value)}\n\n`);
  if (done) response.end("data: [DONE]\n\n");
}

const chunk = (delta: unknown, finishReason: string | null = null) =>
  ({ choices: [{ index: 0, delta, finish_reason: finishReason }] });

const toolCall = (name = "agents_coordinate_bots", args = JSON.stringify({ bot_ids: ["bot-dev"], message: "do work" }), id = "call_coord") =>
  ({ index: 0, id, type: "function", function: { name, arguments: args } });

function answer(response: ServerResponse, text: string) {
  sse(response, [chunk({ content: text }, "stop")]);
}

describe("OpenAIChatRuntime phantom dispatch guard integration", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    delete process.env.OMB_PHANTOM_DISPATCH_GUARD;
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  async function fixture(script: Script, options: { provideDispatchTool?: boolean } = {}) {
    const directory = mkdtempSync(join(tmpdir(), "omb-phantom-test-"));
    const requests: ChatRequest[] = [];
    const server = createServer(async (request, response) => {
      if (request.url === "/v1/models") {
        response.setHeader("content-type", "application/json");
        response.end('{"data":[]}');
        return;
      }
      if (request.method !== "POST") {
        response.writeHead(404);
        response.end();
        return;
      }
      let data = "";
      for await (const part of request) data += part.toString();
      const body = JSON.parse(data) as ChatRequest;
      requests.push(body);
      script(body, response, requests.length);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Server failed to bind");
    const origin = `http://127.0.0.1:${address.port}`;
    const helper = join(directory, "agents.mjs");
    writeFileSync(helper, MCP_AGENTS_SCRIPT);

    const instance = await OpenAICompatDriver.create({
      instanceId: randomUUID(),
      displayName: "Phantom Dispatch Test",
      enabled: true,
      config: { url: `${origin}/v1`, apiKeyEnv: "FIXTURE_KEY" },
      environment: { FIXTURE_KEY: "secret" },
    });

    const recorder = recordEvents(instance.adapter);
    const integrations: SendTurnInput["integrations"] = options.provideDispatchTool === false
      ? {}
      : {
          custom: { agents: { command: process.execPath, args: [helper, directory, origin], env: {} } },
        };

    cleanups.push(async () => {
      await instance.dispose();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    return {
      instance,
      recorder,
      requests,
      async start() {
        return instance.adapter.sendTurn({
          threadId: randomUUID(),
          text: "dispatch a task",
          integrations,
          approvalMode: "full",
        });
      },
      async completed() {
        await waitFor(() => {
          if (!recorder.events.some((e) => e.type === "turn.completed" || e.type === "runtime.error")) {
            throw new Error("turn still in progress");
          }
        }, 10_000);
        const error = recorder.events.find((e) => e.type === "runtime.error");
        
        return { ok: !error, error };
      },
    };
  }

  it("blocks phantom dispatch after 2 nudges when zero coordinate_bots calls occur", async () => {
    const f = await fixture((_body, response) => {
      // Model keeps falsely claiming dispatch without tool calls
      answer(response, "[已派发【全栈开发】与【运维工程师】双轨推进 ⏳]");
    });

    await f.start();
    const result = await f.completed();
    expect(result.ok).toBe(false);
    expect(f.requests.length).toBe(3); // Round 1 (claim) -> Nudge 1 -> Round 2 (claim) -> Nudge 2 -> Round 3 (claim) -> Fail-closed
    // Verify nudge content was sent to model
    expect(f.requests[1].messages.at(-1)?.content).toContain("[SYSTEM HARD GATE]");
    expect(f.requests[2].messages.at(-1)?.content).toContain("[SYSTEM HARD GATE]");
    // Verify terminal error
    expect(f.recorder.events).toContainEqual(
      expect.objectContaining({
        type: "runtime.error",
        message: expect.stringContaining("Blocked phantom dispatch after 2 nudges"),
      })
    );
  });

  it("allows completion when coordinate_bots is successfully called after nudge", async () => {
    const f = await fixture((_body, response, round) => {
      if (round === 1) {
        // Round 1: False claim
        answer(response, "[已派发【全栈开发】与【运维工程师】双轨推进 ⏳]");
      } else if (round === 2) {
        // Round 2: After nudge, physically invoke coordinate_bots
        sse(response, [
          chunk({
            tool_calls: [toolCall("agents_coordinate_bots", JSON.stringify({ bot_ids: ["bot-dev"], message: "do work" }))],
          }, "tool_calls"),
        ]);
      } else {
        // Round 3: Final confirmation after real dispatch
        answer(response, "真实调度完成：[已派发【全栈开发】推进修复 ⏳]");
      }
    });

    await f.start();
    const result = await f.completed();
    expect(result.ok).toBe(true);
    expect(f.requests.length).toBe(3);
    expect(f.recorder.events).toContainEqual(expect.objectContaining({ type: "turn.completed" }));
  });

  it("does not count failed coordinate_bots (isError: true) and blocks continuation", async () => {
    const f = await fixture((_body, response, round) => {
      if (round === 1) {
        // Round 1: Tool call that will return isError: true
        sse(response, [
          chunk({
            tool_calls: [toolCall("agents_coordinate_bots", JSON.stringify({ bot_ids: ["bot-dev"], message: "FAIL_CALL" }))],
          }, "tool_calls"),
        ]);
      } else {
        // Round 2: Model still claims dispatch despite failure
        answer(response, "[已派发【全栈开发】与【运维工程师】双轨推进 ⏳]");
      }
    });

    await f.start();
    const result = await f.completed();
    expect(result.ok).toBe(false);
    // Since tool call failed, succeededTools did NOT receive agents_coordinate_bots
    expect(f.recorder.events).toContainEqual(
      expect.objectContaining({
        type: "runtime.error",
      })
    );
  });

  it("allows phantom dispatch text when OMB_PHANTOM_DISPATCH_GUARD=0 is set (kill-switch)", async () => {
    process.env.OMB_PHANTOM_DISPATCH_GUARD = "0";

    const f = await fixture((_body, response) => {
      answer(response, "[已派发【全栈开发】与【运维工程师】双轨推进 ⏳]");
    });

    await f.start();
    const result = await f.completed();
    expect(result.ok).toBe(true);
    expect(f.requests.length).toBe(1); // No nudges sent, accepted immediately
    expect(f.recorder.events).toContainEqual(expect.objectContaining({ type: "turn.completed" }));
  });

  it("blocks phantom dispatch when dispatch tool is not available / not provided", async () => {
    // Dispatch tool is not provided in tools catalog
    const f = await fixture((_body, response) => {
      answer(response, "已派发【全栈开发】执行代码修复");
    }, { provideDispatchTool: false });

    await f.start();
    const result = await f.completed();
    expect(result.ok).toBe(false);
    expect(f.requests.length).toBe(3); // Round 1 -> Nudge 1 -> Round 2 -> Nudge 2 -> Round 3 -> Fail-closed
    expect(f.requests[1].messages.at(-1)?.content).toContain("检测到未经验证的派发声称");
    expect(f.recorder.events).toContainEqual(
      expect.objectContaining({
        type: "runtime.error",
        message: expect.stringContaining("Blocked phantom dispatch after 2 nudges"),
      })
    );
  });

  it("intercepts when single coordinate_bots call tries to endorse multiple dispatch claims", async () => {
    const f = await fixture((_body, response, round) => {
      if (round === 1) {
        // Round 1: Model invokes tool once for 1 bot
        sse(response, [
          chunk({
            tool_calls: [toolCall("agents_coordinate_bots", JSON.stringify({ bot_ids: ["bot-dev"], message: "do work" }))],
          }, "tool_calls"),
        ]);
      } else if (round === 2) {
        // Round 2: Model claims 2 distinct dispatches (exceeding capacity of 1)
        answer(response, "已派发【全栈开发】执行代码修复。\n已派发【测试质保员】进行验收。");
      } else {
        // Round 3: After nudge, model truthfully retracts the unverified second dispatch
        answer(response, "已派发【全栈开发】执行代码修复。未能派发【测试质保员】。");
      }
    });

    await f.start();
    const result = await f.completed();
    expect(result.ok).toBe(true);
    expect(f.requests.length).toBe(3);
    // Verified that round 2's unverified multi-dispatch claim was nudged
    expect(f.requests[2].messages.at(-1)?.content).toContain("检测到未经验证的派发声称");
    expect(f.recorder.events).toContainEqual(expect.objectContaining({ type: "turn.completed" }));
  });

  it("blocks phantom dispatch when coordinate_bots returns partial failure (1 success, 1 failed) and model claims both", async () => {
    const f = await fixture((_body, response, round) => {
      if (round === 1) {
        sse(response, [
          chunk({
            tool_calls: [toolCall("agents_coordinate_bots", JSON.stringify({ bot_ids: ["bot-dev", "bot-qa"], message: "PARTIAL_FAIL" }))],
          }, "tool_calls"),
        ]);
      } else {
        answer(response, "已派发【全栈开发】与【测试质保员】协同推进。");
      }
    });

    await f.start();
    const result = await f.completed();
    expect(result.ok).toBe(false);
    expect(f.requests.length).toBe(4);
    expect(f.requests[2].messages.at(-1)?.content).toContain("检测到未经验证的派发声称");
    expect(f.recorder.events).toContainEqual(
      expect.objectContaining({
        type: "runtime.error",
        message: expect.stringContaining("Blocked phantom dispatch after 2 nudges"),
      })
    );
  });

  it("blocks phantom dispatch when coordinate_bots returns instructionOnly: true", async () => {
    const f = await fixture((_body, response, round) => {
      if (round === 1) {
        sse(response, [
          chunk({
            tool_calls: [toolCall("agents_coordinate_bots", JSON.stringify({ bot_ids: ["bot-dev"], message: "INSTRUCTION_ONLY" }))],
          }, "tool_calls"),
        ]);
      } else {
        answer(response, "[已派发【全栈开发】推进 ⏳]");
      }
    });

    await f.start();
    const result = await f.completed();
    expect(result.ok).toBe(false);
    expect(f.requests.length).toBe(4);
    expect(f.requests[2].messages.at(-1)?.content).toContain("检测到未经验证的派发声称");
    expect(f.recorder.events).toContainEqual(
      expect.objectContaining({
        type: "runtime.error",
        message: expect.stringContaining("Blocked phantom dispatch after 2 nudges"),
      })
    );
  });

  it("allows inline badge when preceded by negative clause on the same line", async () => {
    const f = await fixture((_body, response, round) => {
      if (round === 1) {
        sse(response, [
          chunk({
            tool_calls: [toolCall("agents_coordinate_bots", JSON.stringify({ bot_ids: ["bot-dev"], message: "do work" }))],
          }, "tool_calls"),
        ]);
      } else {
        answer(response, "未能派发【架构师】。[已派发【全栈开发】推进 ⏳]");
      }
    });

    await f.start();
    const result = await f.completed();
    expect(result.ok).toBe(true);
    expect(f.requests.length).toBe(2);
    expect(f.recorder.events).toContainEqual(expect.objectContaining({ type: "turn.completed" }));
  });

  it("allows single-target dispatch with badge and prose summary without false positive, while blocking multi-target claim", async () => {
    const f = await fixture((_body, response, round) => {
      if (round === 1) {
        sse(response, [
          chunk({
            tool_calls: [toolCall("agents_coordinate_bots", JSON.stringify({ bot_ids: ["bot-dev"], message: "do work" }))],
          }, "tool_calls"),
        ]);
      } else {
        answer(response, "[已派发【全栈开发】推进 ⏳]\n已派发【全栈开发】执行代码修复与门禁验证。");
      }
    });

    await f.start();
    const result = await f.completed();
    expect(result.ok).toBe(true);
    expect(f.requests.length).toBe(2);
    expect(f.recorder.events).toContainEqual(expect.objectContaining({ type: "turn.completed" }));
  });

});
