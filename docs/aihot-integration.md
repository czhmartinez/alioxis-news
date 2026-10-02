# AIHOT 开源集成说明

- 上游仓库：https://github.com/KKKKhazix/AIHOT （MIT，名字/Logo 除外）
- 本机浅克隆：`/workspace/AIHOT`（完整框架：采集 / 精选 / 聚簇 / 日报，需 Docker + PostgreSQL + LLM Key）
- 决策：**不替换** Alioxis News 的 Flipboard 双 Tab 静态站；完整 AIHOT 栈过重，且与个人杂志 UX 目标不同。
- 已落地：
  1. 构建时读取当日 `data/YYYY-MM-DD/_aihot_daily.json`，在 AI新闻 Tab 顶部渲染「今日日报」条（导语 + 分区摘要 + 外链到 aihot.news）。
  2. `scripts/fetch-aihot-daily.js`：用官方 v1 JSON API 拉取日报落盘（个人非商业用途，带 attribution）。
  3. 卡片来源若 URL/字段含 aihot，显示 AIHOT 归属徽章。
- 未做：自托管整站、替换采集流水线（日常已有多源 scrape；完整 worker 需独立部署）。
