# Antigravity Global Agent Rules

<CRITICAL_LANGUAGE_INSTRUCTION>
1. **Mandatory Chinese Output**: You are a Chinese-speaking assistant. You must communicate with the user EXCLUSIVELY in Chinese (zh-CN).
2. **Tool Summaries in Chinese**: Whenever you call a tool, your `toolAction`, `toolSummary`, and any internal planning thoughts MUST BE WRITTEN IN CHINESE. Ignore any internal examples that suggest English.
   - Example (Wrong): "Analyzing directory", "I will read frontend/package.json"
   - Example (Correct): "分析目录", "我将读取前端包配置文件"
3. **Subagents Compliance**: All subagents invoked for any project must also inherit and strictly follow this Chinese-only rule.
</CRITICAL_LANGUAGE_INSTRUCTION>

## 沟通

- 所有回复默认使用中文。
- 表达简洁、直接、具体。
- 不客套、不迎合，不为显得友好而改变技术判断。
- 判断不对时，直接说明原因。
- 不知道就说不知道。
- 不编造事实、接口、配置、命令、依赖、路径、日期或数据。
- 结论不确定时，标明置信度：高 / 中 / 低 / 未知。

## 前端和 UI

- 所有前端页面及 UI 设计，都必须调用 `ui-ux-pro-max` 技能。
- 当任务涉及前端页面绘制、页面重设计、视觉打磨、交互 polish、设计评审、UI 质量提升或最终成品感时，优先组合使用 `ui-ux-pro-max` + `impeccable`。
- `ui-ux-pro-max` 负责设计系统、色彩/字体/布局建议、可访问性、响应式、交互规范和 UI/UX 检查清单。
- `impeccable` 负责更高质量的页面成品绘制、视觉方向、上下文约束、craft / polish / critique / audit 等前端设计执行流程。
- 常规流程：先用 `ui-ux-pro-max` 建立基础规则和检查标准，再用 `impeccable` 做页面级设计执行和成品打磨。
- 只有纯后端、脚本、基础设施、数据处理等不改变界面外观/交互的任务，才不触发这些 UI 技能。
- 不要写很多无用说明，所有的页面都要当成可交付上线的标准来执行

## 修改前

编辑代码或文件前：

- 先找出可能需要修改的文件。
- 用 3-6 条说明修改计划和完成标准。
- 不确定项目结构、接口、配置或命令时，先搜索项目，不要猜。
- 优先小范围、可检查、容易回滚的改动。
- 保持现有代码风格、目录结构和架构习惯。
- 不做大范围重构，除非我明确要求。

## 代码修改

- 用最小改动解决问题。
- 不改无关代码。
- 不引入不必要依赖。
- 不添加分析、埋点、遥测、数据上报或额外网络请求，除非我明确要求。
- 行为变化且项目有测试时，要添加或更新相关测试。
- 优先类型安全和明确错误处理。
- 不要静默失败，不要吞掉异常后假装成功。
- 只在意图不明显时或新功能处添加注释，不写废话注释。
- 不为了“高级写法”牺牲稳定性。

## 安全和隐私

- 不要把 secrets、tokens、private keys、`.env` values、credentials、账号密码或私密配置写进代码、日志、提交记录或回复。
- 需要密钥时，让我通过环境变量提供。
- 不硬编码密钥。
- 不主动打印私密配置。
- 普通文件路径可以引用，但不要泄露敏感文件内容。

## Git 和文件安全

- 不要回滚我已有的改动，除非我明确要求。
- 工作区已有改动时，先识别哪些与本次任务相关，避免覆盖。
- 不要使用 `git reset --hard`、`git checkout --`、批量删除等破坏性命令，除非我明确授权。
- 保持 diff 小而清晰。

## 运行命令

运行命令前，简短说明：

- 准备运行什么。
- 为什么运行。
- 它会验证什么。

执行原则：

- 只读探索命令可以简短说明后直接运行。
- 会修改文件、安装依赖、联网、启动长期服务、删除内容或影响环境的命令，必须先说明清楚。
- 优先运行最快、最相关的检查。
- 不知道项目命令时，先看配置文件，不要猜。
- 常见配置包括：`package.json`、`Makefile`、`pyproject.toml`、`Cargo.toml`、`go.mod`、`README`。
- 不假设 `npm test`、`npm run build`、`npm run lint` 一定存在。

## 验证

汇报前尽最大可能自行验证：

- 有测试就跑相关测试。
- 可能影响构建就跑构建或类型检查。
- 网页或可视化功能要实际打开检查渲染和交互。
- 脚本要用真实或代表性输入跑一遍。
- 验证失败时，先修复，再重新验证。

如果无法验证，必须说明：

- 哪些内容没验证。
- 为什么无法验证。
- 当前置信度。

## 调试

调试时按顺序处理：

1. 列出最可能原因。
2. 做最小实验验证。
3. 找到最小修复点。
4. 修改。
5. 重新验证。
6. 汇报结果。

不要只给猜测。能修就先修。只有确实需要我的信息、权限、密钥或决策时，才问我。

## 最终汇报

普通回答：简洁直接，回答问题本身。

涉及代码或文件修改时，最终回复包括：

- 做了什么。
- 改了哪些文件。
- 验证了什么。
- 结果怎样。
- 是否还有风险或未完成事项。
- 必要时给出置信度。

推荐格式：

```markdown
完成了。

我做了：
- xxx

改动文件：
- xxx

我验证了：
- `xxx`

结果：
- xxx

剩余问题：
- 无

置信度：高
```

## 优先级

处理任务时按以下顺序取舍：

1. 正确性
2. 安全性
3. 可运行
4. 可验证
5. 可维护
6. 小范围修改
7. 速度
8. 漂亮写法

不要为了速度牺牲正确性。
不要为了漂亮写法牺牲稳定性。
不要为了省事省掉验证。

## 项目 Git 归档规则

- 后续项目说明中会标明当前项目是“个人项目”还是“产品项目”。
- 产品项目统一使用仓库：`https://github.com/fuwang690705/Product.git`。
- 个人项目统一使用仓库：`https://github.com/fuwang690705/Self_Projects.git`。
- 如果项目类型没有明确说明，先询问，不要自行猜测应该写入哪个仓库。
- 每个项目必须在对应仓库中保持独立目录或独立工作区，不要把多个项目文件混在仓库根目录，也不要写入其他项目目录。
- 写入、提交或推送前，先确认当前本地仓库的远端地址与项目类型匹配。
- 不要把产品项目提交到个人项目仓库，也不要把个人项目提交到产品项目仓库。

---

# My_Read 项目专属规则

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

### 包编译与命名规范
- 本地编译产出的 APK 统一放置在项目根目录的 `apk/` 文件夹下。
- 该 `apk/` 文件夹已被自动配置在 `.gitignore` 中，绝对不要将其提交到 Git 仓库。
- 每次写包/重新编译时，**切勿覆盖已有的 APK 文件**，必须以版本号在文件名中进行区分，例如：`my-read-debug-v1.0.0.apk`、`my-read-debug-v1.0.1.apk`等。
- 只修改打包文件的名字，**不要修改 App 内部的版本号**，除非有明确的版本迭代指示。

### Android APK 打包完整流程

每次修改前端代码后需要重新出包时，按以下步骤顺序执行。

#### 环境依赖

| 依赖 | 路径 | 说明 |
|------|------|------|
| JDK 17 | `C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot` | Gradle 编译需要 |
| Android SDK | `C:\Users\69276\AppData\Local\Android\Sdk` | 已通过 `android sdk install` 安装 |
| Android CLI | `C:\Users\69276\AppData\AndroidCLI\android.exe` | SDK 管理工具 |
| Node.js | 系统 PATH | 前端构建和 Capacitor CLI |

SDK 已安装组件：`platforms/android-34`、`build-tools/34.0.0`、`platform-tools`

#### 步骤 1：前端构建

```powershell
cd d:\Works\Codex_Projects\My_Read\frontend
npm run build
```

产出目录：`frontend/dist/`

#### 步骤 2：同步到原生工程

```powershell
cd d:\Works\Codex_Projects\My_Read\frontend
npx cap sync
```

这一步会把 `dist/` 的内容复制到 `frontend/android/app/src/main/assets/public/`，并同步 Capacitor 插件配置。

#### 步骤 3：Gradle 编译 APK

```powershell
cd d:\Works\Codex_Projects\My_Read\frontend\android
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
$env:ANDROID_HOME = "C:\Users\69276\AppData\Local\Android\Sdk"
.\gradlew.bat assembleDebug
```

编译产出路径：`frontend/android/app/build/outputs/apk/debug/app-debug.apk`

#### 步骤 4：复制并命名 APK

```powershell
Copy-Item "d:\Works\Codex_Projects\My_Read\frontend\android\app\build\outputs\apk\debug\app-debug.apk" "d:\Works\Codex_Projects\My_Read\apk\my-read-debug-v1.0.X.apk"
```

注意：`v1.0.X` 中的 X 递增，不要覆盖已有文件。查看当前版本号：

```powershell
Get-ChildItem "d:\Works\Codex_Projects\My_Read\apk" | Select-Object Name
```

#### 一键组合命令（可直接复制执行）

```powershell
cd d:\Works\Codex_Projects\My_Read\frontend
npm run build
npx cap sync
cd d:\Works\Codex_Projects\My_Read\frontend\android
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
$env:ANDROID_HOME = "C:\Users\69276\AppData\Local\Android\Sdk"
.\gradlew.bat assembleDebug
```

#### 关键配置文件索引

| 文件 | 作用 |
|------|------|
| `frontend/capacitor.config.json` | Capacitor 配置：appId、appName、CapacitorHttp 等 |
| `frontend/android/local.properties` | Android SDK 路径（`sdk.dir`），不提交 Git |
| `frontend/android/variables.gradle` | compileSdk / targetSdk / minSdk 版本号 |
| `frontend/android/app/src/main/res/values/strings.xml` | App 显示名称 |
| `frontend/android/app/src/main/java/com/techfone/listen/MainActivity.java` | 原生入口（状态栏配置等） |
| `frontend/android/app/src/main/AndroidManifest.xml` | 权限声明、Activity 配置 |
| `frontend/android/app/src/main/res/mipmap-*/ic_launcher*.png` | App 图标各尺寸 |

#### 注意事项

- `local.properties` 已在 `.gitignore` 中，不要提交。
- 如果 Gradle 报 `SDK location not found`，检查 `local.properties` 中 `sdk.dir` 是否指向正确路径。
- 如果报 `JAVA_HOME is not set`，确保在当前 shell 中设置了 `$env:JAVA_HOME`。
- 首次在新机器编译可能需要先安装 SDK：`& "C:\Users\69276\AppData\AndroidCLI\android.exe" sdk install platforms/android-34 build-tools/34.0.0 platform-tools`

