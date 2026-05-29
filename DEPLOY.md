# Oracle Cloud + Docker 部署指南

目标服务器：

- Debian 12 ARM64
- 公网 IPv4：`129.153.195.145`
- 推荐域名：`listen.techfone.xyz`

## 1. Cloudflare DNS

在 Cloudflare 为 `techfone.xyz` 添加记录：

| 类型 | 名称 | 内容 | 代理状态 |
| --- | --- | --- | --- |
| A | `listen` | `129.153.195.145` | 建议先 DNS only |

首次申请 HTTPS 证书时，建议先用灰云 `DNS only`。证书成功后可以继续灰云，也可以再切到橙云并使用 Cloudflare 的 Full/Strict SSL。

## 2. Oracle Cloud 防火墙

需要放行：

- TCP `80`
- TCP `443`
- 可选：TCP `22`，仅你的管理 IP 可访问更安全

Oracle Cloud 控制台安全列表/NSG 要放行，同时服务器系统防火墙也要放行。

Debian 上如果启用了 `ufw`：

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

## 3. 安装 Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

可选：让当前用户免 sudo 使用 Docker：

```bash
sudo usermod -aG docker $USER
newgrp docker
```

## 4. 上传项目

在服务器上选择目录：

```bash
mkdir -p ~/apps
cd ~/apps
```

把本项目上传到：

```text
~/apps/My_Read
```

例如你可以用 `scp`、`rsync`、Git 仓库或 VS Code Remote SSH。

## 5. 配置生产环境变量

```bash
cd ~/apps/My_Read
cp .env.production.example .env.production
nano .env.production
```

这里只需要确认站点和基础运行参数：

```env
APP_DOMAIN=listen.techfone.xyz
ACME_EMAIL=你的邮箱
PORT=3001
APP_DATA_DIR=/app/data
```

AList WebDAV 地址、账号、密码不要求写进 `.env.production`。启动后打开网页，进入 **我的 → AList 网盘授权**，按页面提示用 AList 获取阿里云盘授权，再把 AList 的 `/dav/` 地址保存到 App。Docker Compose 已把后端数据卷挂到 `/app/data`，重启容器不会丢失配置。

`.env.production` 不要提交到 Git，也不要发到公开聊天里。

## 6. 启动服务

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
docker compose logs -f
```

访问：

```text
https://listen.techfone.xyz
```

## 7. 更新项目

上传新代码后：

```bash
cd ~/apps/My_Read
docker compose up -d --build
```

## 8. 常见问题

### 证书申请失败

检查：

- Cloudflare DNS 是否解析到 `129.153.195.145`
- Cloudflare 是否先设为 `DNS only`
- Oracle Cloud 是否放行 80/443
- 服务器本机防火墙是否放行 80/443

### 前端能打开，但目录为空

检查后端配置：

```bash
docker compose logs backend
```

也可以访问：

```text
https://listen.techfone.xyz/api/auth/status
```

看 `configured` 是否为 `true`。

