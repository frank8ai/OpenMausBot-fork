---
name: dtcg-linear-design-system
description: "面向体验设计师 (Design Engineer) 的硅谷 0.001% 顶尖设计工程系统：连续物理弹簧动力学(RK4 Spring)、G2超椭圆连续曲率、推测性意图计算(0ms感官延迟)、W3C DTCG 3 层 Token 与 9 大 UI 状态全生命周期防御引擎。"
---

# DTCG Linear Design System & 0.001% Apex Physics Engine (顶尖体验设计工程系统)

## 1. 核心定位与 0.001% 物理设计哲学 (Core Mission & Apex Tenets)

本技能专为**前端体验与视觉设计专家 (Design Engineer)** 打造，全面对齐硅谷 Top 0.001% 宗师级标准（Rauno Freiberg / Paco Coursey / Emil Kowalski 级微交互手感与工程严密性）。彻底超越“静态切图”与“离散 CSS 贝塞尔曲线过渡”，进入**连续物理动力学、光学几何补偿与推测性零感知延迟**的物理工程造物层。

### 四大不可逾越的 0.001% 物理工程准则
1. **连续物理动力学与动量连续性 (Continuous Physics & Velocity Transfer)**:
   - 彻底废除离散的 `cubic-bezier` 与固定时长过渡；
   - 微交互基于二阶阻尼简谐振子常微分方程，采用四阶龙格-库塔 (RK4) 或闭式解析解求解；
   - 交互随时可被用户手势或新事件打断 (Interruptible)，当前位移与初速度无缝继承，保证加速度曲线 $C^2$ 连续，消除任何视觉阶跃。
2. **G2 连续超椭圆曲率与亚像素光学居中 (G2 Squircle & Optical Alignment)**:
   - 弃用导致曲率阶跃断裂的传统 CSS 圆角，核心交互容器使用 G2 连续超椭圆曲率 (Squircle, $r \approx 4.5$)；
   - 对非对称图标与视觉元素，依据面积微元矩积分计算物理重心，实施亚像素级光学视错觉补正。
3. **推测性意图计算与零感知延迟 (Speculative Intent UI & 0ms Latency)**:
   - 追踪光标瞬时速度矢量 $\vec{v}(t)$ 与运动锥体，提前 60~100ms 预测用户交互落焦点；
   - 在落焦点命中判定瞬时，推测性预热合成层并完成数据预取，将实际触达延迟降至物理零感。
4. **W3C DTCG 三层 Token 与 9 大 UI 状态全防御矩阵 (DTCG Tokens & 9-State Defense)**:
   - 严格落实 Global -> Semantic -> Component 三层 Token 契约，100% 依托 Tailwind v4 OKLCH 原生色域；
   - 每一个交付组件必须闭合 9 大状态，1:1 等高骨架屏确保累积布局偏移 CLS 严格为 0.000。

---

## 2. 9 大 UI 状态全防御矩阵 (The 9-State Full Lifecycle Contract)

| 状态 | 规范要求 | 验收红线 |
|---|---|---|
| **1. Initial** | 挂载前无闪烁微占位，预分配渲染容器尺寸 | 零白屏、零尺寸抖动 |
| **2. Loading** | 1:1 等高骨架屏 (Skeleton)，脉冲缓动 1.5s 周期 | CLS 严格等于 0.000 |
| **3. Empty** | 说明为空客观原因 + 唯一主行动按钮 (CTA) | 严禁无引导裸空屏 |
| **4. Partial** | 渐进式流式披露已到达数据碎片 | 平滑淡入，无几何突跳 |
| **5. Success** | 完整就绪视觉呈现，信息层级分明，聚焦清晰 | 焦点分支 $\le 1$ |
| **6. Warning** | 边缘态降级预警与服务降级提示 | 提示明确，不阻塞主任务 |
| **7. Error** | 人性化描述故障根因 + 原地重试 (Retry) 机制 | 严禁暴露底层技术堆栈 |
| **8. Disabled** | 灰度与不可点击，浮动 Tooltip 说明解锁条件 | 禁用原因必须可解释 |
| **9. Optimistic** | 16ms 内瞬时完成状态反转，异常时静默回滚支持撤销 | 破坏性操作配 Undo 撤销 |

---

## 3. 0.001% 微光学与物理阴影矩阵 (Harmonic Falloff Shadows)

严禁使用单层模糊阴影，必须采用符合反平方光强衰减的 4 阶谐波层叠阴影：
```css
/* 4-Tier Harmonic Ambient Shadow Matrix */
--shadow-apex-surface: 
  0 1px 1px oklch(0 0 0 / 0.05),              /* 1. 亚像素接触阴影 (Contact) */
  0 2px 4px -1px oklch(0 0 0 / 0.07),         /* 2. 近场半影 (Near-field Penumbra) */
  0 8px 24px -4px oklch(0 0 0 / 0.10),        /* 3. 远场环境光晕 (Far-field Ambient) */
  inset 0 1px 0 0 oklch(1 0 0 / 0.12);        /* 4. 倒角掠射高光 (Rim Highlight) */
```

---

## 4. 必备参考规范库 (References)
- [`references/continuous-spring-rk4.md`](./references/continuous-spring-rk4.md)：四阶龙格-库塔物理弹簧算法与动量继承。
- [`references/squircle-g2-curvature.md`](./references/squircle-g2-curvature.md)：G2 连续超椭圆与光学居中。
- [`references/speculative-cursor-predictor.md`](./references/speculative-cursor-predictor.md)：光标运动轨迹意图预测引擎。
- [`references/subpixel-shader-optics.md`](./references/subpixel-shader-optics.md)：亚像素着色器与微漫反射材质。
- [`references/w3c-dtcg-token-hierarchy.md`](./references/w3c-dtcg-token-hierarchy.md)：DTCG 三层 Token 标准契约。
- [`references/nine-ui-states-defense.md`](./references/nine-ui-states-defense.md)：9 大状态防御判定准则。
