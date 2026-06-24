# 古生代 · 化石拍卖与交易平台 (FOSSILIA)

一个化石**拍卖 + 一口价交易**平台原型：用户可以缴纳保证金参与拍卖出价，可以把自己的化石上架出售，平台还会展示历史"低买高卖"的盈利案例，并在购买时给出**价格走势、涨幅预测以及同品类（类似品）的涨幅对比**。

**🔗 在线预览（GitHub Pages）：https://zhaoweiyang.github.io/fossil/**

> 📱 **默认即为移动端 H5（接近原生 App 体验）**：底部 Tab 导航、详情以底部弹层（bottom sheet）滑出、可拖拽下滑关闭、安全区适配、并支持 **PWA「添加到主屏幕」** 后全屏独立运行。用手机打开上面的链接，或在 iOS Safari / Android Chrome 里「添加到主屏幕」即可像 App 一样使用。桌面宽屏版在 [`/desktop.html`](https://zhaoweiyang.github.io/fossil/desktop.html)。
>
> 🖼️ 商品配图为 **维基共享资源（Wikimedia Commons）** 上的真实化石照片（公有领域 / CC 授权），加载失败时回退为表情图标。
>
> 🎁 **首启开通页（[`/install.html`](https://zhaoweiyang.github.io/fossil/install.html)）**：新用户首次进入会先看到 **「0 元免费使用一年」** 的会员开通页，开通或跳过后写入 `localStorage`，之后直接进入 App。开通页用**价值堆叠 + 价格锚定 + 社会认同 + 诚实的风险逆转**（无需绑卡 / 到期不自动扣费 / 随时取消）来提升转化——刻意避免暗黑模式。想跳过引导直接看主程序，访问 `index.html?noonboard` 即可。

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
server.js              # 零依赖 HTTP 服务：静态资源 + REST API
src/
  data.js              # 种子数据 + 真实化石图映射（Wikimedia Commons）
  analytics.js         # 价格历史生成、预测、ROI 计算、品类趋势聚合
  store.js             # 内存状态 + 业务规则（出价 / 上架 / 购买）
public/
  index.html           # 📱 移动端 H5 入口（默认）
  m.styles.css         # 移动端原生风格样式（底栏 / 弹层 / 安全区）
  m.app.js             # 移动端 SPA（Tab 导航、bottom sheet、交互）
  manifest.webmanifest # PWA 清单（可添加到主屏、独立全屏运行）
  sw.js                # Service Worker（应用外壳缓存 + 离线兜底）
  icon.svg             # 应用图标（菊石螺旋）
  desktop.html         # 🖥️ 桌面宽屏版入口
  styles.css / app.js  # 桌面版样式与逻辑
  api.js               # API 适配器：HTTP（服务端）
  api.local.js         # API 适配器：浏览器端 store（静态部署，无后端）
  charts.js            # 轻量 SVG 折线图 / 迷你走势图（无第三方图表库）
test/
  platform.test.js     # node:test 业务逻辑单元测试
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
