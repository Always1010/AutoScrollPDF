# 上游依赖与升级说明

本项目直接携带 PDF.js 和 pdf-lib 的发布产物。本文记录它们的来源、定制边界和升级检查项，避免升级时覆盖扩展功能。

## 依赖来源

| 依赖 | 当前版本 | 仓库位置 | 来源 |
|------|----------|----------|------|
| PDF.js | 5.7.284 | `data/pdf.js/` | <https://github.com/mozilla/pdf.js/releases/download/v5.7.284/pdfjs-5.7.284-dist.zip> |
| pdf-lib | 1.17.1 | `data/pdf-lib/pdf-lib.esm.js` | <https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.esm.js> |

对应的许可证文件随发布产物保留在各自目录中。

## 定制边界

- 不直接修改 `data/pdf.js/build/` 和 `data/pdf.js/web/viewer.mjs` 等打包产物。
- 扩展定制代码集中在 `data/viewer/`。
- `data/pdf.js/web/viewer.html` 是与上游发行包的集成点，升级 PDF.js 后需要重新核对其中的自定义资源引用。

当前 `viewer.html` 依次加载以下自定义资源：

```html
<link rel="stylesheet" href="/data/viewer/buttons.css">
<link rel="stylesheet" href="/data/viewer/theme.css">
<link rel="stylesheet" href="/data/viewer/crop/inject.css">

<script src="/data/viewer/notification-view/notification-view.js"></script>
<script src="/data/viewer/overwrite.js"></script>
<script src="/data/viewer/crop/button.js"></script>
<script src="/data/viewer/cut/button.js"></script>
<script src="/data/viewer/autoscroll/button.js"></script>
```

## PDF.js 升级检查

1. 从官方发布页获取新的预构建发行包并替换 `data/pdf.js/`。
2. 将上面的自定义资源引用重新集成到新的 `viewer.html`，保持现有加载顺序。
3. 确认 `manifest.json`、`worker.js` 和 MIME 处理入口仍指向有效路径。
4. 运行 `node tests/autoscroll-controller.test.cjs`。
5. 在 Edge/Chrome 中刷新扩展，检查 PDF 打开、自动滚动、裁剪、页面提取和下载功能。
