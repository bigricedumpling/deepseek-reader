# 随包资产与许可记录

项目源代码采用 MIT；第三方依赖与资产保留各自许可，并不因打包而变为 MIT。

| 资产 | 来源 | 随包许可 |
| --- | --- | --- |
| 葛饰北斋《骏州江尻》封面 | [纽约大都会艺术博物馆，JP2953](https://www.metmuseum.org/art/collection/search/55735) | 馆方以 [CC0](https://www.metmuseum.org/hubs/open-access) 开放公版图像。随包出处及裁切说明见 `licenses/Met-Ejiri.txt`。 |
| Noto Sans SC | Google Fonts / @fontsource/noto-sans-sc | 插件使用 `fonts/Noto-Sans-SC-LICENSE.txt`。产品介绍页使用 Noto Sans SC 可变字体子集，许可见 `site/public/fonts/Noto-Sans-SC-LICENSE.txt`。两者均采用 SIL OFL 1.1。 |
| Noto Serif SC | Google Fonts / @fontsource/noto-serif-sc | `fonts/Noto-Serif-SC-LICENSE.txt`，SIL OFL 1.1 |
| 寒蝉楷书 ChillKai | https://github.com/Warren2060/Chillkai | `fonts/ChillKai-LICENSE.txt`，SIL OFL 1.1 |
| HarmonyOS Sans | 华为官方字体。源码仓库在 `public/fonts/` 中保留原版字体，插件和产品介绍页可使用设备上已安装的版本。 | `public/fonts/HarmonyOS-Sans-LICENSE.txt`。随软件分发原版字体须保留协议与许可声明。 |
| TeX Gyre Pagella | GUST / TeX Gyre | `fonts/GUST-FONT-LICENSE.txt` |
| PDF.js、CMap、标准字体与 WASM | pdfjs-dist / Mozilla PDF.js | `pdfjs/LICENSE` 与各资产目录的上游许可 |
| Remix Icon 4.9.1 | https://remixicon.com | `licenses/RemixIcon-LICENSE.txt`；用于功能性 UI 图标，不作为产品品牌标识 |
| Phosphor Icons（@phosphor-icons/core 2.1.1） | https://phosphoricons.com | MIT；只取 regular / fill 路径生成 `phosphor-core.js`（首屏常用）和 `phosphor-paths.js`（选择器完整表，按需加载），UI 图标仍为 Remix |
| [Nucleo Glass Essential](https://nucleoapp.com/svg-glass-icons) | Nucleo，248 枚 | `icons/glass/COPYRIGHT.txt` |
| [Nucleo Isometric](https://nucleoapp.com/svg-isometric-icons) 和 [SVG Arcade](https://nucleoapp.com/svg-arcade-icons) | Nucleo，分别为 141 枚和 570 枚 | `icons/nucleo/COPYRIGHT.txt` |

Nucleo 图标经授权随 Typocket 分发，供用户在产品内选择。图标著作权归 Nucleo，项目的 MIT 许可仅适用于项目代码。独立再分发这些图标需获得 Nucleo 的许可。

插件安装包和产品介绍页均不附带微信字体（`Weixin.otf`）。依赖的完整版本见 `package-lock.json`。
