# Alioxis News

Flipboard 风格的个人静态 AI 日报（杂志网格、日期时间轴、中文界面）。线上：https://ainews.alioxis.com/

频道（`?tab=`）分两组，每个模块用最适合其内容的版式：

**内容流**（四种并列的内容形态）
- **要闻** (`ai`) — 报纸头版：头条 + 次头条 + 紧凑列表（`ai.json`；与 AIHOT 去重）
- **快讯** (`flash`) — 电讯时间线：只有时间 + 标题 + 来源，按实际发布时间倒序、按日分组
- **大V视野** (`v`) — 观点流 + 左侧「本日发声」作者栏，点作者即可筛选（`v.json`）
- **简报** (`digest`) — 订阅邮件式单栏：`?view=daily` 为 AIHOT 日报（分区编号），`?view=weekly` 为近 7 日回顾

**索引**（进入全部内容的两条轴线，另有按日期的「归档」页）
- **专题** (`topics`) — 分栏看板（模型/安全/开源/智能体/基础设施），每栏前 5 条可展开
- **人物** (`creators`) — 作者名册卡片（发帖数、活跃天数、标签、最新一条）

旧链接 `?tab=aihot`、`?tab=weekly` 仍可用（自动映射到「简报」）。

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
