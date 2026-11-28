---
name: social-media-painpoint-radar
description: "海外社媒（Reddit 与 X/Twitter）真实需求、差评避坑与 30 天突增信号挖掘技能。内置负向痛点词表、付费意愿意图识别、时间窗切片过滤与水军脱水裁决。"
---

# Social Media Painpoint & Trend Radar (Reddit & X)

针对海外市场（Reddit 与 X/Twitter）开展高信噪比的需求捕捉、痛点挖掘与趋势分析。

## 1. 痛点词与付费意图词库 (Painpoint & Intent Lexicon)

检索与过滤必须组合以下正交词表：

### A. 痛点与避坑关键词 (Painpoint Lexicon)
- 摩擦与抱怨: `frustrating`, `frustrated`, `nightmare`, `hate`, `terrible`, `sucks`, `annoying`, `clunky`
- 寻求替代品: `alternative to`, `switch from`, `looking for a replacement`, `better than`, `migrating from`
- 定价与商业槽点: `expensive`, `pricing`, `overpriced`, `hidden fee`, `price hike`, `subscription fatigue`
- 功能缺陷: `broken`, `workaround`, `buggy`, `lacks`, `missing feature`, `can't believe it doesn't support`

### B. 强烈购买与付费意愿词表 (Buying Intent)
- `willing to pay`, `shut up and take my money`, `recommend a tool for`, `need software that`, `budget for`, `what's the best tool to`

## 2. 时间窗与去噪四段法

1. **精确切片 (30-Day Window)**:
   - 过滤 `created_at >= NOW - 30d`，聚焦当期发酵的问题与版本退化点。
2. **水军与公关脱水 (Anti-Astroturfing)**:
   - 剔除 Affiliate 佣金链接（如包含 `amzn.to`, `utm_medium=affiliate` 等）。
   - 剔除自推作者：如贴文包含 `I built a tool`, `Check out my product`，且无实质负向讨论。
   - 评论/点赞比阈值：保留 `num_comments >= 3` 或真实讨论热度贴文。
3. **痛点烈度评分 (Pain Score Index)**:
   - `Pain Score = (Engagement Weight) * (Negative Term Count + Intent Weight)`
   - 优先提取高点赞、高评论、带有强烈情绪的踩坑案例。
4. **结构化萃取**:
   - 输出：用户原始诉求 -> 遭遇摩擦/竞品缺陷 -> 现有临时 Workaround -> 商业切入机会。
