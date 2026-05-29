# AGENTS.md

## 项目必读（部署与联调）

### 线上域名
- 站点：`http://listen.techfone.xyz/`
- API 示例：`http://listen.techfone.xyz/api/auth/status`

### 服务器与路径
- 服务器项目目录：`/opt/my-read`
- 说明：本机实际在线目录是 `/opt/my-read`（不是 `~/apps/My_Read`）

### Docker 编排与端口
- 生产使用编排文件：`docker-compose.server.yml`
- 后端容器服务端口：`3001`（容器内）
- 前端容器映射端口：`127.0.0.1:18080 -> 80`

### 反向代理链路
- 服务器上已有网关占用 `80/443`（openresty）
- 外层网关将域名流量反代到本项目前端入口：`127.0.0.1:18080`
- 前端 Caddy 再将 `/api/*` 反代到 `backend:3001`

### 常用部署命令
在服务器执行：

```bash
cd /opt/my-read
docker compose -f docker-compose.server.yml up -d --build
docker compose -f docker-compose.server.yml ps
```

### 快速健康检查
```bash
curl -sS http://127.0.0.1:3001/api/health
curl -sS http://127.0.0.1:18080/api/auth/status
curl -sS http://listen.techfone.xyz/api/auth/status
```

### 当前功能形态（2026-05-02）
- 前端三页：`书架 / 播放器 / 我的`
- 我的页：头像、昵称、登录/注册/快速登录、设置、关于菜单
- 听书源：`WebDAV`（登录后从“我的 -> 设置”里填写 `WebDAV 地址/用户名/密码/目录`）
- 用户账号：优先 MySQL（配置 `MYSQL_HOST/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE` 后自动建表 `my_read_users`），未配置时回退到 `/app/data/users.json`
- 音频播放走后端代理：`/api/audio-stream/:fileId`（不在前端暴露 WebDAV 密码）

### 代码文件索引（页面与接口）

#### 前端入口与页面样式
- `frontend/src/App.vue`：主应用模板与页面逻辑（书架、播放器、我的、收藏、弹窗、抽屉）。
- `frontend/src/styles.css`：全局样式入口，只负责导入 `frontend/src/styles/*`。
- `frontend/src/styles/base.css`：全局基础样式、手机外壳、页面容器。
- `frontend/src/styles/bookshelf.css`：书架页样式（今日继续、书籍列表、章节目录）。
- `frontend/src/styles/player.css`：播放器页样式（封面、进度条、播放控制、功能按钮）。
- `frontend/src/styles/profile.css`：我的页样式（头像卡片、听书源状态、菜单列表）。
- `frontend/src/styles/favorites.css`：我的收藏页样式。
- `frontend/src/styles/navigation.css`：底部导航栏样式。
- `frontend/src/styles/dialogs.css`：登录、设置、关于等弹窗样式。
- `frontend/src/styles/sheets.css`：章节、播放设置、倍速、睡眠定时等底部抽屉样式。
- `frontend/src/styles/settings.css`：设置项与历史/收藏类列表的通用样式。
- `frontend/src/api.js`：前端 API 请求封装。
- `frontend/src/storage.js`：前端本地存储封装。

#### 后端入口与接口模块
- `backend/src/server.js`：后端入口，只负责创建 Express、挂载中间件和路由模块。
- `backend/src/routes/health.js`：健康检查接口，`GET /api/health`。
- `backend/src/routes/auth.js`：授权状态与配置接口，`/api/auth/*`。
- `backend/src/routes/user.js`：用户会话、注册、登录、快速登录、退出接口，`/api/user/*`。
- `backend/src/routes/aliyun.js`：阿里云盘 OAuth 开始与回调接口，`/api/aliyun/*`。
- `backend/src/routes/books.js`：书架列表接口，`GET /api/books`。
- `backend/src/routes/playback.js`：播放记录接口，`/api/playback/records`。
- `backend/src/routes/subscriptions.js`：订阅源与订阅书籍接口，`/api/subscriptions/*`。
- `backend/src/routes/audio.js`：音频地址与后端代理播放接口，`/api/audio-url/:fileId`、`/api/audio-stream/:fileId`。
- `backend/src/middleware/session.js`：登录态校验中间件，提供 `requireSessionUser`。

### 易踩坑
- 不要直接用根目录 `docker-compose.yml`（它会尝试绑定 `80/443`，通常会端口冲突）
- 优先使用：`docker-compose.server.yml`

## 发布 Checklist

### 发布前
- 确认代码目录：`/opt/my-read`
- 确认使用编排文件：`docker-compose.server.yml`
- 确认本次改动已同步到服务器（前端 `frontend/src`、后端 `backend/src`）
- 如涉及配置项，确认 `.env.production` 或应用内配置项已准备
- 如涉及登录，确认 MySQL 环境变量可用，或接受文件存储回退
- 如涉及 WebDAV，确认测试账号可访问目标目录，且目录下有可播放音频文件

### 发布执行
```bash
cd /opt/my-read
docker compose -f docker-compose.server.yml up -d --build
docker compose -f docker-compose.server.yml ps
```

### 发布后检查
- 容器状态：`backend` 为 `healthy`，`frontend` 为 `running`
- 本机后端健康检查：
```bash
curl -sS http://127.0.0.1:3001/api/health
```
- 前端入口 API 检查：
```bash
curl -sS http://127.0.0.1:18080/api/auth/status
```
- 域名侧 API 检查：
```bash
curl -sS http://listen.techfone.xyz/api/auth/status
```
- 页面检查（浏览器）：
1. 能打开首页
2. 底部三页签显示正常（书架/播放器/我的）
3. “我的”页可登录/注册/快速登录
4. 登录后“设置”可保存 WebDAV 配置
5. “书架”页能刷新出章节
6. “播放器”页可播放音频并可拖动进度

### 回滚建议
- 优先回滚为上一版可用镜像或上一版代码后重新执行：
```bash
cd /opt/my-read
docker compose -f docker-compose.server.yml up -d --build
```
- 回滚后重复“发布后检查”全部步骤。

## 移动 App 方案（简单版）

### 目标
- 当前项目后续优先封装为手机端 App，先做 Android，后续再补 iOS。
- 不希望继续以浏览器网页形式作为主要使用方式。

### 技术路线
- 前端继续沿用现有 `Vue 3 + Vite`。
- 后端继续独立部署，App 通过接口获取书架、章节和音频地址。
- App 外壳建议使用 `Capacitor`，方便先做 Android，后续复用到 iOS。

### 播放方案
- 播放不要长期依赖前端 `<audio>` 作为最终形态。
- 最终建议接入系统原生播放器能力：
  - Android：原生媒体播放 + 通知栏/锁屏控制
  - iOS：后续接系统控制中心能力

### 需要支持的核心体验
- 安装后直接打开 App，不再通过浏览器访问。
- 支持播放 / 暂停。
- 支持上一章 / 下一章。
- 支持后台播放。
- 支持系统媒体控制入口（如通知栏、锁屏、控制中心）。

### 当前实施建议
- 第一阶段先完成 Android 版 App 封装。
- 等 Android 方案稳定后，再补 iOS 适配。
