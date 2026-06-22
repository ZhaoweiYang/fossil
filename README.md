# 古生代 · 化石拍卖与交易平台 (FOSSILIA)

一个化石**拍卖 + 一口价交易**平台原型：用户可以缴纳保证金参与拍卖出价，可以把自己的化石上架出售，平台还会展示历史"低买高卖"的盈利案例，并在购买时给出**价格走势、涨幅预测以及同品类（类似品）的涨幅对比**。

**🔗 在线预览（GitHub Pages）：https://zhaoweiyang.github.io/fossil/**

> 该平台有两种运行形态，共用同一套前端与业务逻辑：
> - **完整模式**：`node server.js` 启动 REST API + 静态资源（拍卖/上架/购买等状态在服务端内存中）。
> - **静态模式**：GitHub Pages 部署，前端通过 `api.local.js` 把同一套 `store.js` 业务逻辑跑在浏览器里，**无需后端**即可体验全部功能（数据在当前标签页内存中，刷新即重置）。

> ⚠️ 演示原型：所有数据为模拟生成，价格趋势为统计模型预测，**不构成任何投资建议**。受文物保护法管制的标本（如恐龙蛋）仅作科普展示，禁止交易。

## ✨ 核心功能

| 功能 | 说明 |
| --- | --- |
| 🔨 **付款拍卖** | 拍卖行列表带实时倒计时；出价需满足 3% 加价幅度并**缴纳 10% 保证金**；临近结束出价自动延时 5 分钟（防狙击）。 |
| 📤 **上架出售** | 填写化石信息一键上架到市场，实时预览，自动计算 8% 服务费后的到账金额。 |
| 📈 **赚钱案例** | 复盘真实"买入 → 卖出"案例，展示净利润、回报率、年化收益与持有周期。 |
| 📊 **涨价趋势预测** | 购买时展示该标本的历史成交走势 + 模型预测（含乐观/保守区间）+ 1/3/5 年预估价值。 |
| 🔁 **类似品趋势对比** | 以"起点 = 100"归一化，对比本标本与**同品类平均**的相对涨幅，并附同品类已成交案例作为参考。 |

## 🏗️ 技术栈

**零运行时依赖** —— 只用 Node.js 内置模块，`node server.js` 即可启动，无需 `npm install`。

```
server.js            # 零依赖 HTTP 服务：静态资源 + REST API
src/
  data.js            # 种子数据（化石目录、拍卖、在售、盈利案例）
  analytics.js       # 价格历史生成、预测、ROI 计算、品类趋势聚合
  store.js           # 内存状态 + 业务规则（出价 / 上架 / 购买）
public/
  index.html         # 单页应用入口
  styles.css         # 拍卖行风格主题
  app.js             # 路由、视图渲染、交互
  charts.js          # 轻量 SVG 折线图 / 迷你走势图（无第三方图表库）
test/
  platform.test.js   # node:test 业务逻辑单元测试
```

## 🚀 运行

```bash
npm start            # 等价于 node server.js
# 打开 http://localhost:3000
```

自定义端口：

```bash
PORT=8080 node server.js
```

## ☁️ 部署到 GitHub Pages

仓库已内置一份预构建的静态站点在 [`docs/`](docs/)（前端 + 浏览器端业务逻辑 +
`.nojekyll`）。**只需在仓库里开一次开关**（API token 无权代为开启）：

> **Settings → Pages → Build and deployment → Source: `Deploy from a branch`
> → Branch: `claude/zealous-curie-gc3k9v` / 目录 `/docs` → Save**

约 1 分钟后即可访问：<https://zhaoweiyang.github.io/fossil/>

### 备选：用 GitHub Actions 部署

如果偏好 CI 构建，可改为 **Source: `GitHub Actions`**，然后手动运行
`.github/workflows/deploy-pages.yml`（`workflow_dispatch`）。该工作流会把
`public/` + `src/` 组装为静态包并用 `api.local.js` 覆盖 `api.js` 后发布。

> 注：Actions 自带的 `GITHUB_TOKEN` 无法**首次创建** Pages 站点，因此无论哪种方式，
> 都需要先在 Settings 里手动把 Pages 打开一次。

## 🧪 测试

```bash
npm test             # node --test
```

覆盖：目录与分析数据、预测区间、品类归一化趋势、ROI 计算、出价校验（加价/保证金）、上架校验、购买与防重复购买、平台统计。

## 🔌 API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/stats` | 平台总览统计 |
| GET | `/api/fossils` | 化石目录 |
| GET | `/api/fossils/:id` | 化石详情（含历史/预测/品类趋势/同类案例） |
| GET | `/api/auctions` `/:id` | 拍卖列表 / 详情 |
| POST | `/api/auctions/:id/bids` | 出价（`{bidder, amount, deposit}`） |
| GET | `/api/listings` | 市场在售 |
| POST | `/api/listings` | 上架出售 |
| POST | `/api/listings/:id/buy` | 购买（模拟支付） |
| GET | `/api/sales` | 盈利案例（含 ROI / 年化） |
| GET | `/api/trends/:category` | 品类归一化涨幅趋势 |
| GET | `/api/activity` | 实时动态 |

## 📝 说明与边界

- 状态保存在内存中，**重启后重置**到种子数据。如需持久化，可将 `src/store.js` 替换为数据库层。
- 支付/保证金为**模拟流程**，不接入真实支付渠道。
- 价格预测基于每件标本的建模年化涨幅 + 确定性噪声，趋势可复现，仅供演示。
