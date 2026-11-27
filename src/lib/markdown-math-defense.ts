import katex from "katex";
import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic";
import remarkMath from "remark-math";

/**
 * 软件架构师《四层渲染防腐架构规范 (v1.0)》核心实现
 *
 * L1: 流式分块状态机 (StreamingBlockSplitter) — 单 $ 绝不跨行，不参与块切分
 * L2: 词法准入防腐层 (StrictMathExtension / micromark) — 同行闭合、<=240字符、边界守门、CJK熔断、括号平衡
 * L3: AST 阶段门禁 (remarkMathGuard) — 超长或非法控制符原地退化为 text
 * L4: KaTeX 零红字沙箱 (rehypeSafeKatex) — 仅执行一次 throwOnError:true，严禁二次调用，零红字降级
 */

// 1. CJK 与 LaTeX 语法工具函数
export const CJK_REGEX = /[\u4e00-\u9fa5\u3000-\u303f\uff01-\uff5e\u3400-\u4dbf]/;
const LEGAL_TEXT_MACROS = new Set([
  "text",
  "mathrm",
  "mbox",
  "operatorname",
  "textbf",
  "textit",
  "textrm",
  "textsf",
  "texttt",
  "textnormal",
]);

/**
 * 检查公式中是否含有未被合法文本宏包裹的 CJK 字符
 */
export function hasIllegalCJK(text: string): boolean {
  if (!CJK_REGEX.test(text)) return false;
  let i = 0;
  let braceDepth = 0;
  const macroStack: number[] = [];

  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
      let macro = "";
      while (i < text.length && /[a-zA-Z]/.test(text[i]!)) {
        macro += text[i];
        i++;
      }
      if (LEGAL_TEXT_MACROS.has(macro)) {
        while (i < text.length && /\s/.test(text[i]!)) i++;
        if (text[i] === "{") {
          braceDepth++;
          macroStack.push(braceDepth);
          i++;
        }
      }
      continue;
    }
    if (ch === "{") {
      braceDepth++;
    } else if (ch === "}") {
      if (macroStack.length > 0 && macroStack[macroStack.length - 1] === braceDepth) {
        macroStack.pop();
      }
      braceDepth--;
    } else if (CJK_REGEX.test(ch)) {
      if (macroStack.length === 0) {
        return true;
      }
    }
    i++;
  }
  return false;
}

/**
 * 检查公式中非转义的花括号是否严格平衡（最终为0且过程中非负）
 */
export function isBracesBalanced(text: string): boolean {
  let depth = 0;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/**
 * L2: 词法准入扩展 (StrictMathExtension)
 */
function isLineEnding(code: number | null): boolean {
  return code === null || code === -5 || code === -4 || code === -3 || code === 10 || code === 13;
}

function isDigit(code: number | null): boolean {
  return code !== null && code >= 48 && code <= 57;
}

export function createStrictMathText(options: { singleDollarTextMath?: boolean } = {}) {
  const single = options.singleDollarTextMath ?? true;

  return {
    tokenize(effects: any, ok: any, nok: any) {
      let sizeOpen = 0;
      let sizeClose = 0;
      let token: any;
      let prevCode: number | null = null;
      const contentChars: number[] = [];
      let braceDepth = 0;
      let isEscaped = false;

      return start;

      function start(code: number | null) {
        effects.enter("mathText");
        effects.enter("mathTextSequence");
        return sequenceOpen(code);
      }

      function sequenceOpen(code: number | null) {
        if (code === 36) {
          effects.consume(code);
          sizeOpen++;
          return sequenceOpen;
        }

        if (sizeOpen < 2 && !single) {
          return nok(code);
        }

        // Opener 检查：单 $ 后严禁紧跟空白（空格、Tab、换行）或 EOF
        if (sizeOpen === 1) {
          if (code === 32 || code === 9 || isLineEnding(code)) {
            return nok(code);
          }
        }

        effects.exit("mathTextSequence");
        return between(code);
      }

      function between(code: number | null): any {
        if (code === null) {
          return nok(code);
        }

        // 单 $ 严格同行闭合：遇到换行立即 nok
        if (sizeOpen === 1 && isLineEnding(code)) {
          return nok(code);
        }

        if (code === 36) {
          token = effects.enter("mathTextSequence");
          sizeClose = 0;
          return sequenceClose(code);
        }

        // 长度上限门禁：单行公式内容不得超过 240 字符
        if (sizeOpen === 1 && contentChars.length > 240) {
          return nok(code);
        }

        // 括号与转义状态跟踪
        if (isEscaped) {
          isEscaped = false;
        } else if (code === 92) {
          isEscaped = true;
        } else if (code === 123) {
          braceDepth++;
        } else if (code === 125) {
          braceDepth--;
          if (braceDepth < 0) return nok(code);
        }

        contentChars.push(code);
        prevCode = code;

        if (code === 32) {
          effects.enter("space");
          effects.consume(code);
          effects.exit("space");
          return between;
        }

        if (isLineEnding(code)) {
          effects.enter("lineEnding");
          effects.consume(code);
          effects.exit("lineEnding");
          return between;
        }

        effects.enter("mathTextData");
        return data(code);
      }

      function data(code: number | null): any {
        if (code === null || code === 32 || code === 36 || isLineEnding(code)) {
          effects.exit("mathTextData");
          return between(code);
        }

        if (sizeOpen === 1 && contentChars.length > 240) {
          effects.exit("mathTextData");
          return nok(code);
        }

        if (isEscaped) {
          isEscaped = false;
        } else if (code === 92) {
          isEscaped = true;
        } else if (code === 123) {
          braceDepth++;
        } else if (code === 125) {
          braceDepth--;
          if (braceDepth < 0) {
            effects.exit("mathTextData");
            return nok(code);
          }
        }

        contentChars.push(code);
        prevCode = code;
        effects.consume(code);
        return data;
      }

      function sequenceClose(code: number | null): any {
        if (code === 36) {
          effects.consume(code);
          sizeClose++;
          return sequenceClose;
        }

        if (sizeClose === sizeOpen) {
          // Closer 边界门禁（单 $）：
          if (sizeOpen === 1) {
            // 1. 闭合前严禁为空白
            if (prevCode === 32 || prevCode === 9) {
              token.type = "mathTextData";
              return data(code);
            }
            // 2. 闭合时括号必须平衡
            if (braceDepth !== 0) {
              return nok(code);
            }
            // 3. CJK 熔断：公式文本中出现的汉字必须在文本宏内
            const contentStr = String.fromCharCode(...contentChars);
            if (hasIllegalCJK(contentStr)) {
              return nok(code);
            }
            // 4. 闭合 $ 之后严禁紧跟数字（防 $1,500 与 $2,000 错配）
            if (isDigit(code)) {
              token.type = "mathTextData";
              return data(code);
            }
          }

          effects.exit("mathTextSequence");
          effects.exit("mathText");
          return ok(code);
        }

        token.type = "mathTextData";
        return data(code);
      }
    },
    resolve(events: any) {
      let tailExitIndex = events.length - 4;
      let headEnterIndex = 3;
      let index: number;
      let enter: number | undefined;

      if (
        (events[headEnterIndex][1].type === "lineEnding" || events[headEnterIndex][1].type === "space") &&
        (events[tailExitIndex][1].type === "lineEnding" || events[tailExitIndex][1].type === "space")
      ) {
        index = headEnterIndex;
        while (++index < tailExitIndex) {
          if (events[index][1].type === "mathTextData") {
            events[tailExitIndex][1].type = "mathTextPadding";
            events[headEnterIndex][1].type = "mathTextPadding";
            headEnterIndex += 2;
            tailExitIndex -= 2;
            break;
          }
        }
      }

      index = headEnterIndex - 1;
      tailExitIndex++;
      while (++index <= tailExitIndex) {
        if (enter === undefined) {
          if (index !== tailExitIndex && events[index][1].type !== "lineEnding") {
            enter = index;
          }
        } else if (index === tailExitIndex || events[index][1].type === "lineEnding") {
          events[enter][1].type = "mathTextData";
          if (index !== enter + 2) {
            events[enter][1].end = events[index - 1][1].end;
            events.splice(enter + 2, index - enter - 2);
            tailExitIndex -= index - enter - 2;
            index = enter + 2;
          }
          enter = undefined;
        }
      }
      return events;
    },
    previous(this: any, code: number | null): boolean {
      return code !== 36 || this.events[this.events.length - 1][1].type === "characterEscape";
    },
    name: "mathText",
  };
}

/**
 * L2: 词法准入 remark 插件：挂载 StrictMathExtension
 */
export function remarkStrictMath(this: any, options: any = {}) {
  remarkMath.call(this, options);

  const data = this.data();
  const extensions = data.micromarkExtensions || [];
  for (const ext of extensions) {
    if (ext && ext.text && ext.text[36]) {
      ext.text[36] = createStrictMathText(options);
    }
  }
}

/**
 * L3: AST 阶段门禁 (remarkMathGuard)
 */
function walkMdast(node: any, parent: any, visitor: (node: any, parent: any) => void) {
  if (!node) return;
  visitor(node, parent);
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      walkMdast(child, node, visitor);
    }
  }
}

export function remarkMathGuard() {
  return (tree: any) => {
    walkMdast(tree, null, (node: any, _parent: any) => {
      if (node.type === "inlineMath" || node.type === "math") {
        const val = typeof node.value === "string" ? node.value : "";
        const isInline = node.type === "inlineMath";
        let invalid = false;

        // 1. 长度门禁
        if (isInline && val.length > 240) invalid = true;
        if (!isInline && val.length > 5000) invalid = true;

        // 2. 括号平衡门禁
        if (!invalid && !isBracesBalanced(val)) invalid = true;

        // 3. CJK 汉字合法性门禁
        if (!invalid && hasIllegalCJK(val)) invalid = true;

        // 4. 控制字符门禁
        // oxlint-disable-next-line no-control-regex
        if (!invalid && /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(val)) invalid = true;

        if (invalid) {
          node.type = "text";
          node.value = isInline ? `$${val}$` : `$$\n${val}\n$$`;
          delete node.data;
        }
      }
    });
  };
}

/**
 * L4: KaTeX 零红字沙箱 (rehypeSafeKatex)
 */
function hastToText(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.value || "";
  if (Array.isArray(node.children)) {
    return node.children.map(hastToText).join("");
  }
  return "";
}

function walkHast(node: any, parents: any[], visitor: (element: any, parents: any[]) => void) {
  if (!node) return;
  if (node.type === "element") {
    visitor(node, parents);
  }
  if (Array.isArray(node.children)) {
    const nextParents = [...parents, node];
    for (const child of node.children) {
      walkHast(child, nextParents, visitor);
    }
  }
}

export function rehypeSafeKatex(options: any = {}) {
  return (tree: any) => {
    walkHast(tree, [], (element: any, parents: any[]) => {
      const classes = Array.isArray(element.properties?.className)
        ? element.properties.className
        : [];
      const languageMath = classes.includes("language-math");
      const mathDisplay = classes.includes("math-display");
      const mathInline = classes.includes("math-inline");

      if (!languageMath && !mathDisplay && !mathInline) return;

      let displayMode = mathDisplay;
      let targetNode = element;
      let parent = parents[parents.length - 1];

      if (
        element.tagName === "code" &&
        languageMath &&
        parent?.tagName === "pre"
      ) {
        targetNode = parent;
        parent = parents[parents.length - 2];
        displayMode = true;
      }

      if (!parent || !Array.isArray(parent.children)) return;

      const idx = parent.children.indexOf(targetNode);
      if (idx === -1) return;

      const value = hastToText(targetNode);
      let html: string | null = null;

      try {
        html = katex.renderToString(value, {
          ...options,
          displayMode,
          throwOnError: true,
        });
      } catch {
        html = null;
      }

      if (html !== null) {
        const root = fromHtmlIsomorphic(html, { fragment: true });
        parent.children.splice(idx, 1, ...root.children);
      } else {
        const fallbackNode = displayMode
          ? {
              type: "element",
              tagName: "pre",
              properties: {
                className: ["katex-fallback-block", "font-mono", "text-inherit", "my-2", "overflow-x-auto"],
              },
              children: [{ type: "text", value: `$$\n${value}\n$$` }],
            }
          : {
              type: "element",
              tagName: "span",
              properties: {
                className: ["katex-fallback", "font-mono", "text-inherit"],
              },
              children: [{ type: "text", value: `$${value}$` }],
            };
        parent.children.splice(idx, 1, fallbackNode);
      }
    });
  };
}
