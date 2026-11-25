# Typocket landing prototype

本地预览：

```bash
npm run dev:site
```

打开 `http://127.0.0.1:8092`。

首屏和「读 / 收 / 看」使用的是真实 Typocket 实例的截图，不是重绘。页面里的「打开实际界面」需要一个本机示例服务：

```bash
npm run dev:demo
```

它会从 `site/demo-kb` 复制一份干净的示例知识库到临时目录，在 `http://127.0.0.1:8093` 启动真实实例；不启动也不影响 landing 本身。

本地开发时「打开实际界面」默认指向 `127.0.0.1:8093`。生产构建不会把这个地址带出去；要显示该入口，构建时设置 `VITE_DEMO_URL`：

```bash
VITE_DEMO_URL='https://demo.example.com/doc/...' npm run build:site
```

没有设置时，生产页面会隐藏「打开实际界面」按钮，截图也不再包成链接。

设置 `VITE_SITE_URL` 可以让 OG 图片和 canonical 使用绝对地址：

```bash
VITE_SITE_URL='https://typocket.example.com' VITE_DEMO_URL='https://demo.example.com/doc/...' npm run build:site
```

构建静态文件：

```bash
npm run build:site
```

输出在 `site/dist`。`site/public` 只放 landing 自己的 favicon、OG 图片和字体，不复制产品端的 `public/`。

## Assets

- 截图源文件是 2x PNG，构建使用同尺寸 WebP（质量 88），PNG 只作为源文件保留。
- 字体使用 Noto Sans SC 可变字体，按当前页面文字裁剪为单个 44KB WOFF2。Noto Sans SC 使用 SIL OFL 1.1，允许子集化。
- 没有随 landing 分发 HarmonyOS Sans：其授权允许原样附带，但不允许修改，字体子集化会违反该条款。
