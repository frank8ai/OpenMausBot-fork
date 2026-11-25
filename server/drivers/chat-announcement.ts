import { blankCode } from "../../shared/skill-command.ts";

export interface DispatchClaimVerdict {
  readonly claimed: boolean;
  readonly matchedEvidence: string | null;
  readonly reason?: string;
  readonly claims: readonly string[];
}

const DISPATCH_CONDITIONAL_OR_QUESTION_GUARD =
  /(?:待(?:您|你)(?:确认|批准|授权)后?(?:派发|调度|执行)?|等待(?:您|你)(?:确认|批准|授权)|需要(?:您|你)先(?:确认|批准|授权)|是否需要我(?:派发|调度|呼叫)|(?:要不要|需不需要|需要我)(?:派发|调度|呼叫)|\bwait(?:ing)?\s+for\s+(?:your\s+)?(?:confirmation|approval)\b)/ui;

const DISPATCH_NEGATIVE_GUARD =
  /(?:未(?:能|实际|曾)?(?:派发|呼叫|下发|调度|拉起|唤醒|触发)|未能即时触发|尚?未派发|无法(?:派发|呼叫|下发|调度|拉起|唤醒|触发)|暂停(?:派发|调度)|暂不(?:派发|调度)|待(?:您|你)(?:确认|批准|授权)后?(?:派发|调度|执行)?|等待(?:您|你)(?:确认|批准|授权)|需要(?:您|你)先(?:确认|批准|授权)|是否需要我(?:派发|调度|呼叫)|(?:要不要|需不需要|需要我)(?:派发|调度|呼叫)|\b(?:not|could not|cannot|unable to|failed to|won't|will not|never)\s+(?:be\s+)?(?:dispatched|delegated|assigned)\b|\bwait(?:ing)?\s+for\s+(?:your\s+)?(?:confirmation|approval)\b)/ui;

const DISPATCH_CLAIM_PATTERNS: readonly RegExp[] = [
  // 1) 反引号/方括号流水线进度条中的进行中派发态（不走 blankCode）
  /\[[^\]\n]{0,48}(?:派发中|整改派发|介入中|复审中|复核中|质检中|修复[^\n\]]{0,16}中|双轨推进|已派发|已下发|已启动|已调度|无头执行|触发\s*Rework[^\n\]]{0,24}|派发[^\n\]]{0,24}|调度[^\n\]]{0,24})[^\]\n]{0,24}[⚙️⏳🚀]/u,
  // 2) 中文完成态 / 进行态 / 将来态主动派发声明（搭配专家角括号、线程号或工单词）
  /(?:已(?:正式|立即|同步|并发|补充|紧急|无缝|重新|全面)?|正在(?:为您)?|立即(?:切换|启动|触发)?)(?:派发|呼叫|下发|调度|安排|指派|唤醒|拉起|协调|打回|触发\s*Rework|切换为)[^\n。！？]{0,40}(?:【[^】\n]{2,16}】|线程|工单|Brief|AutoFabric|自动工厂|返修|整改|复审|验收|介入|底座|无头执行|#[^\s\n]{2,30})/u,
  // 3) 英文主动派发声明
  /\b(?:dispatched|delegated|assigned|escalated|handed off|spawning|dispatching)\b[^\n.!?]{0,60}\b(?:to|agent|bot|thread|architect|reviewer|developer|qa)\b/i,
];

export function detectUnverifiedDispatchClaim(text: string): DispatchClaimVerdict {
  const raw = text.trim();
  if (!raw) {
    return { claimed: false, matchedEvidence: null, reason: undefined, claims: [] };
  }
  // 1. 必须先剥离多行围栏代码块（```...```），防止示例代码/日志中的否定词或派发词干扰
  const withoutFences = raw.replace(/```[\s\S]*?```/g, "");

  const claims: string[] = [];

  // 2. 逐行与逐句分析，否定守卫仅作用于包含否定词的同一行/同一语句，避免全局短路放行整篇文本
  const lines = withoutFences.split(/\r?\n/);
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // A. 提取并剥离行内进度条徽章 (Pattern 0)，避免徽章内部文本被后续普通语句规则重复计数
    let lineWithoutBadges = trimmedLine;
    let badgeMatch: RegExpExecArray | null;
    while ((badgeMatch = DISPATCH_CLAIM_PATTERNS[0].exec(lineWithoutBadges)) !== null) {
      if (!DISPATCH_NEGATIVE_GUARD.test(trimmedLine)) {
        claims.push(badgeMatch[0].slice(0, 80));
      }
      lineWithoutBadges = lineWithoutBadges.slice(0, badgeMatch.index) + lineWithoutBadges.slice(badgeMatch.index + badgeMatch[0].length);
    }

    // B. 将整行剩余文本切分为句子（。！？!?；;）
    const sentences = lineWithoutBadges.split(/[。！？!?；;]+/).map((s) => s.trim()).filter(Boolean);
    for (const sentence of sentences) {
      if (DISPATCH_NEGATIVE_GUARD.test(sentence)) {
        // 条件确认/询问类守卫（如“待您确认”、“是否需要我派发”）整句放弃
        if (DISPATCH_CONDITIONAL_OR_QUESTION_GUARD.test(sentence)) {
          continue;
        }
        // 针对动作否定（如“未能派发【架构师】，已派发【全栈开发】”），细化切分子分句
        const clauses = sentence.split(/[，,]+/).map((c) => c.trim()).filter(Boolean);
        for (const clause of clauses) {
          if (DISPATCH_NEGATIVE_GUARD.test(clause)) continue;
          for (let i = 1; i < DISPATCH_CLAIM_PATTERNS.length; i++) {
            const m = DISPATCH_CLAIM_PATTERNS[i].exec(clause);
            if (m) {
              claims.push(m[0].slice(0, 80));
            }
          }
        }
        continue;
      }

      for (let i = 1; i < DISPATCH_CLAIM_PATTERNS.length; i++) {
        const m = DISPATCH_CLAIM_PATTERNS[i].exec(sentence);
        if (m) {
          claims.push(m[0].slice(0, 80));
        }
      }
    }
  }

  if (claims.length > 0) {
    const first = claims[0];
    return { claimed: true, matchedEvidence: first, reason: first, claims };
  }
  return { claimed: false, matchedEvidence: null, reason: undefined, claims: [] };
}


const CHINESE_WAIT = /(?:确认|確認|授权|授權|批准|同意|许可|許可)之?[后後]|(?:等(?:待)?|待)[你您]|(?:需要|请|請|须|須)[你您]先?(?:确认|確認|授权|授權|批准|同意)/u;

function announcesChineseAction(prose: string): boolean {
  const tail = prose.trim().split(/\n\s*\n/).at(-1)!.trim();
  if (tail.length > 400) return false;
  const opening = /^(?:(?:好的|收到)[，,。]\s*)?(?:(?:接下[来來]|下一步)[，,]?\s*)?(?:我(?:[会會将將]|先|[现現]在|[马馬]上|立刻)|[让讓]我)(?:[会會将將]|先|立即|直接|就|去|[来來]|[开開]始){0,3}\s*/u.exec(tail);
  if (!opening) return false;
  const action = tail.slice(opening[0].length);
  const match = /^(?:在[^。！？?，、\n]{1,40}?(?:里|裡|中|上))?(?:打[开開]|開啟|[读讀]取|查[询詢看找]|[检檢]查|[执執]行|[运運]行|[创創]建|生成|整理|保存|[写寫]入|搜[索尋]|[获獲]取|[调調]用|[处處]理|核[对對实實]|[制製]作|建立|更新|拉取|同步|导出|匯出|汇总|彙總|[发發]送|把[^。！？?\n]{1,160}?(?:放[到进進入]|做成|整理|保存|[写寫]入|[制製]作|生成|汇总|彙總))/u.exec(action);
  return Boolean(match && !/^[了过過完]/u.test(action.slice(match[0].length)));
}

const ACTION_VERBS = "execute|send|type|press|launch|open|check|inspect|read|fetch|run|create|write|verify|pull|look|search|navigate|load";
const ANNOUNCING_SENTENCE = new RegExp(`^(?:now,?\\s+)?(?:let me|i['\u2019]ll|i will|i(?:['\u2019]m| am) going to)\\s+(?:now\\s+)?(?:${ACTION_VERBS})\\b`, "i");

const WAITS_FOR_USER = /\b(?:after|once|when|if|until|before)\s+you\b|\bwait(?:ing)?\s+for\s+you\b/i;

function endsWithAnnouncingSentence(reply: string): boolean {
  const sentences = blankCode(reply).trim().split(/(?<=[.!])\s+/);
  if (sentences.length < 2) return false;
  const last = sentences.at(-1)!.replace(/^[*_]+/, "");
  return ANNOUNCING_SENTENCE.test(last) && !WAITS_FOR_USER.test(last);
}

export function announcesAction(text: string): boolean {
  const reply = text.trim();
  if (!reply || reply.length > 4_000 || reply.includes("?")) return false;
  if (/[？\p{Script=Han}]/u.test(reply)) {
    const prose = blankCode(text);
    if (prose.includes("？") || CHINESE_WAIT.test(prose)) return false;
    if (announcesChineseAction(prose)) return true;
  }
  if (reply.length > 400) {
    const tail = reply.split(/\n\s*\n/).at(-1)!.trim();
    return tail.length <= 400 && /^(?:let me|i['\u2019]ll|i will|i(?:['\u2019]m| am) going to)\s+(?:now\s+)?(?:execute|send|type|press|launch|open|check|inspect|read|fetch|run|create|write|verify)\b/i.test(tail);
  }
  return /(?:[:\u2014\u2013]|\.\.\.|\u2026)$/.test(reply) || endsWithAnnouncingSentence(reply) ||
    /^(?:checking|let me(?! know\b)|i'll|i will|i'm going to|i am going to|opening|pulling|looking|searching|navigating|reading|fetching|loading|now (?:i'll|let me|opening|checking|pulling|reading))\b/i.test(reply) ||
    /^i(?:['\u2019]m| am)\b[^.!?\n]*\band (?:i )?will\s+(?:launch|open|check|pull|look|search|navigate|read|fetch|load|run|inspect)\b/i.test(reply);
}
