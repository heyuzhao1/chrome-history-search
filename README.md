# History Search · 历史记录搜索

> Chrome 自带「标签页搜索」的进阶版——不只搜当前标签页，而是即时检索、滑动浏览你的全部浏览历史。
> 点击工具栏图标即弹出搜索框。

An advanced take on Chrome's built-in Tab Search — search and scroll through your full browsing history, not just open tabs. High-performance Manifest V3 extension: virtualized list + cursor pagination, zero dependencies, no build step.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Platform](https://img.shields.io/badge/platform-Chromium-lightgrey.svg)](#)

<!-- 截图占位：建议录一段 popup 搜索/滚动的 GIF 放到这里
![screenshot](docs/screenshot.png)
-->

---

## 📝 初衷

Chrome 自带一个「标签页搜索」功能（工具栏右上角那个下拉小弹窗），但它只能搜当前打开的标签页和最近关闭的几条，想翻更早的浏览历史就无能为力。

这个扩展就是「标签页搜索」的进阶版：把搜索范围扩展到你的全部浏览历史，并在原版基础上做了性能强化——虚拟滚动 + 游标分页，即便历史积累到几万条也能秒开、丝滑滚动。

如果你也觉得自带的标签页搜索不够用，希望它能帮到你。

## ✨ 特性

| | |
|---|---|
| 🔍 **即时搜索** | 标题 / 网址原生检索，输入防抖 140ms，调用 `chrome.history` 而非全量拉内存 |
| ⚡ **虚拟滚动** | 仅渲染视口内约 20 条，万级历史也保持 60fps |
| 📜 **游标分页** | 按 `lastVisitTime` 翻页，每次 200 条，滚到底自动续拉 |
| ⌨️ **全键盘操作** | 选择 / 打开 / 后台打开 / 删除 / 关闭，可不离开键盘 |
| 🗑️ **单条删除** | 调用 `chrome.history.deleteUrl`，外部删除也实时同步 |
| 🌐 **站点图标** | 走 `favicon` 权限，无需自建抓取与缓存 |
| 🌙 **深色模式** | 跟随系统 `prefers-color-scheme` |
| 🔒 **零依赖** | 纯原生 HTML / CSS / JS，无框架、无构建步骤 |

## 📦 安装

1. 下载或克隆本仓库：
   ```bash
   git clone https://github.com/heyuzhao1/chrome-history-search.git
   ```
2. 生成图标（仅首次，需要 Windows PowerShell）：
   ```powershell
   powershell -ExecutionPolicy Bypass -File generate-icons.ps1
   ```
   > 仓库已附带生成好的 `icons/`，此步可跳过；仅在你想改图标时运行。
3. 打开 `chrome://extensions`
4. 右上角开启「**开发者模式**」
5. 点击「**加载已解压的扩展程序**」，选择仓库根目录
6. 把图标固定到工具栏，点击即可使用

**要求**：Chrome / Edge 104+（`favicon` 权限）。

## ⌨️ 快捷键

| 键 | 行为 |
|----|------|
| `↑` / `↓` | 移动选中条（自动滚入视口） |
| `Enter` | 在新标签前台打开 |
| `Ctrl` / `Cmd` + `Enter` | 在新标签后台打开 |
| `Del`（搜索框为空时） | 删除选中项 |
| `Esc` | 有输入则清空；无输入则关闭弹窗 |

鼠标：单击前台打开 · `Ctrl/Cmd+单击` 后台打开 · 中键后台打开 · 悬浮 `×` 删除。

## 🛠️ 本地开发

纯静态项目，无构建步骤。改完代码在 `chrome://extensions` 的扩展卡片上点「重新加载」即可生效。

重新生成图标：

```powershell
powershell -ExecutionPolicy Bypass -File generate-icons.ps1
```

详细设计与算法说明见 **[DESIGN.md](DESIGN.md)**（虚拟滚动、游标分页、竞态保护等）。

## 📁 项目结构

```
chrome-history-search/
├── manifest.json          扩展清单（MV3，权限：history、favicon）
├── popup.html             弹窗结构
├── popup.css              样式（CSS 变量 + 深色模式）
├── popup.js               逻辑（虚拟滚动 + 分页 + 搜索）
├── generate-icons.ps1     图标生成脚本
├── icons/                 16 / 48 / 128 图标
├── DESIGN.md              详细设计文档
├── LICENSE                MIT
└── README.md
```

## 🤝 贡献

欢迎提 Issue 报 bug、提建议，或直接发 Pull Request。

## 📄 许可证

[MIT](LICENSE) © heyuzhao1
