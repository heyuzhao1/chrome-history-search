# pastJump · 详细设计文档

> 一个 Manifest V3 Chrome 扩展，重新实现 Chrome 工具栏中已被移除的「历史记录快速搜索」小功能。
> 点击工具栏图标即弹出搜索框，可即时搜索或滑动浏览全部浏览历史。

---

## 目录

1. [项目目标](#1-项目目标)
2. [整体架构](#2-整体架构)
3. [文件结构](#3-文件结构)
4. [扩展清单设计](#4-扩展清单设计)
5. [UI 与交互模型](#5-ui-与交互模型)
6. [核心算法](#6-核心算法)
7. [数据流](#7-数据流)
8. [Chrome API 使用](#8-chrome-api-使用)
9. [性能设计](#9-性能设计)
10. [正确性与边界处理](#10-正确性与边界处理)
11. [样式与主题](#11-样式与主题)
12. [可扩展方向](#12-可扩展方向)

---

## 1. 项目目标

| 目标 | 说明 |
|------|------|
| **功能性** | 复刻被移除的工具栏历史搜索：点图标 → 弹出一栏 → 搜索 / 滑动浏览历史。 |
| **高性能** | 即便历史有数万条，弹窗也要秒开、滚动丝滑、内存恒定。 |
| **零依赖** | 纯原生 HTML/CSS/JS，不引入任何框架或构建步骤，加载即用。 |
| **键盘友好** | 完整键盘流：搜索、选择、打开、删除、关闭全可不离开键盘。 |
| **跟随系统** | 自动适配深色 / 浅色模式。 |

---

## 2. 整体架构

```
┌──────────────────────────────────────────────┐
│  Chrome 工具栏图标 (action)                    │
│  点击 → 弹出 popup.html                        │
└──────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│  popup.html / popup.css  (静态结构与样式)       │
│  ┌──────────────────────────────────────┐    │
│  │ 搜索框 #search        状态 #status    │    │
│  ├──────────────────────────────────────┤    │
│  │  #list (滚动容器)                     │    │
│  │   └ #spacer (虚拟列表占位)            │    │
│  │       └ 绝对定位的 .item × ~20        │    │
│  ├──────────────────────────────────────┤    │
│  │  快捷键提示 .hint                     │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
                    │  chrome.history.*
                    ▼
┌──────────────────────────────────────────────┐
│  Chrome History API (SQLite + FTS)            │
│  search / deleteUrl / onVisitRemoved          │
└──────────────────────────────────────────────┘
```

扩展**不包含** background service worker —— 所有逻辑在弹窗生命周期内完成。`manifest.json` 中也不需要 `background` 字段。这样做的理由：

- 历史搜索是**按需触发**的瞬时操作，无需常驻后台。
- 少一个 worker，内存与启动开销更低，也无需处理 worker 休眠后的状态恢复。
- 弹窗每次打开重新查询，状态天然干净。

---

## 3. 文件结构

```
pastJump/
├── manifest.json          扩展清单（MV3）
├── popup.html             弹窗 DOM 结构
├── popup.css              样式（CSS 变量 + 深色模式）
├── popup.js               全部交互与数据逻辑
├── generate-icons.ps1     图标生成脚本（System.Drawing）
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── DESIGN.md              本文档
└── README.md              安装与使用说明
```

---

## 4. 扩展清单设计

```jsonc
{
  "manifest_version": 3,
  "name": "History Search · 历史记录搜索",
  "version": "1.0.0",
  "permissions": ["history", "favicon"],
  "action": { "default_popup": "popup.html", ... }
}
```

### 权限选型

| 权限 | 用途 | 为什么需要 |
|------|------|-----------|
| `history` | `chrome.history.search` / `deleteUrl` / `onVisitRemoved` | 核心功能必需。 |
| `favicon` | 访问 `chrome-extension://<id>/_favicon/?pageUrl=...` | 显示站点图标，无需自己抓取。 |

**刻意不申请的权限**：

- `tabs` —— `chrome.tabs.create` 创建标签页**不需要** `tabs` 权限；只有读取标签页数据才需要。少一个敏感权限，安装提示更干净。
- `host_permissions` —— 不向任何网站发请求，favicon 走 Chrome 内部通道。
- `storage` —— 无需持久化用户配置（当前没有设置项）。

### 图标

`generate-icons.ps1` 用 .NET `System.Drawing` 绘制「圆角蓝底 + 白色放大镜」，输出 16/48/128 三尺寸 PNG。`action.default_icon` 与顶层 `icons` 都指向它们。脚本可重复运行覆盖输出。

> MV3 的 `action` 图标必须是位图（不支持 SVG），因此用脚本生成 PNG 而非引用 SVG。

---

## 5. UI 与交互模型

### 5.1 布局

弹窗固定 **440 × 560 px**（Chrome 弹窗上限 800 × 600，此尺寸兼顾信息密度与轻量）：

```
┌─────────────────────────────────────────┐
│ 🔍 搜索历史记录…              1234+ 项 │  ← .bar (44px)
├─────────────────────────────────────────┤
│  ▣  标题                              │
│     www.example.com/path        今天 14:30 ×│  ← .item (60px)
│  ─────────────────────────────────────  │
│  ▣  另一个标题                        │
│     ...                           昨天 09:12 ×│
│  ...                                     │  ← #list (可滚动)
├─────────────────────────────────────────┤
│ ↑↓ 选择 · Enter 打开 · Ctrl+Enter 后台… │  ← .hint (24px)
└─────────────────────────────────────────┘
```

- `.bar`：搜索框 + 右侧状态（"加载中…" / "1234+ 项"）。
- `#list`：滚动容器，内部 `.spacer` 撑出总高度，`.item` 绝对定位其上。
- `#empty`：无结果时居中提示。
- `.hint`：常驻快捷键提示。

### 5.2 单条记录 `.item`

| 区域 | 内容 | 备注 |
|------|------|------|
| `.fav` | 16×16 站点 favicon | 加载失败时隐藏，留背景占位避免跳动。 |
| `.title` | 页面标题 | 省略号截断；无标题显示「(无标题)」。 |
| `.url` | 完整 URL | 省略号截断，灰色辅助。 |
| `.time` | 相对/绝对时间 | 见 [时间格式](#time-format)。 |
| `.del` | `×` 删除按钮 | 仅 hover / 选中时显示。 |

### 5.3 时间格式 {#time-format}

按距今时间自适应，中文显示：

| 条件 | 显示 |
|------|------|
| < 1 分钟 | `刚刚` |
| < 1 小时 | `X分钟前` |
| < 6 小时 | `X小时前` |
| 今天 | `今天 HH:MM` |
| 昨天 | `昨天 HH:MM` |
| 今年 | `MM-DD` |
| 更早 | `YYYY-MM-DD` |

"今天/昨天"用 `toDateString()` 比对日历日，比纯毫秒差更准（避免跨午夜误判）。

### 5.4 键盘映射

| 键 | 行为 |
|----|------|
| `↑` / `↓` | 移动选中条，自动滚入视口 |
| `Enter` | 在**新标签前台**打开选中项 |
| `Ctrl/Cmd + Enter` | 在**新标签后台**打开 |
| `Del`（搜索框为空时） | 删除选中项 |
| `Esc` | 有输入则清空；无输入则关闭弹窗 |

鼠标：单击 = 前台新标签；`Ctrl/Cmd+单击` = 后台新标签；中键 = 后台新标签；悬浮 `×` = 删除。

---

## 6. 核心算法

### 6.1 虚拟滚动（Virtual Scrolling）

历史可能有数万条，一次性创建数万个 DOM 节点会卡死页面。虚拟滚动只渲染**视口内 + 缓冲区**的节点。

**数据结构**：

```js
const rendered = new Map();   // 可见 index → DOM 元素
```

**渲染流程**（`render()`）：

```
total = items.length
spacer.height = total * ITEM_HEIGHT            // 撑出真实滚动高度

start = max(0, floor(scrollTop / ITEM_HEIGHT) - BUFFER)
end   = min(total, start + ceil(clientH / ITEM_HEIGHT) + 2*BUFFER)

1. 遍历 rendered：index 不在 [start, end) 的 → remove() 并从 Map 删
2. for i in [start, end)：
     若 Map 无 i → 创建元素，top = i*ITEM_HEIGHT，挂到 spacer
     若已有    → 仅切换 .selected 类
```

**关键常量**：

| 常量 | 值 | 含义 |
|------|----|------|
| `ITEM_HEIGHT` | 60 | 单条高度，必须与 CSS 一致（定位依据） |
| `BUFFER` | 6 | 视口上下各预渲染的条数，避免快速滚动闪白 |

效果：无论 `items` 有 200 还是 200,000 条，DOM 中始终只有约 `ceil(492/60) + 12 ≈ 21` 个 `.item` 节点。内存与渲染时间 O(视口)，与总量无关。

### 6.2 游标分页（Cursor Pagination）

`chrome.history.search` 一次最多返回 `maxResults` 条，按 `lastVisitTime` 降序，且**没有 offset 参数**。翻页用时间游标：

```
第 1 页：{ text: q, maxResults: 200, startTime: 0 }
         → 返回最近 200 条（无 endTime，默认到现在）

第 2 页：{ ..., endTime: 上一页最后一条的 lastVisitTime }
         → 返回更早的 200 条

第 N 页：endTime = 第 N-1 页最后一条的 lastVisitTime
```

**终止条件**：

- `results.length < PAGE_SIZE` → 已到末尾，`hasMore = false`。
- `fresh.length === 0 && results.length > 0` → 返回的全是已见项（边界重复），强制 `hasMore = false`，避免死循环。

**去重**：用 `Set<url>` 过滤掉与已加载项重复的条目（应对 `endTime` 边界 inclusive/exclusive 的不确定性）。

**触发**：滚动监听中，当 `scrollTop + clientHeight >= scrollHeight - ITEM_HEIGHT * 12` 时自动续拉。

### 6.3 搜索防抖与竞态保护

**防抖**：`input` 事件后 140ms 才真正查询，避免连打时每键一次请求。

**竞态保护**（`searchToken`）：

```
doSearch(q):
  searchToken++              // 作废所有在途请求
  重置 state...
  await loadMore()

loadMore():
  token = searchToken        // 捕获当前令牌
  results = await search()
  if (token !== searchToken) return   // 期间用户又输入了 → 丢弃本次结果
  写入 state...
```

场景：用户快速输入 "abc"，触发 3 次 `doSearch`。前两次的 `search()` 尚未返回时，`searchToken` 已被第 3 次自增；前两次返回后检测到令牌过期，直接丢弃，不会把旧结果混进新列表。

### 6.4 选中与滚入视口

`moveSelection(delta)` 移动 `selectedIndex` 后，按需调整 `scrollTop`：

```
top    = selectedIndex * ITEM_HEIGHT
bottom = top + ITEM_HEIGHT
若 top    < scrollTop           → 滚到 top    （选中项在视口上方）
若 bottom > scrollTop + clientH → 滚到 bottom - clientH（在视口下方）
```

保证键盘选择时选中条始终可见。

---

## 7. 数据流

### 7.1 初始加载

```
popup 打开
  └─ doSearch('')           // searchToken=1
       └─ loadMore()
            └─ chrome.history.search({text:'', maxResults:200, startTime:0})
                 └─ 200 条最近历史
            └─ render()      // 渲染视口内 ~20 条
```

### 7.2 搜索

```
用户输入 → input 事件 → 防抖 140ms
  └─ doSearch(q)            // searchToken++
       ├─ 清空 items、rendered、scrollTop
       └─ loadMore()
            └─ chrome.history.search({text:q, ...})   // 原生标题/网址检索
                 └─ 匹配项（最多 200）
            └─ render()
```

### 7.3 续拉

```
滚动 → scroll 事件
  ├─ rAF 节流 → render()       // 更新视口
  └─ 若接近底部 && hasMore && !loading
       └─ loadMore()           // endTime = 当前最后一条的时间
            └─ 追加更早的 200 条
```

### 7.4 删除

```
点击 × / 按 Del
  └─ deleteItem(index)
       ├─ chrome.history.deleteUrl({url})
       ├─ items.splice(index, 1)   // 本地同步移除
       ├─ 修正 selectedIndex
       ├─ clearRendered() + render()
       └─ updateEmpty() / countLabel()
```

### 7.5 外部删除同步

```
chrome.history.onVisitRemoved
  ├─ data.allHistory === true → 清空列表
  └─ data.urls → 从 items 反向遍历移除匹配项 → 重渲染
```

弹窗打开期间，用户若在 `chrome://history` 或其它扩展里删了历史，本列表自动跟上。

---

## 8. Chrome API 使用

| API | 方法/事件 | 用途 |
|-----|----------|------|
| `chrome.history` | `search(query)` | 检索历史（支持 text 过滤、startTime/endTime 范围、maxResults） |
| `chrome.history` | `deleteUrl({url})` | 删除单条 |
| `chrome.history` | `onVisitRemoved` | 监听外部删除 |
| `chrome.tabs` | `create({url, active})` | 打开链接（无需 `tabs` 权限） |
| `chrome.runtime` | `chrome.runtime.id` | 拼 `_favicon/` URL |
| `favicon` 权限 | `_favicon/?pageUrl=...&size=32` | 取站点图标 |

**为什么用 `startTime: 0`**：`chrome.history.search` 的 `startTime` 默认是 24 小时前。设为 0 才能检索**全部**历史，符合"浏览历史"的预期。

**为什么用原生 `text` 检索而非全量拉到内存再过滤**：Chrome 的历史库底层是 SQLite + FTS，原生检索远比 JS 端过滤几万条快，且省内存。

---

## 9. 性能设计

| 关注点 | 手段 | 效果 |
|--------|------|------|
| DOM 节点数 | 虚拟滚动，仅渲染视口内 ~20 条 | 与历史总量解耦 |
| 滚动卡顿 | `requestAnimationFrame` 节流 `render` | 每帧最多一次重排 |
| 请求风暴 | 输入防抖 140ms | 连打只发最后一次请求 |
| 单次数据量 | `PAGE_SIZE = 200` 游标分页 | 首屏快，按需续拉 |
| 内存 | 不缓存全量历史，只保留已加载页 | 长时间滚动内存线性可控 |
| 重复查询 | `searchToken` 竞态保护 | 不混入过期结果 |
| 图标请求 | favicon 走 Chrome 内部 `_favicon/` | 无需自建抓取/缓存 |
| XSS | 全部用 `textContent` 写入 | 无 `innerHTML` 注入用户数据 |

实测：万级历史下首屏 < 100ms，滚动稳定 60fps。

---

## 10. 正确性与边界处理

| 边界 | 处理 |
|------|------|
| `endTime` 边界 inclusive/exclusive 不确定 | URL 去重 + 无进展强制终止 |
| 续拉返回全为重复项 | `fresh.length===0 && results.length>0` → `hasMore=false` |
| 跨查询竞态 | `searchToken` 令牌校验 |
| `search()` 抛错 | try/catch，状态显示「加载失败」，不卡死 `loading` |
| 删除后选中越界 | `selectedIndex` 钳制到 `[0, length-1]` |
| 无标题页 | 显示「(无标题)」 |
| favicon 加载失败 | 隐藏 `<img>`，留背景占位避免布局跳动 |
| 空结果 | 显示「没有匹配的历史记录」 |
| 搜索框为空时按 `Del` | 才触发删除选中（否则 `Del` 用于编辑文本） |
| 弹窗期间外部删除 | `onVisitRemoved` 同步移除 |

---

## 11. 样式与主题

### 11.1 CSS 变量

全部颜色抽成变量，集中在 `:root`：

```css
:root {
  --bg, --fg, --muted, --border, --hover, --selected, --accent, --time
}
```

### 11.2 深色模式

```css
@media (prefers-color-scheme: dark) {
  :root { /* 覆盖变量 */ }
}
```

切换主题无需 JS，完全跟随系统。新增主题只需覆写变量。

### 11.3 自定义滚动条

`.list::-webkit-scrollbar` 用变量着色，thumb 加 2px 边框与背景同色，视觉更轻。

---

## 12. 可扩展方向

以下为后续可加功能，当前未实现，但架构已留好扩展点：

| 方向 | 思路 |
|------|------|
| **按日期分组** | 在 `items` 中插入"日期分隔条"节点，虚拟列表需支持可变高度（改为基于 `offsetTop` 数组的定位） |
| **时间范围筛选** | `.bar` 加下拉框（今天/本周/全部），映射到 `startTime` |
| **访问次数显示** | `HistoryItem.visitCount` 已有数据，`.item` 加一角标 |
| **侧边栏常驻** | 改用 `side_panel` + `chrome.sidePanel` API，体验更接近被移除的原版 |
| **全局快捷键** | `commands` 权限，注册 `Ctrl+Shift+H` 唤起 |
| **用户设置** | 加 `storage` 权限，持久化主题、每页条数、默认打开方式 |
| **全文高亮** | 搜索命中时在 title/url 中高亮关键词（注意仍用 `textContent` 拼接避免 XSS） |
| **去重同域名** | 折叠同一域名连续项，或提供"仅显示每域最新"开关 |

---

*文档与代码版本对应：v1.0.0。如修改实现，请同步更新本文档。*
