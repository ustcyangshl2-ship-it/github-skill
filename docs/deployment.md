# 本地与 Docker 部署

## 第一阶段本机

应用使用3300端口，开发PG独立监听127.0.0.1:55432；数据目录 `%LOCALAPPDATA%\SkillHub\postgres\data`，不与其他项目共享。初始化脚本 `local-db.ps1` 要求原生PG目录；脚本复制程序到ASCII目录，兼容Windows中文项目路径。`.env`保存随机本地密码，不纳入Git。停库使用同一脚本 `-Action stop`。

开发：`scripts/run.ps1 dev`。生产构建本地验收：`scripts/run.ps1 build`，然后 `scripts/run.ps1 start`。

P2的start入口同时启动独立collector worker；dev入口只启动Web，需要另开终端运行 `scripts/run.ps1 collector:worker`。数据库队列保存任务进度，重启worker可恢复过期租约。`.env`更改GitHub Token后重启所有worker；采集角色和后台登录仍使用GitHub OAuth，未添加本地登录绕过。

## Docker 部署（文件已提供；本轮环境无Docker，容器运行尚未验收）

在有 Docker Engine + Compose 的主机：

1. 复制 `.env.example` 为 `.env`，设置随机 `POSTGRES_PASSWORD`（建议base64url/十六进制，不用需URL转义的字符）、随机 `NEXTAUTH_SECRET`，设置 `NEXTAUTH_URL=https://你的域名`。不要沿用本机连接密码。compose用内部db主机生成连接地址，不使用本机DATABASE_URL。
2. `docker compose up -d --build`。db有健康检查；migrate为一次性服务，成功后才启动web。
3. 首次阅读导航快照可选：`docker compose run --rm migrate npm run db:seed`。正式运营应由管理员审核后逐项维护。
4. `curl http://127.0.0.1:3300/api/health`；检查主页、目录及API。
5. 用Nginx/Caddy等反向代理到127.0.0.1:3300，配置HTTPS。数据库不对宿主开放端口。web为非root用户，standalone部署；迁移/seed用单独tools阶段。

PostgreSQL18数据卷挂载 `/var/lib/postgresql`（18的版本数据子目录）；不删除既有volume。迁移变更先备份，再在预发布恢复库演练。备份使用pg_dump/pg_restore，恢复后验证约束、计数和权限。Docker镜像标签在P5构建时核对可用性并固定digest。

## GitHub OAuth

GitHub OAuth App Homepage URL填写站点origin；Callback URL为 `https://你的域名/api/auth/callback/github`。本地为 `http://localhost:3300/api/auth/callback/github`。分别配置client id、secret；采集GITHUB_TOKEN与OAuth secret为不同凭据。新用户默认USER，数据库会话；后台每次请求重新读DB角色。缺凭据返回AUTH_NOT_CONFIGURED，不建立假会话。

首次管理员授权属于运维工作；P2已提供 `npm run admin:grant -- --user-id EXISTING_USER_ID --role ADMIN`，显式授予既有用户并记录AuditLog，不预置管理员或猜测邮箱。OAuth浏览器登录实测仍需要应用配置；角色/过期会话/Origin的后台HTTP矩阵已在独立测试数据库中验证。

## 生产待补

P2独立worker与调度、P3真实模型及审核、P4内容和会员后台、P5严格带nonce的CSP/HTTPS/限速/备份恢复。当前CSP对Next内联脚本使用unsafe-inline，已禁止frame/object；不应把第一阶段安全基础描述为生产完整加固。生产未发布前不要开放运营或收取会员费用。

数据库故障：公共health/API返回503；页面显示数据服务不可用，不降级到固定假条目。日志仅输出错误类别，不回传数据库密码/堆栈。密钥不写入Docker镜像（.dockerignore排除.env）。
