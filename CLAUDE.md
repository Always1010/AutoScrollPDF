# CLAUDE.md

本文件为 Claude Code 在此项目中工作提供上下文和规则。

## 项目概况

这是一个基于 PDF.js 的浏览器扩展（Manifest V3）。仓库根目录就是扩展加载目录，克隆后可直接通过“加载解压缩的扩展”在 Edge/Chrome 中运行。

## 修改前必须出计划

任何非 trivial 的修改，先写出简短计划（要改哪些文件、分几步），再逐步实施。这样方便追溯和回滚。

## 每完成一个小点就 commit

不要把多个独立改动揉成一个 commit。commit 类型遵循以下规范：

| Type | 含义 | 示例 |
|------|------|------|
| **NEW** | 新增功能/特性 | `NEW: 新增自动滚动速度面板` |
| **FIX** | 修复 bug | `FIX: 修复子像素累加导致滚动停滞` |
| **DOCS** | 仅文档变更 | `DOCS: 更新 README 架构图` |
| **STYLE** | 代码格式（空格/缩进/逗号等），不改变逻辑 | `STYLE: 统一缩进为 2 空格` |
| **REFC** | 代码重构，无新功能无 bug 修复 | `REFC: 抽取滚动计算为独立方法` |
| **ENH** | 优化（性能/体验提升） | `ENH: 速度曲线改为指数映射` |
| **TEST** | 测试用例（单元/集成） | `TEST: 添加时间计算单元测试` |
| **CHORE** | 构建/依赖/工具变更 | `CHORE: 升级 PDF.js 到 v5.8` |
| **REVERT** | 回滚 | `REVERT: 回滚到 b429d5c` |

**提交信息要求**：
- 用中文，30 字以内
- 描述准确简洁，方便 `git log --oneline` 快速浏览
- 一个 commit 只做一件事
- 不需要正文，除非有特别需要说明的背景

## 禁止随意操作分支

**绝对禁止**以下操作，除非用户明确要求：
- `git branch -D` / `git branch -d`（删除分支）
- `git checkout`（切换分支）
- `git switch`（切换分支）
- `git merge`（合并分支）
- 任何修改当前分支的行为

用户可能在不同分支上做实验性开发，随意切换或删除分支会导致工作丢失。

## 技术要点

- 不修改 `data/pdf.js/` 下的 PDF.js 核心文件（webpack 打包产物）
- 所有定制通过 `data/viewer/` 下脚本注入，遵循现有 pattern（如 crop/cut 模块）
- 通过 `window.PDFViewerApplication` 全局对象操作 PDF 查看器
- 扩展修改后需在 `edge://extensions` 刷新
