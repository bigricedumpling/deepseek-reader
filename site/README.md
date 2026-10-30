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

它会从 `site/demo-kb` 复制一份干净的示例抽屉到临时目录，在 `http://127.0.0.1:8093` 启动真实实例；不启动也不影响 landing 本身。

构建静态文件：

```bash
npm run build:site
```

上线前把 `打开实际界面` 的地址换成可公开访问的实例即可；截图不需要改。
