# Alioxis News

Flipboard 风格的个人静态 AI 日报（杂志网格、日期时间轴、中文界面）。线上：https://ainews.alioxis.com/

两个频道（不合并）：

- **AI新闻** — 公开来源摘要（`data/YYYY-MM-DD/ai.json`）
- **大V视野** — X 关注流精选（`data/YYYY-MM-DD/v.json`）

致谢见 [NOTICE](NOTICE)。AIHOT 日报条的数据来自 [卡兹克 AIHOT](https://aihot.news/)（开源框架 [KKKKhazix/AIHOT](https://github.com/KKKKhazix/AIHOT)，MIT）。本仓库不包含 AIHOT 源码树，也不使用其名字/Logo 作为本站品牌。

## 功能

- 手机可用：触控 Tab、单列卡片、日期抽屉、安全区
- 日期归档页 `/archive/` + `archive.json`
- 页内搜索与分类标签筛选（基于条目 `tags`）
- 当日若存在 `data/YYYY-MM-DD/_aihot_daily.json`，AI新闻顶部显示「今日日报」条（含 attribution）

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

深链：`?tab=ai`（默认）或 `?tab=v`。

## Data

卡片字段：`title`、`summary`、`url`、`source`、`source_handle`、`image`、`published_at`、`tags[]`。

旧版扁平 `data/YYYY-MM-DD.json` 在缺少 `ai.json` 时仍当作 AI新闻。

本生成器**不发明新闻**；没有数据就显示空状态。

## 部署

`dist/` 为静态根目录。生产由 `scripts/publish-to-cvm.sh` 同步到自有服务器（密钥不入库）。只服务 `ainews` 子域，**不要**覆盖 apex `alioxis.com`。

```
try_files $uri $uri/ $uri/index.html =404;
```

## 许可

站点生成器代码：MIT（见 LICENSE）。新闻正文、关注创作者内容、AIHOT 数据与品牌：见 NOTICE。
