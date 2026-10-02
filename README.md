# Alioxis News

Flipboard 风格的个人静态 AI 日报（杂志网格、日期时间轴、中文界面）。线上：https://ainews.alioxis.com/

频道（`?tab=`）：

- **AI新闻** (`ai`) — Flipboard 杂志网格（`ai.json`；与 AIHOT 去重）
- **大V视野** (`v`) — 社交时间线（`v.json`）
- **AIHOT日报** (`aihot`) — 卡兹克结构化日报卡片（封面优先匹配 `ai.json` 图；`sourceUrl` / `permalink` 可点）+ 无限镜层叠动效
- **周报** (`weekly`) — 近 7 日杂志/大V按日回顾
- **人物** (`creators`) — 关注流作者目录（发帖数、标签、最新链接）
- **专题** (`topics`) — 标签看板（模型/安全/开源/智能体/基础设施）
- **快讯** (`flash`) — 近 7 日标题+来源速览（去重）

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
