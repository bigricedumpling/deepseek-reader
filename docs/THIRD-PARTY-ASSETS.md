# 随包资产与许可记录

项目源代码采用 MIT；第三方依赖与资产保留各自许可，并不因打包而变为 MIT。

| 资产 | 来源 | 随包许可 |
| --- | --- | --- |
| Noto Sans SC | Google Fonts / @fontsource/noto-sans-sc | `fonts/Noto-Sans-SC-LICENSE.txt`，SIL OFL 1.1 |
| Noto Serif SC | Google Fonts / @fontsource/noto-serif-sc | `fonts/Noto-Serif-SC-LICENSE.txt`，SIL OFL 1.1 |
| 寒蝉楷书 ChillKai | https://github.com/Warren2060/Chillkai | `fonts/ChillKai-LICENSE.txt`，SIL OFL 1.1 |
| HarmonyOS Sans | 华为官方字体；应用构建使用 WOFF2，源 TTF 保留给独立站点，字形未修改 | `fonts/HarmonyOS-Sans-LICENSE.txt`，允许与软件一起分发，须保留协议与显著声明 |
| TeX Gyre Pagella | GUST / TeX Gyre | `fonts/GUST-FONT-LICENSE.txt` |
| PDF.js、CMap、标准字体与 WASM | pdfjs-dist / Mozilla PDF.js | `pdfjs/LICENSE` 与各资产目录的上游许可 |
| Remix Icon 4.9.1 | https://remixicon.com | `licenses/RemixIcon-LICENSE.txt`；用于功能性 UI 图标，不作为产品品牌标识 |
| Phosphor Icons（@phosphor-icons/core 2.1.1） | https://phosphoricons.com | MIT；只取 regular / fill 路径生成 `src/utils/phosphor-paths.js`，用于知识库/文档的 `图标` 选择器，UI 图标仍为 Remix |
| Nucleo Glass Essential（248 枚免费集） | https://nucleoapp.com/svg-glass-icons · https://iconstore-nc.s3-us-west-2.amazonaws.com/Nucleo-Glass-Essential.zip | `icons/glass/COPYRIGHT.txt`；© Nucleo，非 MIT；试用/分发前确认 Nucleo Icons License |
| Nucleo Isometric / SVG Arcade 免费集（141 / 570 枚） | https://nucleoapp.com/svg-isometric-icons · https://nucleoapp.com/svg-arcade-icons · https://iconstore-nc.s3-us-west-2.amazonaws.com/Nucleo-Isometric.zip · https://iconstore-nc.s3-us-west-2.amazonaws.com/Nucleo-Arcade.zip | `icons/nucleo/COPYRIGHT.txt`；© Nucleo，非 MIT；使用/再分发前确认 Nucleo 免费图标许可 |

旧工程中的 `Weixin.otf` 未找到可核验的再分发许可记录，因此 0.2 新构建与插件包排除该文件；页面只在用户系统已安装时使用本地字体，其他情况回退系统字体。历史交付产物不在本次变更范围。

构建与安装包测试检查 PDF 运行资产和字体许可存在，并检查私有数据未进入新包。鸿蒙黑体随软件安装包分发，不适用项目的 MIT 源码许可；完整协议随字体文件保留在 `fonts/HarmonyOS-Sans-LICENSE.txt`，本文件保留资产记录。依赖的完整版本以 `package-lock.json` 为准。
