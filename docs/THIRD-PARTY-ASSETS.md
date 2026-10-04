# 随包资产与许可记录

项目源代码采用 MIT；第三方依赖与资产保留各自许可，并不因打包而变为 MIT。

| 资产 | 来源 | 随包许可 |
| --- | --- | --- |
| Noto Sans SC | Google Fonts / @fontsource/noto-sans-sc | `fonts/Noto-Sans-SC-LICENSE.txt`，SIL OFL 1.1 |
| Noto Serif SC | Google Fonts / @fontsource/noto-serif-sc | `fonts/Noto-Serif-SC-LICENSE.txt`，SIL OFL 1.1 |
| 寒蝉楷书 ChillKai | https://github.com/Warren2060/Chillkai | `fonts/ChillKai-LICENSE.txt`，SIL OFL 1.1 |
| HarmonyOS Sans | Huawei / public/fonts 原有资产 | `fonts/HarmonyOS-Sans-LICENSE.txt` |
| TeX Gyre Pagella | GUST / TeX Gyre | `fonts/GUST-FONT-LICENSE.txt` |
| PDF.js、CMap、标准字体与 WASM | pdfjs-dist / Mozilla PDF.js | `pdfjs/LICENSE` 与各资产目录的上游许可 |

旧工程中的 `Weixin.otf` 未找到可核验的再分发许可记录，因此 0.2 新构建与插件包排除该文件；页面只在用户系统已安装时使用本地字体，其他情况回退系统字体。历史交付产物不在本次变更范围。

构建与安装包测试检查 PDF 运行资产及许可存在，并检查私有数据和上述字体没有进入新包。依赖的完整版本以 `package-lock.json` 为准。
