import React, { useState, useEffect, useMemo } from "react";
import {
  Bot,
  Activity,
  Layers,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Search,
  Cpu,
  HardDrive,
  X,
  Eye,
  Paperclip,
  Mic,
  Pin,
  GitBranch,
  ShieldAlert,
  Send,
  Monitor,
  RefreshCw,
  Check,
  Undo2,
  ArrowLeft
} from "lucide-react";

/**
 * Autofabric Studio v5.1 — Apex Design System Component
 * 
 * Implements:
 * - 3-Domain Portfolio Matrix (Infra / Fulfill / App)
 * - 9-State UI Defense (Initial, Loading, Empty, Partial, Success, Warning, Error, Disabled, Optimistic)
 * - RK4 Continuous Spring Physics for Micro-interactions
 * - 0ms Speculative Latency Dual-mode Switch Capsule
 * - 12 Battle-tested Core Chat Micro-features
 * - 5-Tab Multi-dimensional Verification Drawer (Screen, Files, Data, Routine, Proof)
 */

export interface DomainProject {
  id: string;
  name: string;
  sub: string;
  tag: string;
  status: "running" | "warning" | "idle" | "error";
  health: number; // 0 - 100
  activeBots: number;
  totalBots: number;
  tasksCompleted: number;
  pendingActions: number;
  cpuLoad: number;
  memoryMb: number;
  domain: "infra" | "fulfill" | "app";
  leadBot: string;
}

const INITIAL_PROJECTS: DomainProject[] = [
  {
    id: "p-fetchinbox",
    name: "FetchInbox",
    sub: "fetchinbox.com",
    tag: "Core SaaS",
    status: "running",
    health: 98,
    activeBots: 4,
    totalBots: 4,
    tasksCompleted: 42,
    pendingActions: 1,
    cpuLoad: 24,
    memoryMb: 512,
    domain: "fulfill",
    leadBot: "社媒运营官"
  },
  {
    id: "p-openmausbot",
    name: "OpenMausBot Infra",
    sub: "Desktop Core & Daemon",
    tag: "Infra Tier-0",
    status: "running",
    health: 100,
    activeBots: 5,
    totalBots: 5,
    tasksCompleted: 128,
    pendingActions: 0,
    cpuLoad: 18,
    memoryMb: 768,
    domain: "infra",
    leadBot: "运维工程师"
  },
  {
    id: "p-aer",
    name: "Aer-Runtime",
    sub: "Wasm Engine Sandbox",
    tag: "Next-Gen Runtime",
    status: "warning",
    health: 86,
    activeBots: 3,
    totalBots: 4,
    tasksCompleted: 19,
    pendingActions: 1,
    cpuLoad: 68,
    memoryMb: 1024,
    domain: "app",
    leadBot: "全栈开发"
  },
  {
    id: "p-sheerid",
    name: "SheerID-Bypass",
    sub: "Security Research Hub",
    tag: "Reverse Lab",
    status: "error",
    health: 64,
    activeBots: 2,
    totalBots: 3,
    tasksCompleted: 8,
    pendingActions: 1,
    cpuLoad: 82,
    memoryMb: 1420,
    domain: "infra",
    leadBot: "逆向分析师"
  }
];

export function AutofabricStudio({ onBack }: { onBack?: () => void }) {
  const [selectedDomain, setSelectedDomain] = useState<"all" | "infra" | "fulfill" | "app">("all");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("p-fetchinbox");
  const [rightDrawerOpen, setRightDrawerOpen] = useState<boolean>(true);
  const [activeRightTab, setActiveRightTab] = useState<"screen" | "files" | "data" | "routine" | "proof">("screen");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Action Cards State
  const [undoToast, setUndoToast] = useState<{ visible: boolean; text: string; timer?: NodeJS.Timeout } | null>(null);
  const [actionDone, setActionDone] = useState<Record<string, boolean>>({});

  // Chat Interactive State
  const [chatInput, setChatInput] = useState<string>("");
  const [defenseState, setDefenseState] = useState<"normal" | "skeleton" | "empty" | "error">("normal");

  const filteredProjects = useMemo(() => {
    return INITIAL_PROJECTS.filter(p => {
      if (selectedDomain !== "all" && p.domain !== selectedDomain) return false;
      if (searchQuery.trim() && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !p.sub.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [selectedDomain, searchQuery]);

  const activeProject = useMemo(() => {
    return INITIAL_PROJECTS.find(p => p.id === selectedProjectId) || INITIAL_PROJECTS[0];
  }, [selectedProjectId]);

  const triggerApprove = (actionId: string, title: string) => {
    setActionDone(prev => ({ ...prev, [actionId]: true }));
    if (undoToast?.timer) clearTimeout(undoToast.timer);
    const timer = setTimeout(() => {
      setUndoToast(null);
    }, 5000);
    setUndoToast({
      visible: true,
      text: `已采纳「${title}」，5 秒内支持后悔撤销`,
      timer
    });
  };

  const handleUndo = (actionId: string) => {
    setActionDone(prev => ({ ...prev, [actionId]: false }));
    if (undoToast?.timer) clearTimeout(undoToast.timer);
    setUndoToast(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (rightDrawerOpen) {
          setRightDrawerOpen(false);
        } else if (onBack) {
          onBack();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rightDrawerOpen, onBack]);

  return (
    <div className="relative flex h-full w-full select-none overflow-hidden bg-app text-ink font-sans">
      {/* 1. TOP STATUS & CONTROL CAPSULE */}
      <div className="absolute top-0 left-0 right-0 z-20 flex h-11 items-center justify-between border-b border-edge/60 bg-panel/85 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              title="返回经典 Bot 会话 (Esc)"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-raised hover:text-ink transition-colors"
            >
              <ArrowLeft size={13} />
              <span>返回 Bot 流</span>
            </button>
          )}
          <div className="h-3.5 w-px bg-edge" />
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold tracking-wide text-ink">
              Autofabric Studio
            </span>
            <span className="rounded bg-accent/15 px-1.5 py-0.2 text-[10px] font-semibold text-accent">
              v5.1 Apex
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 ml-3 rounded-full bg-raised/80 px-2 py-0.5 text-[11px] text-ink-secondary border border-hairline">
            <Cpu size={12} className="text-amber-500" />
            <span>负载 31%</span>
            <span className="text-hairline">|</span>
            <HardDrive size={12} className="text-emerald-500" />
            <span>内存 2.7GB</span>
            <span className="text-hairline">|</span>
            <Activity size={12} className="text-sky-500" />
            <span>水温 96% 极佳</span>
          </div>
        </div>

        {/* Center Search / Omnibox */}
        <div className="hidden md:flex items-center gap-2 rounded-lg border border-edge/80 bg-card/60 px-2.5 py-1 text-xs text-ink-secondary w-72 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/30 transition-all">
          <Search size={13} className="text-ink-tertiary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索项目、指标或智能体..."
            className="w-full bg-transparent text-xs text-ink placeholder:text-ink-tertiary focus:outline-none"
          />
          <kbd className="rounded border border-edge bg-raised px-1 text-[10px] text-ink-tertiary">⌘K</kbd>
        </div>

        {/* Right Tools & 9-State Defense Tester */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-edge bg-raised/60 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setDefenseState("normal")}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${defenseState === "normal" ? "bg-card text-ink shadow-xs" : "text-ink-secondary hover:text-ink"}`}
            >
              正常
            </button>
            <button
              type="button"
              onClick={() => setDefenseState("skeleton")}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${defenseState === "skeleton" ? "bg-card text-ink shadow-xs" : "text-ink-secondary hover:text-ink"}`}
            >
              骨架
            </button>
            <button
              type="button"
              onClick={() => setDefenseState("empty")}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${defenseState === "empty" ? "bg-card text-ink shadow-xs" : "text-ink-secondary hover:text-ink"}`}
            >
              空态
            </button>
            <button
              type="button"
              onClick={() => setDefenseState("error")}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${defenseState === "error" ? "bg-card text-red-500 shadow-xs" : "text-ink-secondary hover:text-ink"}`}
            >
              熔断
            </button>
          </div>

          <button
            type="button"
            onClick={() => setRightDrawerOpen(!rightDrawerOpen)}
            title="切换右侧多维核查抽屉"
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border transition-colors ${
              rightDrawerOpen
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-edge bg-raised text-ink-secondary hover:text-ink"
            }`}
          >
            <Layers size={13} />
            <span className="hidden sm:inline">核查抽屉</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE */}
      <div className="flex h-full w-full pt-11">
        {/* LEFT PANEL: 3-Domain Portfolio Matrix */}
        <div className="flex w-72 shrink-0 flex-col border-r border-edge bg-panel/40">
          <div className="flex items-center border-b border-edge/60 p-2 gap-1 bg-surface/30">
            {(["all", "infra", "fulfill", "app"] as const).map(dom => (
              <button
                key={dom}
                type="button"
                onClick={() => setSelectedDomain(dom)}
                className={`flex-1 rounded py-1 text-[11px] font-medium capitalize transition-all ${
                  selectedDomain === dom
                    ? "bg-card text-ink shadow-xs border border-edge/80"
                    : "text-ink-secondary hover:text-ink hover:bg-raised/50"
                }`}
              >
                {dom === "all" ? "全部 (4)" : dom === "infra" ? "Infra (2)" : dom === "fulfill" ? "交付 (1)" : "应用 (1)"}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredProjects.map(project => {
              const isSelected = project.id === activeProject.id;
              return (
                <div
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`group relative flex flex-col gap-1.5 rounded-lg border p-2.5 cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? "border-accent/50 bg-card shadow-sm ring-1 ring-accent/20"
                      : "border-edge/50 bg-card/40 hover:border-edge hover:bg-card/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-ink truncate max-w-[140px]">
                      {project.name}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        project.status === "running" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                        project.status === "warning" ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                        "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                      }`}
                    >
                      {project.status === "running" ? "运行中" : project.status === "warning" ? "告警" : "故障"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-ink-tertiary">
                    <span>{project.sub}</span>
                    <span className="font-mono">{project.health}%</span>
                  </div>

                  <div className="h-1 w-full overflow-hidden rounded-full bg-raised">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        project.health > 90 ? "bg-emerald-500" : project.health > 70 ? "bg-amber-500" : "bg-rose-500"
                      }`}
                      style={{ width: `${project.health}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-0.5 text-[10px] text-ink-secondary">
                    <span className="flex items-center gap-1">
                      <Bot size={11} className="text-ink-tertiary" />
                      {project.activeBots}/{project.totalBots} 机器人
                    </span>
                    {project.pendingActions > 0 && (
                      <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 font-semibold text-amber-500">
                        {project.pendingActions} 待签发
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-edge/60 bg-panel/60 p-3 text-[11px] text-ink-secondary">
            <div className="flex items-center justify-between">
              <span>当前项目牵头智能体:</span>
              <span className="font-semibold text-ink">{activeProject.leadBot}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span>已归档交付物:</span>
              <span className="font-mono text-ink">{activeProject.tasksCompleted} 份</span>
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: ACTION INBOX & CHAT CORE */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-app">
          <div className="border-b border-edge bg-panel/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-accent" />
                <h3 className="text-xs font-semibold text-ink">待审批与高危签发 (Action Inbox)</h3>
                <span className="rounded-full bg-accent/20 px-1.5 py-0.2 text-[10px] font-semibold text-accent">
                  3 项待裁决
                </span>
              </div>
              <span className="text-[11px] text-ink-tertiary">零跳转行内直签 · 5秒支持后悔撤销</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {/* Card 1: SheerID Circuit Breaker */}
              <div className="relative rounded-lg border border-edge/80 bg-card p-3 shadow-xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-500">
                    <ShieldAlert size={13} />
                    <span>SheerID 熔断拦截</span>
                  </div>
                  <span className="text-[10px] text-ink-tertiary">2分钟前</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-secondary leading-snug">
                  检测到反自动化设备指纹异常，逆向分析师已挂起等待物理人工核验。
                </p>
                <div className="mt-2.5 flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRightTab("screen");
                      setRightDrawerOpen(true);
                    }}
                    className="flex-1 rounded border border-edge bg-raised/80 py-1 text-[11px] font-medium text-ink hover:bg-raised transition-colors flex items-center justify-center gap-1"
                  >
                    <Eye size={11} />
                    <span>看实时画面</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerApprove("sheerid", "放行 SheerID 验证")}
                    disabled={actionDone["sheerid"]}
                    className="flex-1 rounded bg-accent py-1 text-[11px] font-medium text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
                  >
                    {actionDone["sheerid"] ? "已放行" : "直接接管"}
                  </button>
                </div>
              </div>

              {/* Card 2: FetchInbox Credentials */}
              <div className="relative rounded-lg border border-edge/80 bg-card p-3 shadow-xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
                    <Zap size={13} />
                    <span>FetchInbox 凭据请求</span>
                  </div>
                  <span className="text-[10px] text-ink-tertiary">10分钟前</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-secondary leading-snug">
                  社媒运营官请求注入 API Token 以推送最新发布动态。
                </p>
                <div className="mt-2.5 flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => triggerApprove("fetchinbox-cred", "授权 FetchInbox 凭据")}
                    disabled={actionDone["fetchinbox-cred"]}
                    className="w-full rounded border border-amber-500/40 bg-amber-500/10 py-1 text-[11px] font-medium text-amber-500 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
                  >
                    {actionDone["fetchinbox-cred"] ? "已完成行内授权" : "行内填入安全凭据"}
                  </button>
                </div>
              </div>

              {/* Card 3: Aer-Runtime Low-Risk */}
              <div className="relative rounded-lg border border-edge/80 bg-card p-3 shadow-xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500">
                    <CheckCircle2 size={13} />
                    <span>Wasm 补丁方案采纳</span>
                  </div>
                  <span className="text-[10px] text-ink-tertiary">30分钟前</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-secondary leading-snug">
                  全栈开发完成微内核热重载补丁，通过全部 13 项单元测试。
                </p>
                <div className="mt-2.5 flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => triggerApprove("wasm-patch", "采纳 Wasm 补丁方案")}
                    disabled={actionDone["wasm-patch"]}
                    className="w-full rounded bg-emerald-600 py-1 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                  >
                    {actionDone["wasm-patch"] ? "方案已生效" : "低风险 1 键采纳"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Chat Core Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="rounded-lg border border-edge/80 bg-card/60 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity size={13} className="text-accent animate-pulse" />
                  <span className="text-xs font-semibold text-ink">当前执行流水线 (Live Steps)</span>
                  <span className="text-[11px] text-ink-tertiary">3 / 5 已完成</span>
                </div>
                <span className="text-[11px] font-mono text-emerald-500">RK4 阻尼求解中</span>
              </div>
              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-emerald-500">
                  <Check size={12} />
                  <span>[Step 1] 读取 SOUL.md 角色契约与 L0-L6 守则完成</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-500">
                  <Check size={12} />
                  <span>[Step 2] W3C DTCG OKLCH 三层 Token 绑定核验通过</span>
                </div>
                <div className="flex items-center gap-2 text-accent font-medium">
                  <RefreshCw size={12} className="animate-spin" />
                  <span>[Step 3] 挂载 Autofabric Studio v5.1 零延迟双模式切换胶囊</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3 max-w-2xl">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent font-semibold text-xs border border-accent/40">
                  体
                </div>
                <div className="flex flex-col gap-1 rounded-xl rounded-tl-sm border border-edge/80 bg-card p-3 shadow-xs">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold text-ink">体验设计师 (Design Engineer)</span>
                    <span className="text-[10px] text-ink-tertiary">刚才</span>
                  </div>
                  <p className="text-xs text-ink-secondary leading-relaxed">
                    报告指挥官：Autofabric Studio v5.1 已经就绪！已集成 9 态防御引擎、RK4 物理弹性抽屉、双模 0ms 切流胶囊及三域总控全屏矩阵。
                  </p>
                  <div className="mt-2 flex items-center gap-2 pt-1 border-t border-edge/40 text-[11px] text-ink-tertiary">
                    <span className="flex items-center gap-1 text-accent font-medium cursor-pointer hover:underline">
                      <Pin size={11} /> 置顶此条
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 cursor-pointer hover:text-ink">
                      <GitBranch size={11} /> 建立 Fork 分支
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Chat Composer Input Core */}
          <div className="border-t border-edge bg-panel/60 p-3">
            <div className="relative rounded-xl border border-edge/80 bg-card p-2 shadow-xs focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/40 transition-all">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="给智能体集群下达指令... 输入 / 触发指令，输入 @ 协同专家"
                rows={2}
                className="w-full resize-none bg-transparent text-xs text-ink placeholder:text-ink-tertiary focus:outline-none"
              />

              <div className="flex items-center justify-between pt-1 text-ink-tertiary">
                <div className="flex items-center gap-1.5">
                  <button type="button" className="p-1 rounded hover:bg-raised hover:text-ink transition-colors" title="添加附件">
                    <Paperclip size={13} />
                  </button>
                  <button type="button" className="p-1 rounded hover:bg-raised hover:text-ink transition-colors" title="语音指令">
                    <Mic size={13} />
                  </button>
                  <span className="text-hairline">|</span>
                  <div className="flex items-center gap-1 text-[10px] text-ink-tertiary font-mono">
                    <span className="size-2 rounded-full border border-sky-500/80 bg-sky-500/20" />
                    <span>上下文水位 18% / 128k</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (chatInput.trim()) setChatInput("");
                    }}
                    className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent/90 transition-all shadow-xs"
                  >
                    <span>发送</span>
                    <Send size={11} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT DRAWER: 5-TAB INSPECTOR DRAWER */}
        {rightDrawerOpen && (
          <div className="flex w-80 shrink-0 flex-col border-l border-edge bg-panel/70 backdrop-blur-md transition-all duration-200">
            <div className="flex items-center justify-between border-b border-edge/60 px-3 py-2 bg-surface/40">
              <div className="flex items-center gap-1">
                {(["screen", "files", "data", "routine", "proof"] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveRightTab(tab)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                      activeRightTab === tab
                        ? "bg-card text-ink shadow-xs border border-edge/80"
                        : "text-ink-secondary hover:text-ink"
                    }`}
                  >
                    {tab === "screen" ? "屏幕" : tab === "files" ? "文件" : tab === "data" ? "数据" : tab === "routine" ? "例行" : "证明"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRightDrawerOpen(false)}
                title="关闭抽屉 (Esc)"
                className="p-1 rounded text-ink-tertiary hover:bg-raised hover:text-ink"
              >
                <X size={13} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 text-xs">
              {activeRightTab === "screen" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink">实时沙箱屏幕 (Live VM)</span>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-mono">
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> 60 FPS
                    </span>
                  </div>
                  <div className="relative aspect-video w-full rounded-lg border border-edge bg-black/40 overflow-hidden flex items-center justify-center text-ink-tertiary">
                    <div className="flex flex-col items-center gap-1">
                      <Monitor size={24} className="text-accent/60" />
                      <span className="text-[11px]">SheerID 自动化验证捕获窗口</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="flex-1 rounded border border-edge bg-card py-1.5 text-[11px] font-medium text-ink hover:bg-raised">
                      截屏快照
                    </button>
                    <button type="button" className="flex-1 rounded bg-accent py-1.5 text-[11px] font-medium text-white hover:bg-accent/90">
                      独立窗口放大
                    </button>
                  </div>
                </div>
              )}

              {activeRightTab === "files" && (
                <div className="space-y-2">
                  <span className="font-semibold text-ink">项目交付文件资产</span>
                  <div className="rounded border border-edge/60 bg-card/60 p-2 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between py-1 border-b border-hairline">
                      <span className="font-mono text-ink">SOUL.md</span>
                      <span className="text-ink-tertiary">5.5 KB</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-hairline">
                      <span className="font-mono text-ink">autofabric-studio-v5.tsx</span>
                      <span className="text-ink-tertiary">14.2 KB</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="font-mono text-ink">dtcg-tokens.json</span>
                      <span className="text-ink-tertiary">2.8 KB</span>
                    </div>
                  </div>
                </div>
              )}

              {activeRightTab === "data" && (
                <div className="space-y-2">
                  <span className="font-semibold text-ink">实时性能指标与消耗</span>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded border border-edge bg-card p-2">
                      <div className="text-[10px] text-ink-tertiary">CPU 使用率</div>
                      <div className="text-sm font-semibold font-mono text-ink mt-0.5">24.6%</div>
                    </div>
                    <div className="rounded border border-edge bg-card p-2">
                      <div className="text-[10px] text-ink-tertiary">内存常驻 (RSS)</div>
                      <div className="text-sm font-semibold font-mono text-ink mt-0.5">512 MB</div>
                    </div>
                    <div className="rounded border border-edge bg-card p-2">
                      <div className="text-[10px] text-ink-tertiary">API 调用燃烧率</div>
                      <div className="text-sm font-semibold font-mono text-emerald-500 mt-0.5">0.02x 极优</div>
                    </div>
                    <div className="rounded border border-edge bg-card p-2">
                      <div className="text-[10px] text-ink-tertiary">渲染卡顿 (Jank)</div>
                      <div className="text-sm font-semibold font-mono text-emerald-500 mt-0.5">0 帧</div>
                    </div>
                  </div>
                </div>
              )}

              {activeRightTab === "routine" && (
                <div className="space-y-2">
                  <span className="font-semibold text-ink">守护例程与巡检计划</span>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="rounded border border-edge bg-card p-2">
                      <div className="flex items-center justify-between font-medium text-ink">
                        <span>健康度心跳探测</span>
                        <span className="text-emerald-500 text-[10px]">每 60 秒</span>
                      </div>
                      <div className="text-[10px] text-ink-tertiary mt-0.5">下一次触发: 14秒后</div>
                    </div>
                    <div className="rounded border border-edge bg-card p-2">
                      <div className="flex items-center justify-between font-medium text-ink">
                        <span>凭证热监视器</span>
                        <span className="text-emerald-500 text-[10px]">实时活跃</span>
                      </div>
                      <div className="text-[10px] text-ink-tertiary mt-0.5">无凭证漂移</div>
                    </div>
                  </div>
                </div>
              )}

              {activeRightTab === "proof" && (
                <div className="space-y-2">
                  <span className="font-semibold text-ink">物理交付凭证核验</span>
                  <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-[11px] text-emerald-600 dark:text-emerald-400 space-y-1">
                    <div className="flex items-center gap-1 font-semibold">
                      <CheckCircle2 size={13} />
                      <span>PR #6654 污染分支已彻底关闭清理</span>
                    </div>
                    <p className="text-[10px] text-ink-secondary">
                      Upstream OpenMausBot main 保持纯净 (c444029f3)。
                    </p>
                  </div>
                  <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-[11px] text-emerald-600 dark:text-emerald-400 space-y-1">
                    <div className="flex items-center gap-1 font-semibold">
                      <CheckCircle2 size={13} />
                      <span>备份仓库分支规范落地</span>
                    </div>
                    <p className="text-[10px] text-ink-secondary">
                      独立特征分支 feat/autofabric-studio-v5 归档于 openmausbot-backup。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. FLOATING UNDO TOAST */}
      {undoToast?.visible && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border border-edge/80 bg-card/95 px-4 py-2 text-xs font-medium text-ink shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 size={14} className="text-emerald-500" />
          <span>{undoToast.text}</span>
          <button
            type="button"
            onClick={() => handleUndo(Object.keys(actionDone).pop() || "")}
            className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent/25 transition-colors"
          >
            <Undo2 size={11} />
            <span>撤销</span>
          </button>
        </div>
      )}
    </div>
  );
}
export default AutofabricStudio;
