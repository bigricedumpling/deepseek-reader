# 随包资产与许可记录

项目源代码采用 MIT；第三方依赖与资产保留各自许可，并不因打包而变为 MIT。

| 资产 | 来源 | 随包许可 |
| --- | --- | --- |
| Noto Sans SC | Google Fonts / @fontsource/noto-sans-sc | `fonts/Noto-Sans-SC-LICENSE.txt`，SIL OFL 1.1 |
| Noto Serif SC | Google Fonts / @fontsource/noto-serif-sc | `fonts/Noto-Serif-SC-LICENSE.txt`，SIL OFL 1.1 |
| 寒蝉楷书 ChillKai | https://github.com/Warren2060/Chillkai | `fonts/ChillKai-LICENSE.txt`，SIL OFL 1.1 |
| HarmonyOS Sans | 华为官方字体；应用不再内嵌，独立落地页自行使用，字形未修改（许可不允许裁剪或改动） | `fonts/HarmonyOS-Sans-LICENSE.txt`，允许与软件一起分发，须保留协议与显著声明 |
| TeX Gyre Pagella | GUST / TeX Gyre | `fonts/GUST-FONT-LICENSE.txt` |
| PDF.js、CMap、标准字体与 WASM | pdfjs-dist / Mozilla PDF.js | `pdfjs/LICENSE` 与各资产目录的上游许可 |
| Remix Icon 4.9.1 | https://remixicon.com | `licenses/RemixIcon-LICENSE.txt`；用于功能性 UI 图标，不作为产品品牌标识 |
| Phosphor Icons（@phosphor-icons/core 2.1.1） | https://phosphoricons.com | MIT；只取 regular / fill 路径生成 `phosphor-core.js`（首屏常用）和 `phosphor-paths.js`（选择器完整表，按需加载），UI 图标仍为 Remix |
| [Nucleo Glass Essential](https://nucleoapp.com/svg-glass-icons) | Nucleo，248 枚 | `icons/glass/COPYRIGHT.txt` |
| [Nucleo Isometric](https://nucleoapp.com/svg-isometric-icons) 和 [SVG Arcade](https://nucleoapp.com/svg-arcade-icons) | Nucleo，分别为 141 枚和 570 枚 | `icons/nucleo/COPYRIGHT.txt` |

Nucleo 图标经授权随 Typocket 分发，供用户在产品内选择。图标著作权归 Nucleo，项目的 MIT 许可仅适用于项目代码。独立再分发这些图标需获得 Nucleo 的许可。

旧工程中的 `Weixin.otf` 未找到可核验的再分发许可记录，当前源码、构建产物和插件包均排除该文件；页面只在用户系统已安装时使用本地字体，其他情况回退系统字体。历史交付产物不在本次变更范围。

构建与安装包测试检查 PDF 运行资产和字体许可存在，并检查私有数据未进入新包。应用首屏改用 Noto Sans SC，构建不再打包鸿蒙黑体；独立落地页仍按原样使用 HarmonyOS Sans，不适用项目的 MIT 源码许可。完整协议保留在 `fonts/HarmonyOS-Sans-LICENSE.txt`，本文件保留资产记录。依赖的完整版本以 `package-lock.json` 为准。
