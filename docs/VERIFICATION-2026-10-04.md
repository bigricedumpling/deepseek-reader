# 2026-10-04 反馈版验证记录

## 环境与隔离

- 分支：`product-v1-foundation`，版本 `0.2.0-preview.1`，已作为 GitHub Preview 发布。
- macOS，Node.js 24.19.0；DSH NEXT 2.0.16-next，内含 DSH 0.2.0-rc.1。
- UI 使用独立 8197 服务与临时测试知识库；安装验收使用独立 DSH_HOME/profile，数据路径包含中文和空格。
- 原仓库仍为 `8c9e50e54948f0bda6893594ad4fd22571f05d7e`，工作区干净；未写入个人笔试题文档，未重启 8090，未部署服务器或替换公开包。

## 实际安装与升级

通过 DSH NEXT 自带官方插件安装命令安装 `0.1.0-preview.2`，在其界面创建测试文档，再升级到新包。随后卸载插件、核对数据仍在、重装新包，并启动 DSH NEXT 自带 Web 宿主。

- 旧测试文档 SHA-1 始终为 `1214c1a5b42a2a1f99c1e374979f18d248f8af52`。
- 新版本记录端口 49327，宿主重启与卸载重装后继续使用相同地址；真实 `/api/instance` 返回 Reader。
- 独立包解压运行检查：522 个文件，60.67 MB；页面、服务、PDF worker/CMap/字体与许可齐全；排除数据库、密码、服务记录、分享配置及个人知识库数据。
- 旧版本未保存端口，因此第一次升级会从旧随机端口转到新固定端口；站点阅读偏好可能重置一次。知识库正文与页面元数据不因此丢失。

以上不是 Windows/Linux 原生桌面或两个原生 DSH 窗口的验收。实际 Node 双消费者测试验证同库复用、停止非拥有者不杀服务、拥有者重启与端口冲突拒绝。

## 自动回归

本机通过：`check`、`typecheck`、`test:access`、`test:readonly`、`test:block`、`test:fold`、`test:routes`、`test:plugin`、`test:transfer`、`test:lifecycle`、`test:user-recovery`、`test:workflow`、`test-workspace.mjs`、`test-recovery.mjs`、`test:upgrade`、生产构建及最终 `test-package.mjs`。

- 完整工作流程使用真实 HTTP 和插件 Agent 适配器：预览→私有副本→整理→检索→读取来源→更新；越权和过期版本被拒绝，原文件不变。
- 恢复测试包括旧回收文件、同名冲突、非法路径、默认私有、稳定 ID 与页面设置、独立恢复目录、凭据排除和恢复阅读器实际打开。
- 升级测试使用原仓库代码建立旧数据，再由新代码打开并备份恢复。

### 远程 CI

三平台 Node 24 矩阵已在 GitHub 实际执行。首次运行发现 DOMPurify 直接依赖范围与 override 精确版本不一致，导致干净 `npm ci` 失败；已经统一为 `3.4.16`，临时干净目录复验安装解析通过。第二轮 macOS/Linux 功能测试通过，CI 打包参数误写为 workspace 选择器；Windows 权限检查通过后因测试数据库句柄未关闭而清理失败。两处已修复，Windows 目录逃逸测试改用系统支持的 junction。第三轮 macOS/Linux 全部通过；Windows 检出改名时把系统反斜杠写入内部路径键的问题，已统一为 `/`，继续用原有稳定标识、权限和附件测试验证。随后修复 Windows tar 清单的 CRLF 解析。最终提交 `52ff76e67f489fd56b5970e55c471b47b6c91c9f` 在 macOS、Windows、Ubuntu 三个平台全部通过，包括干净安装、构建、全部功能测试、打包和解包后的真实服务启动。

[基础版本 CI：三平台全部通过](https://github.com/bigricedumpling/deepseek-reader/actions/runs/37179466583)。最终发布提交 `e69e0d1` 的 [三平台 CI](https://github.com/bigricedumpling/deepseek-reader/actions/runs/37194406725) 也已通过，最新本机证据见 [最终审查](RELEASE-AUDIT-2026-10-04.md)。

## 界面复查

以下记录属于当时的基础版本验收，后续界面改动以最终审查为准：

- 复杂 Markdown 的脚注、公式、HTML、表格与 Mermaid 阅读；当时通过源码编辑保存，并检查版本差异。随后已补直接编辑能力并移除顶部模式切换。
- PDF 画布和可选择文字实际显示；H5 演示页面按钮可交互。
- 完整备份创建、恢复、打开独立阅读器；原库保留。
- 420px 同源测试框中搜索不被侧栏遮挡；收录弹层可操作；Escape 只关闭最上层并返回上一层入口。
- 发现并修复收录到当前知识库后目录未刷新、文档错误只读的问题；复验新文档为可编辑正文，窄屏侧栏自动收起。
- 发现并修复复杂格式回退页面未复用正常排版、图表文字被清理、CJK 间距修改 HTML 属性的问题。
- 屏幕截图使用专用示例数据，见 [实际界面](screenshots/workspace.png)。

## 性能基线

命令：`npm run measure:performance`。两次本机测量范围，301 文档，总正文 5,993,295 字节：

| 项目 | 测量 |
| --- | --- |
| 服务启动就绪 | 43–82 ms |
| 目录请求 | 60–101 ms |
| 588,905 字节长文读取 | 5–6 ms |
| 全库无命中搜索 | 31–51 ms |
| 8 个并行文档读取 | 4–7 ms |

另在真实浏览器打开 500 小节 Markdown，确认 500 个二级标题渲染；一次工具观察约 256 ms，包含自动化开销，**不是标准化渲染性能指标**。这些结果只作后续比较基线，不能外推低配机器或超大知识库。

## 交付判断

本轮实现与本机验收范围见 [18 项台账](IMPLEMENTATION-REVIEW.md)。可供用户完整反馈；正式版还需平台原生宿主、外网分享及低配环境等明确列出的证据。保留 [已知问题](RELEASE-READINESS.md)，不把外部环境缺口藏成已完成。

## 同步状态

最终提交 `e69e0d1` 已按原 SHA 同步到 GitHub 隔离分支，并发布 `v0.2.0-preview.1` 安装包。市场 PR 已更新为新包，仍待检查与审批。Gitea 连接返回证书过期，保持 TLS 校验，没有绕过；证书恢复后再补齐同步。现有交付服务器未部署这次更新。
