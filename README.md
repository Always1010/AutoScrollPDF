# PDF Reader and Editor (Auto-Scroll)

基于 [PDF.js](https://github.com/mozilla/pdf.js) 的 Edge/Chrome 浏览器扩展，在 [webextension.org/listing/pdf-reader](https://webextension.org/listing/pdf-reader.html) 原版基础上增加了**自动滚动**功能。

## 功能特性

- 📖 **自动滚动** — 支持垂直/水平/平铺/逐页四种模式，释放双手
- 🎚️ **阅读速度调节** — 连续模式支持 5-200 px/s，逐页模式支持每页停留 2-30 秒
- ⏱️ **剩余时间预估** — 工具栏按秒显示滚动到文末的预计时间
- ✋ **智能临时暂停** — 使用滚轮、拖动页面或键盘翻页时暂停 2 秒后继续
- 💾 **偏好记忆** — 自动保留连续速度、逐页停留时间和临时暂停设置
- ⌨️ **键盘快捷键** — `Ctrl+Shift+A` 一键启停
- 🎨 **原版全部功能** — PDF 渲染、编辑、裁剪、提取、旋转、搜索等

## 项目架构

```
pdf-reader-enhanced/
├── manifest.json          # Manifest V3 扩展声明
├── worker.js              # 后台 Service Worker
├── context.js             # 右键菜单处理
├── overwrite.js           # 注入到每个页面的辅助脚本
├── managed.js             # 企业策略托管存储
├── schema.json            # 托管存储 JSON Schema
│
├── data/
│   ├── watch.js           # 内容脚本（注入所有页面）
│   ├── icons/             # 扩展图标
│   ├── options/           # 扩展选项页
│   │
│   ├── pdf.js/            # PDF.js 核心引擎 (v5.7.284)
│   │   ├── build/         #   编译产物: pdf.mjs, pdf.worker.mjs
│   │   └── web/           #   官方 viewer: viewer.html/mjs/css
│   │
│   ├── pdf-lib/           # PDF 操作库 (pdf-lib, 用于裁剪/提取)
│   │
│   └── viewer/            # 扩展自定义层 ★
│       ├── overwrite.js   #   viewer 页面定制（快捷键/主题/下载）
│       ├── buttons.css    #   自定义按钮图标样式
│       ├── theme.css      #   亮色/暗色主题变量
│       │
│       ├── autoscroll/    #   🆕 自动滚动模块
│       │   └── button.js  #     AutoScrollController + UI
│       ├── autoscroll*.svg #    播放/暂停/设置图标
│       ├── mime-handler.* #     Chromium 151+ PDF MIME 接管入口
│       │
│       ├── crop/          #   PDF 裁剪模块
│       ├── cut/           #   PDF 页面提取模块
│       └── notification-view/  # 通知组件
```

### 加载链路

```
Edge 打开 PDF
  → worker.js (Service Worker)
  → file_handlers 路由到 viewer.html?context=explorer
  → viewer.html 加载顺序:
     1. pdf.mjs (PDF.js 引擎)
     2. viewer.css + buttons.css + theme.css (样式)
     3. notification-view.js (通知组件)
     4. overwrite.js (主定制脚本: 快捷键/主题/书签)
     5. crop/button.js, cut/button.js (裁剪/提取按钮)
     6. autoscroll/button.js (🆕 自动滚动按钮)
     7. viewer.mjs (PDF.js Viewer 主逻辑, 暴露 PDFViewerApplication)
```

### 核心概念

| 概念 | 实现 |
|------|------|
| 滚动容器 | `#viewerContainer` — `overflow:auto` 的绝对定位 div |
| PDF.js API | `window.PDFViewerApplication` 全局对象 |
| 四种滚动模式 | VERTICAL(0) / HORIZONTAL(1) / WRAPPED(2) / PAGE(3) |
| 按钮注入 | `document.querySelector('.toolbar #editorStamp').after(...)` |
| 速度渲染 | `requestAnimationFrame` 驱动，子像素累加器防抖 |

## 开发

### 加载扩展

1. 打开 `edge://extensions`（Chrome: `chrome://extensions`）
2. 开启"开发人员模式"
3. 点击"加载解压缩的扩展" → 选择 `pdf-reader-enhanced/`

### 默认打开本地 PDF

要让资源管理器中双击的 PDF 默认进入本扩展，需要同时满足：

1. Windows 的 `.pdf` 默认应用设置为 Edge 或 Chrome；操作系统必须先把文件交给浏览器。
2. 在支持 MIME 处理器 API 的 Chromium 151 或更高版本中，扩展会直接接管本地和网络 PDF。
3. 使用不支持 MIME 处理器的浏览器时，在扩展详情页开启“允许访问文件网址”，否则 `file://` PDF 会进入浏览器内置阅读器。

网络 PDF 仍保留内容脚本跳转作为兼容回退；服务器使用非标准 PDF MIME 类型时也会尝试识别。

### 注意事项

- 扩展目录中的 `viewer.mjs` 是 PDF.js 的 webpack 打包产物，**不要直接修改**
- 所有定制功能通过 `data/viewer/` 下的脚本注入，遵循 PDF.js 的全局 API
- `manifest.json` 已移除 `key` 和 `update_url`，不会与商店版本冲突
- 修改后需在扩展管理页点刷新 🔄 使改动生效
- 自动滚动控制器测试：`node tests/autoscroll-controller.test.cjs`

## 致谢

- [PDF.js](https://github.com/mozilla/pdf.js) — Mozilla
- [pdf-lib](https://github.com/Hopding/pdf-lib) — PDF 操作库
- [PDF Reader and Editor](https://webextension.org/listing/pdf-reader.html) — 原版扩展
