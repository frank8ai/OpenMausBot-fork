# 推测性意图计算与零延迟光标追踪系统 (Speculative Intent UI & Vector Prediction)

## 1. 核心原理
人类肌肉动作与机械移动遵循最小晃动加速度曲线 (Minimum-jerk trajectory)。光标在目标落焦前的 50~120ms 已经形成确定的矢量运动锥体 (Trajectory Cone)。
- 传统 UI：鼠标 hover 触发 CSS 动画或请求 (延迟 150ms~300ms)。
- **Top 0.001% 推测性 UI**：
  1. 采样光标最后 3 个坐标点与时间戳，计算瞬时速度矢量 $\vec{v}(t) = \frac{\Delta \vec{p}}{\Delta t}$ 与加速度 $\vec{a}(t)$；
  2. 构造预测射线 $\mathbf{R}(t) = \vec{p}(t) + \vec{v}(t) \cdot \tau + \frac{1}{2} \vec{a}(t) \tau^2$，展望时间 $\tau \approx 60\text{ms} \sim 100\text{ms}$；
  3. 计算射线与交互目标视口包围盒 (AABB) 的碰撞相交测试；
  4. 碰撞判定通过瞬间：预激活 GPU 渲染管线合成层、发起数据预取 (Prefetch)、推测性预热 DOM 状态机。
  5. 当用户真实指针悬停时，感知延迟为绝对零 (0ms)。

```typescript
export class SpeculativeIntentTracker {
  private lastPoints: Array<{ x: number; y: number; t: number }> = [];

  public recordPointerMove(x: number, y: number): void {
    const now = performance.now();
    this.lastPoints.push({ x, y, t: now });
    if (this.lastPoints.length > 5) this.lastPoints.shift();
  }

  public willIntersectTarget(rect: DOMRect, lookaheadMs = 80): boolean {
    if (this.lastPoints.length < 2) return false;
    const p1 = this.lastPoints[this.lastPoints.length - 2];
    const p2 = this.lastPoints[this.lastPoints.length - 1];
    const dt = p2.t - p1.t;
    if (dt <= 0) return false;

    const vx = (p2.x - p1.x) / dt;
    const vy = (p2.y - p1.y) / dt;
    const speed = Math.hypot(vx, vy);
    if (speed < 0.15) return false; // 忽略静止微抖动

    const predictedX = p2.x + vx * lookaheadMs;
    const predictedY = p2.y + vy * lookaheadMs;

    return (
      predictedX >= rect.left - 10 &&
      predictedX <= rect.right + 10 &&
      predictedY >= rect.top - 10 &&
      predictedY <= rect.bottom + 10
    );
  }
}
```
