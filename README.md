# NIO-Dash

蔚来车辆看板 — macOS 菜单栏应用，自动拉取车辆状态与服务订单，在本地展示电量、续航、换电记录与每日行驶路径。

![Platform](https://img.shields.io/badge/platform-macOS-blue)
![Electron](https://img.shields.io/badge/Electron-35-47848F)
![React](https://img.shields.io/badge/React-19-61DAFB)

## 功能

- **菜单栏常驻**：右上角显示电量与续航，悬停查看最近拉取状态
- **车辆状态看板**：电量、续航、车门、空调、位置、行驶状态等
- **换电 / 服务订单**：充电、换电、维保等历史记录
- **智能定时拉取**
  - 车辆：行驶中 / 白天 09:00–17:00 / 夜间 17:01–08:59 分别配置间隔
  - 换电：独立定时配置
- **每日行驶路径**：按天汇总 GPS 采样，在地图上绘制轨迹
- **历史趋势**：电量、续航、里程折线图

## 截图说明

安装后应用驻留菜单栏，点击图标可打开完整看板窗口。

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

### 打包 Mac 应用

```bash
npm run electron:pack
```

产物位于 `release/`：

- `release/mac-arm64/蔚来车辆看板.app` — 可直接运行
- `release/蔚来车辆看板-mac-arm64.zip` — 压缩包

生成 DMG 安装镜像：

```bash
npm run electron:pack:dmg
```

### 仅 Web / API 开发（无 Electron）

```bash
npm install
cp deploy/.env.example deploy/.env
# 编辑 deploy/.env 填入 Token
npm run fetch:serve   # 定时拉取 + API
# 或
npm run serve:api     # 仅 API，需手动触发拉取
npm run dev           # 前端开发服务器
```

## 配置

首次启动 Mac 版时，会在用户目录生成配置文件：

```
~/Library/Application Support/蔚来车辆看板/config.env
~/Library/Application Support/蔚来车辆看板/data/
```

也可参考仓库内 `deploy/.env.example` 手动配置。

### 车辆 API（必填 Token）

| 变量 | 说明 |
|------|------|
| `NIO_VEHICLE_ACCESS_TOKEN` | Bearer Token |
| `NIO_VEHICLE_ID` | 车辆 ID |
| `NIO_VEHICLE_DEVICE_ID` | 设备 ID |
| `NIO_VEHICLE_POLL_DRIVING_SEC` | 行驶中拉取间隔（秒，默认 900） |
| `NIO_VEHICLE_POLL_DAY_SEC` | 白天拉取间隔（秒，默认 1800） |
| `NIO_VEHICLE_POLL_NIGHT_SEC` | 夜间拉取间隔（秒，默认 3600） |

### 换电 / 订单 API

| 变量 | 说明 |
|------|------|
| `NIO_CHANGE_ACCESS_TOKEN` | Bearer Token |
| `NIO_CHANGE_COOKIE` | Cookie（部分接口需要） |
| `NIO_CHANGE_POLL_INTERVAL` | 拉取间隔（秒，默认 3600） |

在应用内打开 **数据同步** 面板，可图形化编辑并保存上述配置。

## 数据文件

| 文件 | 内容 |
|------|------|
| `data/vehicle.json` | 最新车辆状态 |
| `data/change.json` | 服务 / 换电订单 |
| `data/history.json` | 位置与电量历史采样 |
| `data/last-fetch.json` | 车辆拉取元信息 |
| `data/last-fetch-change.json` | 换电拉取元信息 |

## 项目结构

```
├── electron/          # Electron 主进程、菜单栏
├── src/               # React 前端
├── scripts/           # 拉取服务、本地 API、打包脚本
├── deploy/            # 部署与环境变量示例
└── release/           # 打包输出（不提交 Git）
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | Vite 前端开发 |
| `npm run build` | 构建前端 |
| `npm run electron:dev` | 构建并启动 Electron |
| `npm run electron:pack` | 打包 Mac 应用 |
| `npm run fetch:watch` | CLI 定时拉取 |
| `npm run fetch` | 手动拉取一次车辆 + 换电 |

## 免责声明

本项目为个人学习与交流用途，与蔚来（NIO）官方无关。请使用自己的账号 Token，勿将 `config.env` 或含 Token 的文件上传到公开仓库。

## License

MIT
