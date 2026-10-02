# 2026-10-02 改动

## 模块（已上线）

1. **日期归档**：`/archive/` 按月日历 + `dist/archive.json`。时间轴增加「归档日历」入口，顶栏有「归档」。
2. **搜索 + 分类 chips**：页内过滤标题/摘要/来源/标签；chips 取当日高频 tags，随 AI / 大V Tab 切换。
3. **AIHOT 今日日报条**：构建时读 `data/YYYY-MM-DD/_aihot_daily.json`，只在 AI新闻 Tab 显示导语、分区计数、快讯链接与「数据来源：AIHOT」。
4. **手机适配**：≤860px 日期轴默认收起（「浏览日期」按钮）；Tab / 按钮 ≥40px 触控；卡片单列；禁止横向溢出；safe-area。

## AIHOT 开源

- 仓库 https://github.com/KKKKhazix/AIHOT 为 MIT。已浅克隆到 `/workspace/AIHOT`（不进本 git、不发布）。
- **未**用其整站替换 Flipboard UX（需 Docker + Postgres + LLM，且品牌不可挪用）。
- 集成方式：`scripts/fetch-aihot-daily.js` 调 `https://aihot.news/api/v1/dailies/{date}`，build.js 渲染日报条。个人非商业引用，保留 attribution。详见 `docs/aihot-integration.md` 与 `NOTICE`。

## 文件

- `build.js`、`assets/styles.css`、`assets/app.js`（新）
- `scripts/fetch-aihot-daily.js`（新）
- `README.md`、`LICENSE`、`NOTICE`、`.gitignore`
- `docs/aihot-integration.md`、本文件

## 未做

- 未自托管 AIHOT worker。
- GitHub 公开仓库：本地已准备 LICENSE/NOTICE/gitignore；`gh` 登录完成前不 `repo create` / push。
