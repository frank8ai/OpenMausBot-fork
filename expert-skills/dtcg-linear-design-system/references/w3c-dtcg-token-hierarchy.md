# W3C DTCG 3 层 Design Tokens 契约与 OKLCH 色彩空间

## 1. W3C DTCG 标准架构层级

Design Tokens Community Group (DTCG) 确立的行业标准包含 3 层正交结构：

```
+-----------------------------------------------------------+
| 1. Global Tokens (Primitive Layer)                        |
|    oklch(0.65 0.24 265), 14px, 16px, 4px, 8px             |
+-----------------------------------------------------------+
                            |
                            v
+-----------------------------------------------------------+
| 2. Semantic Tokens (Theme / Context Layer)                |
|    surface.canvas, text.primary, interactive.accent       |
|    (在此层完成 Light / Dark Mode 的动态主题映射)           |
+-----------------------------------------------------------+
                            |
                            v
+-----------------------------------------------------------+
| 3. Component Tokens (Scoped Layer)                        |
|    button.primary.bg, card.border.focus                   |
|    (注入组件内部 CSS Variables，与具体业务解耦)           |
+-----------------------------------------------------------+
```

---

## 2. 为什么工业界全面转向 OKLCH 色彩空间？

传统 sRGB、HEX 与 HSL 色彩空间在现代高动态范围（HDR）屏幕与工程化设计中存在严重物理缺陷：
1. **HSL 的感知不均匀性**：在 HSL 中，黄色（Hue 60）与蓝色（Hue 240）在相同 Lightness=50% 时，人眼感知到的黄色明度是蓝色的 3 倍以上，导致暗色模式下对比度极易失控。
2. **OKLCH 的感知均匀性 (Perceptually Uniform)**：
   - **L (Lightness, 0%~100%)**：物理感知明度，保证相同 L 值的颜色在人眼中拥有完全相同的亮度感知；
   - **C (Chroma, 饱和度/色度)**：从中性灰到鲜艳色彩平滑过渡；
   - **H (Hue, 色相 0~360度)**：线性色环分布，调整明度与色度时色相绝不发生“偏移变脏”。
3. **P3 宽色域原生覆盖**：OKLCH 可原生渲染现代 Apple Retina 显示器与 OLED 屏幕上更鲜艳饱和的 P3 广色域。
