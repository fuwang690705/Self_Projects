# 极简听书

一个正式化的听书 Web App 草稿升级版：

- `frontend/`：Vue 3 + Vite + Element Plus 播放器界面
- `backend/`：Node.js + Express，负责 WebDAV/AList、本地目录和旧版阿里云盘直连的列目录、音频代理

## 快速开始

```powershell
npm.cmd install
npm.cmd run install:all
```

如果 PowerShell 拦截 `npm`，请始终使用 `npm.cmd`。项目已配置本地 npm 缓存 `.npm-cache`，避免写入系统缓存目录时遇到权限问题。

启动：

```powershell
npm.cmd run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3001

打开前端后，进入 **我的 → AList 网盘授权**：

- 扫码打开 AList 的 Aliyundrive Open refresh_token 工具
- 在 AList 后台添加“阿里云盘 Open”存储
- 把 AList WebDAV 地址、账号、密码和听书目录保存到本应用

授权配置会保存到后端数据文件（默认 `backend/data/aliyun-config.json`；Docker 中是 `/app/data/aliyun-config.json`），不需要再进入服务器编辑 token。

## AList 阿里云盘说明

推荐链路：

```text
阿里云盘 -> AList 扫码授权 -> AList 暴露 /dav/ -> 本应用连接 AList WebDAV
```

AList WebDAV 地址通常是：

```text
https://你的 AList 域名/dav/
```

目录路径可以填 `/`，也可以填 `/阿里云盘/听书` 之类的 AList 挂载目录。token 不会暴露给浏览器查询接口；前端只请求本地后端 `/api/books` 和 `/api/audio-url/:fileId`。

## 生产部署

Oracle Cloud + Docker 部署见：

```text
DEPLOY.md
```
