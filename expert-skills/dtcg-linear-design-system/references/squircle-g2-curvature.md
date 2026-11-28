# G2 连续超椭圆曲率与亚像素光学居中算法 (Squircle G2 Curvature & Optical Alignment)

## 1. 为什么弃用 CSS 标准 border-radius
- CSS 标准 `border-radius` 本质是**圆弧切线拼接**：直边到圆弧处曲率由 $0$ 瞬间阶跃为 $\frac{1}{R}$（$C^1$ 连续，但曲率 $C^2$ 不连续）。在人眼感知中，衔接处会呈现出明显的“折痕点”或微弱顿挫感。
- **G2 连续曲率超椭圆 (Squircle / Lamé Curve)**：
  $$\left|\frac{x}{a}\right|^r + \left|\frac{y}{b}\right|^r = 1$$
  当指数 $r \approx 4.0 \sim 5.0$ 时，曲率从直线平滑递增至顶点，曲率导数连续，呈现 Apple / Dieter Rams 硬件工业品级别的温润一体感。

## 2. 亚像素重心补偿算法 (Optical Area Moment Alignment)
几何中心与视觉重心的偏离度会导致图标“看起来没对齐”（典型如播放三角按键、向右箭头）。
- 几何边界框中心: $(x_{\text{bbox}}, y_{\text{bbox}}) = (\frac{w}{2}, \frac{h}{2})$
- 面积微元重心坐标:
  $$\bar{x} = \frac{1}{A} \iint_\Omega x \, dx dy, \quad \bar{y} = \frac{1}{A} \iint_\Omega y \, dx dy$$
- 光学偏移量补正:
  $$\Delta x_{\text{optical}} = (x_{\text{bbox}} - \bar{x}) \cdot \omega_c$$
  其中 $\omega_c \approx 0.618$ 为视觉感知补偿系数。

```typescript
export function generateSquircleSvgPath(width: number, height: number, radius: number): string {
  // 基于三次贝塞尔平滑逼近 G2 连续曲率超椭圆
  const p = Math.min(width, height) / 2;
  const r = Math.min(radius, p);
  const c = 0.551915024494 * r; // 经典标准切线系数
  // G2 扩展插值: 将控制点向外延伸 12% 消除曲率阶跃
  const g2 = c * 1.12; 

  return `
    M 0,${r}
    C 0,${r - g2} ${r - g2},0 ${r},0
    L ${width - r},0
    C ${width - r + g2},0 ${width},${r - g2} ${width},${r}
    L ${width},${height - r}
    C ${width},${height - r + g2} ${width - r + g2},${height} ${width - r},${height}
    L ${r},${height}
    C ${r - g2},${height} 0,${height - r + g2} 0,${height - r}
    Z
  `.replace(/\s+/g, ' ').trim();
}
```
