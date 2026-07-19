# NIO-Dash

蔚来车辆看板 — macOS 菜单栏应用。自动拉取车辆 RVS 状态、服务订单与每日签到，在本地展示电量、续航、换电记录与行驶路径。

![Platform](https://img.shields.io/badge/platform-macOS-blue)
![Version](https://img.shields.io/badge/version-1.5.1-green)
![Electron](https://img.shields.io/badge/Electron-35-47848F)
![React](https://img.shields.io/badge/React-19-61DAFB)

## 功能概览

| 模块 | 说明 |
|------|------|
| **菜单栏** | 常驻显示电量 / 续航等，可自定义字段 |
| **车辆看板** | 26 张可拖拽、可隐藏的卡片，覆盖 RVS 主要状态块 |
| **服务订单** | 换电、充电、维保等历史与统计 |
| **每日签到** | 独立 API，每天 9:00 拉取一次 |
| **行驶路径** | 按天汇总 GPS 采样并绘制地图轨迹 |
| **历史趋势** | 电量（近 1 / 3 日）、日增里程与总里程（近 7 / 15 日），支持日期范围与缩放平移 |
| **运行日志** | 数据同步面板查看拉取记录、API 请求、完整响应与失败原因 |

### 车辆看板卡片（26 张）

电池 · 充电详情 · 车门 · 车窗 · 轮胎 · 软件/GPS · 特殊模式 · 车辆信息 · 行驶/泊车 · 座椅加热 · 连接状态 · 温度/空调 · 维保 · 灯光 · 钥匙 · 特殊状态 · 行程分享 · 近车控制 · 换电订单 · 低压电瓶 · 设备 · 充电订单 · 远程操作 · 离车换电 · 储物箱 · 冰箱

每张车辆卡片右上角有 `{ }` 按钮，可查看该卡片对应的 RVS 原始 JSON。

### 服务订单卡片（4 张）

订单概览 · 换电统计 · 常用换电站 · 全部订单（可折叠表格）

### 智能拉取

| 数据 | 策略 |
|------|------|
| **车辆** | 行驶中 / 白天 09:00–17:00 / 夜间 17:01–08:59 三档间隔，可配置 |
| **换电** | 独立定时，默认 60 分钟 |
| **签到** | 每天 **9:00** 一次；9 点后首次打开补拉；未签到时每 5 分钟重试直至已签 |

## 快速开始

### 环境要求

- macOS（Apple Silicon 或 Intel）
- Node.js 20+
- npm

### 开发运行

```bash
git clone https://github.com/real3841/NIO-Dash.git
cd NIO-Dash
npm install
npm run electron:dev
```

首次启动打开 **数据同步**，填入车辆 / 换电 / 签到 API 配置后保存，再点「刷新车辆 / 刷新换电」。

### 打包 Mac 应用（可直接运行）

```bash
npm run electron:pack
```

产物：

| 路径 | 说明 |
|------|------|
| `release/mac-arm64/蔚来车辆看板.app` | 双击即可运行 |

DMG 安装镜像：

```bash
npm run electron:pack:dmg
```

> 首次打开若被 Gatekeeper 拦截：系统设置 → 隐私与安全性 → 仍要打开。

### 仅 Web / API 开发（无 Electron）

```bash
npm install
cp deploy/.env.example deploy/.env
# 编辑 deploy/.env
npm run fetch:serve   # 定时拉取 + 本地 API
npm run dev           # 另开终端：Vite 前端
```

## 配置

应用内 **数据同步** 面板可图形化编辑；也可直接改配置文件。

| 场景 | 配置文件 | 数据目录 |
|------|----------|----------|
| 开发 `electron:dev` | `~/Library/Application Support/nio-mac/config.env` | `~/Library/Application Support/nio-mac/data/` |
| 打包 `.app` | `~/Library/Application Support/蔚来车辆看板/config.env` | `~/Library/Application Support/蔚来车辆看板/data/` |

参考模板：`deploy/.env.example`

### 如何获取 API 配置（抓包）

本看板通过**重放蔚来 App 自己的请求**来认证，不单独实现登录。因此需要先在手机上抓一次包，把 App 发出的真实 URL 和 Token 填进配置。

#### 1. 架设 MITM 代理

在手机与网络之间架设中间人代理，任选其一即可：

mitmproxy · Reqable · Charles · Surge · Quantumult X …

在手机上**安装并信任**代理工具的 CA 证书（否则 HTTPS 无法解密）。

#### 2. 抓取车辆状态请求

1. 打开**蔚来 App**
2. 进入车辆页，**下拉刷新**一次
3. 在代理记录中找到这条请求：

```
GET https://icar.nio.com/api/2/rvs/vehicle/<vehicle_id>/status?...
```

#### 3. 复制两样东西

| 填入看板 | 从哪里取 |
|----------|----------|
| **车辆 API URL** | 整条请求 URL：从 `https://…/status?` 一直到末尾的 `…&sign=…`，**全部复制** |
| **Authorization Token** | 请求头 `Authorization: Bearer …` 中 `Bearer` 后面的部分（或整段 `Bearer …` 均可） |

在应用内打开 **数据同步 → 车辆 API 配置 → 编辑**，分别粘贴到 `NIO_VEHICLE_API_URL` 与 `NIO_VEHICLE_ACCESS_TOKEN`，保存后点「刷新车辆」。

> `sign` / `timestamp` 会过期。拉取失败时，重新在 App 里刷新车辆页，再抓一条新 URL 替换即可。

换电、签到等接口同理：在 App 里触发对应操作，在代理里找到 `gateway-front-external.nio.com` 下的请求，复制完整 URL 与 `Authorization` 头。

### 车辆 API（RVS）

将抓包得到的 URL 与 Token 填入：

| 变量 | 说明 |
|------|------|
| `NIO_VEHICLE_API_URL` | 完整 GET URL |
| `NIO_VEHICLE_ACCESS_TOKEN` | Authorization Token |
| `NIO_VEHICLE_POLL_DRIVING_SEC` | 行驶中间隔（秒，默认 900） |
| `NIO_VEHICLE_POLL_DAY_SEC` | 白天间隔（秒，默认 1800） |
| `NIO_VEHICLE_POLL_NIGHT_SEC` | 夜间间隔（秒，默认 3600） |

`sign` 过期后需重新抓包并替换 URL。拉取脚本会将 RVS 响应归一化为 `data.status` 结构。

### 换电 / 订单 API

| 变量 | 说明 |
|------|------|
| `NIO_CHANGE_API_URL` | 完整 URL（POST，含 Query Params） |
| `NIO_CHANGE_ACCESS_TOKEN` | Authorization Token |
| `NIO_CHANGE_POLL_INTERVAL` | 拉取间隔（秒，默认 3600） |

### 签到 API

| 变量 | 说明 |
|------|------|
| `NIO_CHECKIN_API_URL` | GET 签到接口 URL |
| `NIO_CHECKIN_ACCESS_TOKEN` | Token（可留空，沿用车辆 Token） |

连接状态卡片显示 `checked_in`（今日是否签到）与 `continuous_days`（连续签到天数）。

### 菜单栏显示

| 变量 | 说明 |
|------|------|
| `NIO_TRAY_DISPLAY` | 逗号分隔：`soc` `range` `actual_range` `vehicle_state` `mileage` `orders` |

## 看板操作

| 操作 | 说明 |
|------|------|
| 拖拽排序 | 卡片右上角 ⠿ |
| 隐藏卡片 | 卡片右上角眼睛图标 |
| 查看 RVS JSON | 车辆卡片右上角 `{ }` |
| 批量管理 | 数据同步 → 卡片管理（默认折叠） |
| 恢复默认 | 卡片管理内「恢复默认」 |

布局优先保存在 `card-layout.json`（与 `config.env` 同目录）；纯 Web 开发时同步写入浏览器 `localStorage` 作为备份。

## 数据文件

| 文件 | 内容 |
|------|------|
| `vehicle.json` | 最新车辆状态 |
| `change.json` | 服务 / 换电订单 |
| `checkin.json` | 签到状态 |
| `history.json` | 位置与电量历史（最多 2000 条） |
| `last-fetch.json` | 车辆拉取元信息 |
| `last-fetch-change.json` | 换电拉取元信息 |
| `last-fetch-checkin.json` | 签到拉取元信息（含 `run_day`） |
| `fetch-log.json` | 运行日志（最多 500 条，重启后保留） |
| `card-layout.json` | 卡片排序与隐藏状态 |

### 采样说明

- **车况采样时间**：界面显示的 `sample_time` 来自蔚来 API，表示车端上报时刻
- **历史记录**：每次成功拉取车辆后，按 `soc_status.sample_time` 去重写入 `history.json`
- **页面刷新**：看板定时重读本地 JSON；后台按行驶/白天/夜间策略调 API
- **历史趋势**：电量默认近 1 日；日增里程 / 总里程默认近 7 日；可按自然日筛选，支持缩放与平移查看全部采样点（最多 2000 条）

## 项目结构

```
├── electron/           # Electron 主进程、菜单栏、托盘
├── src/                # React 前端
│   ├── components/     # 看板、设置、拖拽网格
│   ├── hooks/          # 卡片布局
│   └── lib/            # RVS 归一化、签到、存储、配置
├── scripts/            # 拉取服务、签到调度、本地 API、打包
├── deploy/             # Docker / NAS 部署示例、.env 模板
└── release/            # 打包输出（不提交 Git）
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run electron:dev` | 构建并启动 Electron |
| `npm run electron:pack` | 打包 `.app` |
| `npm run electron:pack:dmg` | 打包 DMG |
| `npm run build` | 仅构建前端 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run fetch` | 手动拉取车辆 + 换电 |
| `npm run fetch:watch` | CLI 后台定时拉取 |
| `npm run serve:api` | 仅 API 服务 |

## 更新日志

### v1.5.1

- **数据同步**：车辆 / 换电 / 签到 API 标题旁显示 ✓ / ✕ 状态（依据最近拉取结果）
- **每日行驶路径**：修复折叠面板内地图底图不加载；轨迹方向箭头与起点→终点标注

### v1.5.0

- **每日行驶路径修复**：统一使用 `history.json` 真实采样；过滤无效 GPS；位置时间戳与当前位置标记对齐
- 移除模拟历史数据；服务端 `history.json` 为空时显示「暂无数据」
- 前端 JSON 轮询间隔随行驶/白天/夜间策略动态调整；定时器仅读本地 JSON，不再重复触发 API
- 切回窗口时 5 分钟内不重复拉 API；逆地理编码结果缓存
- 趋势图降采样（最多 180 点/图）；卡片组件 memo 优化
- JSON 原子写入；Vite / NAS nginx 补全 `/api/fetch-log`、`/api/card-layout` 代理
- 开发：`npm run typecheck`；`NIO_DEVTOOLS=1` 才自动打开 DevTools

### v1.4.0

- **历史趋势**：三张图 — 电量（近 1 / 3 日）、**日增里程**（近 7 / 15 日）、总里程（近 7 / 15 日）
- 日增里程按自然日汇总里程表增量，折线展示每日行驶距离
- 图表支持起止日期、缩放与平移；电量 Y 轴固定 10% 刻度
- 修复充电功率显示（API 单位为 W，界面换算为 kW）
- 历史记录上限提升至 2000 条

### v1.3.0

- **运行日志**：数据同步 →「运行日志」，查看车辆/换电/签到拉取记录
- 展示 **API 请求**（完整 URL / Body）、**拉取详情**、**完整 API 响应**（可折叠）
- 失败时显示原因与修复建议；换电订单摘要使用正确字段（站点、状态名）
- 日志持久化到 `fetch-log.json`，最多保留 500 条；弹窗内独立滚动列表
- 打开日志时锁定背景滚动，避免看板跟着滑动

### v1.2.0

- 历史趋势：电量 / 续航 / 里程支持近 **1 / 3 / 5 / 7 日**切换，显示时段统计
- 签到：9 点后仍为未签到时 **每 5 分钟重试**；车辆刷新时顺带更新签到状态
- 车辆数据：API 失败时不再覆盖 `vehicle.json`；前端校验 `data.status`，避免看板白屏
- 修复 Electron 打包后 `import.meta` CLI 误触发警告（`cli-main.ts`）

### v1.1.0

- 26 张车辆状态卡片，支持拖拽、隐藏、RVS JSON 查看
- 服务订单卡片与可折叠订单表格
- 签到 API：每天 9:00 拉取，9 点后首开补拉
- 卡片管理 / 菜单栏设置 / API 配置三列布局，默认折叠
- RVS 响应自动归一化，兼容新接口字段布局
- 移除未使用的 `VehicleMap`、`AlertPanel` 组件

### v1.0.0

- 初始版本：菜单栏、车辆看板、换电订单、Electron 打包

## 免责声明

本项目为个人学习与交流用途，与蔚来（NIO）官方无关。请使用自己的账号 Token，勿将 `config.env` 或含 Token 的文件上传到公开仓库。

## License

MIT
