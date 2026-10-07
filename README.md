# Alioxis News

Flipboard 风格的个人静态 AI 日报（杂志网格、日期时间轴、中文界面）。线上：https://ainews.alioxis.com/

导航分三个分区，每个分区下是性质相同、可并列的频道（`?tab=` 深链保持不变）：

**今日**：三个独立来源，各自的呈现保持不变

- **AI新闻** (`ai`) — Flipboard 杂志网格（`ai.json`；与 AIHOT 去重）
- **大V视野** (`v`) — 社交时间线（`v.json`）
- **AIHOT日报** (`aihot`) — 卡兹克结构化日报卡片 + 无限镜层叠动效

**回顾**：把已有内容按时间重新读一遍

- **本周长文** (`weekly`) — 单栏通讯体：近三日头条（各日杂志首条）+ 按日回顾
- **快讯流** (`flash`) — 电报流：按日分组、时间倒序、无图一行一条

**发现**：把已有内容换个角度看

- **按人** (`creators`) — 创作者名片墙：发帖数、近 14 天发帖节奏柱状图、最新链接
- **按话题** (`topics`) — 话题地图：方块大小对应热度，点击展开该话题明细

致谢见 [NOTICE](NOTICE)。AIHOT 日报条的数据来自 [卡兹克 AIHOT](https://aihot.news/)（开源框架 [KKKKhazix/AIHOT](https://github.com/KKKKhazix/AIHOT)，MIT）。本仓库不包含 AIHOT 源码树，也不使用其名字/Logo 作为本站品牌。

## 功能

- 手机可用：安全区内边距、暗色搜索框、芯片换行/横滑、封面限高、长文换行
- 日期归档页 `/archive/` + `archive.json`
- 页内搜索与分类标签筛选（杂志/大V）
- AIHOT 卡片：原文链接、AIHOT 角标、匹配封面或字母回退

## Build

```bash
cd alioxis-news && node build.js
```

可选：拉取当日 AIHOT 日报（个人非商业）：

```bash
node scripts/fetch-aihot-daily.js            # 今天（Asia/Taipei）
node scripts/fetch-aihot-daily.js 2026-10-02
```

## Preview

```bash
cd dist && python3 -m http.server 8080 --bind 0.0.0.0
```

深链示例：`?tab=aihot` · `?tab=weekly` · `?tab=creators` · `?tab=topics` · `?tab=flash`

## Publish (CVM)

Secrets stay outside the repo. Source env then run:

```bash
set -a && source /home/box/.config/alioxis-news-publish.env && set +a
# or: source .local/deploy.env
./scripts/publish-to-cvm.sh
```
