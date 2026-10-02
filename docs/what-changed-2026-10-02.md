# 2026-10-02 改动

## 三大频道（互不重复的模块）

1. **AI新闻** — Flipboard 杂志网格（公开信源 digest）。与 AIHOT 日报标题去重后展示，避免同一故事刷屏。
2. **大V视野** — 社交时间线布局（头像圈、@handle、左青蓝描边、密文卡片），视觉与杂志完全不同。
3. **AIHOT日报** — 独立第三 Tab：masthead 导语 + 分区（模型/产品/行业/论文/技巧）+ 快讯列表，吃 `_aihot_daily.json`，不是杂志条的翻版。

## 其它

- 手机：日期抽屉、触控 Tab、单列杂志、安全区；频道切换时 accent 变色（红 / 青 / 琥珀）。
- `/archive/` 日历 + `archive.json`；页内搜索/标签（AI / 大V）。
- `scripts/fetch-aihot-daily.js`；`publish-to-cvm.sh` **仅环境变量**（`.local/deploy.env` gitignored）。
- NOTICE / LICENSE 致谢卡兹克 AIHOT（MIT，名字 Logo 保留）与关注 UP。

## 文件

`build.js` `assets/app.js` `assets/styles.css` `scripts/*` `NOTICE` `LICENSE` `README.md` `docs/*`
