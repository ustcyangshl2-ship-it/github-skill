# SkillHub · AI Skill 商店

面向中文用户的 AI Skill、工具与框架导航，提供公开仓库资料、分类检索、精选合集和入门教程，并为编辑提供 GitHub 采集管理后台。当前版本为 **0.2.0：第二阶段采集与管理**；V1.0 的目标是免费导航与会员教程，完整会员业务仍待建设。

## 1. 项目解决什么问题

AI 项目分散在不同 GitHub 仓库中，查找适合科研、教学、办公或开发的资源时，需要逐个核对用途、来源、许可证与维护状态。SkillHub 将这些公开资料整理为可搜索的目录，并保留原始来源及采集时间，帮助用户找到项目后继续阅读源文档。

对编辑而言，后台将仓库导入、关键词发现、增量刷新和失败恢复放入持久化队列，减少重复整理。采集结果与中文解读、人工评测分开管理；新采集条目保持草稿，未经审核的中文内容不会公开。

## 2. 主要功能

| 功能 | 当前实现 |
| --- | --- |
| 公开目录 | 数据库驱动首页；关键词搜索、分类和资源类型筛选；Star、最近更新、编辑精选排序；分页 |
| 项目详情 | 原始 GitHub 描述与链接、Star/Fork 快照、许可证、更新和采集时间、归档及评测状态 |
| 排行与合集 | Star 排行、编辑精选排行；种子数据包含 4 个精选合集 |
| 教程 | 免费教程阅读；会员正文在服务端确认有效权益后读取，未授权 API 请求返回 403 |
| 登录与用户中心 | GitHub OAuth、数据库会话；查看已有收藏和会员记录；后台每次请求重新检查数据库角色 |
| 仓库采集 | 公开仓库 URL 导入、关键词分页发现、GitHub 唯一 ID 去重、元数据及 README 采集 |
| 增量与恢复 | 独立 ETag 条件更新、日快照、限速等待、失败重试、任务进度与逐仓库日志持久化 |
| 后台管理 | EDITOR/ADMIN 查看仓库和任务、手动刷新、暂停自动发现更新、重试失败任务；记录管理审计 |

首次初始化包含 8 个公开仓库条目，公开的是原始元数据；对应的 8 条中文解读草稿保留在待审队列。免费教程是本项目原创的仓库筛选入门指南，各第三方项目的专项安装教程仍待建设。

以下功能 **待建设**：真实大模型调用、中文分类与摘要生成、人工审核发布流程、评测/合集/教程/用户管理 CRUD、收藏新增与删除、会员开通与授权管理、近期增长排行、定时发现或刷新策略、生产部署。已有会员读取控制和用户中心不代表会员业务闭环已完成。GitHub OAuth 的实际登录与回调验收需要配置应用密钥。

## 3. 安装方法

以下命令均在项目根目录执行。依赖版本由 `package-lock.json` 锁定。

### 环境要求

- Node.js 24，或 Node.js 22.13 及以上的 22 系列，配套 npm；项目不使用 Node.js 25 及以上运行。
- PostgreSQL：当前部署配置使用 18 系列；本地安装时需先创建数据库和可连接的数据库角色。
- Windows 可使用 PowerShell 和 `scripts/run.ps1`；原生 PostgreSQL 初始化辅助脚本需在 PowerShell 7.2 及以上执行。

### 安装依赖并配置环境

```powershell
node --version
npm ci
# 只在 .env 不存在时复制，保留已有配置。
if (!(Test-Path -LiteralPath .env)) {
  Copy-Item -LiteralPath .env.example -Destination .env
}
# 生成会话密钥，将输出填入 .env 的 NEXTAUTH_SECRET。
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

编辑 `.env`：

| 变量 | 用途与要求 |
| --- | --- |
| `DATABASE_URL` | 必填，指向已存在的 PostgreSQL 数据库；模板中的 `CHANGE_ME` 必须替换，主机和端口按实际实例填写 |
| `NEXTAUTH_URL` | 本地使用 `http://localhost:3300`；部署时填写站点 HTTPS origin |
| `NEXTAUTH_SECRET` | 填入上面生成的随机密钥 |
| `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` | 使用 GitHub 登录时必填；只浏览公开页面可暂不配置 |
| `GITHUB_TOKEN` | GitHub 采集凭据，与 OAuth 应用密钥独立；未配置可使用匿名 API，但受共享额度限制；首次 seed 不需要它 |
| `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` | 后续 AI 接入的预留配置；当前填写后也不会启用模型调用 |
| `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB` | Docker Compose 数据库配置，本地直连主要使用 `DATABASE_URL` |

`.env` 和密钥不应提交到 Git。GitHub 登录的本地 OAuth Callback URL 为 `http://localhost:3300/api/auth/callback/github`，Homepage URL 为 `http://localhost:3300`。

### 初始化数据库并启动

使用 Node.js 22/24 的终端依次执行：

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

访问 [本地首页](http://localhost:3300)。开发命令只启动 Web；需要执行后台采集任务时，在另一个终端的项目根目录运行：

```powershell
npm run collector:worker
```

Windows 的 `scripts/run.ps1` 可以替代 `npm run`，例如 `.\scripts\run.ps1 dev`。它优先使用 `SKILLHUB_NODE` 指定的 `node.exe`，其次尝试本机已有的 Codex 捆绑 Node，最后使用 PATH 中的 Node；仍需安装 npm。例如：

```powershell
$env:SKILLHUB_NODE = 'C:\path\to\node24\node.exe'
.\scripts\run.ps1 db:generate
.\scripts\run.ps1 db:migrate
.\scripts\run.ps1 db:seed
.\scripts\run.ps1 dev
```

首次 seed 读取已提交的 `data/github-snapshot.json`，补充缺失记录并保留已有人工编辑；它也会将原始、从未审核的 P1 中文初始化内容移入待审队列。重跑 seed 不会从新快照更新已存在仓库的元数据，日常更新使用后台采集队列。

### 可选：Windows 专用本地数据库

如果没有运行中的 PostgreSQL 实例，但已有包含 `bin`、`lib`、`share` 的原生 PostgreSQL 程序目录，可在安装依赖后，用以下步骤替代手动创建数据库和复制 `.env`。首次执行前不要复制 `.env`：辅助脚本会生成随机数据库密码和会话密钥，检测到已有 `.env` 会拒绝首次初始化。

```powershell
pwsh -NoProfile -File .\scripts\local-db.ps1 -NativeRoot 'C:\path\to\postgresql'
# 使用上面的 Node.js 22/24 运行时创建 skillhub 数据库。
node --import tsx scripts/create-local-db.ts
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

该方式的程序和数据位于 `%LOCALAPPDATA%\SkillHub\postgres`，监听 `127.0.0.1:55432`。首次生成的配置可再补充 OAuth 和采集凭据。此数据库角色仅用于本地开发；生产部署说明见 [docs/deployment.md](docs/deployment.md)。

### 构建与再次启动

```powershell
npm run build
npm run start
```

`start` 启动 Next.js standalone 服务与独立采集 worker。只运行 Web 时，可先在当前 PowerShell 设置 `$env:SKILLHUB_RUN_WORKER = 'false'`。`npm run collector:once` 只处理当前可执行步骤，未来到期的重试任务仍保存在数据库中。

Windows 在数据库、依赖和构建已准备好后，也可双击 `Start-SkillHub.cmd`：它按现有配置启动 Web/worker；若配置指向上述专用本地数据库且程序已存在，还会启动该数据库，不会重新 seed。停止 Web/worker 使用各自终端的 `Ctrl+C`；专用 PostgreSQL 可用 `local-db.ps1` 的 `-Action stop` 单独停止。

Docker Compose 已提供 Web、数据库、迁移与 worker 服务，完整配置和命令见 [部署说明](docs/deployment.md)。容器运行和生产环境验收仍待完成。

## 4. 使用方法

### 浏览与查找资源

1. 打开 `/skills`，输入项目名、仓库名、标签或关键词，点击“搜索”。搜索还会匹配已有中文摘要和原始仓库描述。
2. 选择分类，使用类型和排序下拉框后点击“应用”；有多页结果时通过分页切换。
3. 点击项目进入 `/skills/:slug`，核对原始介绍、许可证、快照日期和评测状态，再通过“访问 GitHub”阅读源仓库。
4. 在 `/rankings` 查看 Star 或编辑精选排行，在 `/collections` 查看合集，在 `/tutorials` 阅读已发布教程。

Star/Fork 为带日期的快照，不是实时数据；精选不等于已验证。详情中未审核的中文解读和未经实测的效果会明确显示待审核或未实测。

### 登录与后台采集

1. 配置 OAuth 后访问 `/login` 完成 GitHub 登录，新用户默认为 USER；`/account` 展示已有收藏和会员状态。
2. 运维人员明确选择已经登录创建的用户 ID，在项目根目录授予后台角色；命令不会创建默认管理员：

   ```powershell
   npm run admin:grant -- --user-id EXISTING_USER_ID --role ADMIN
   # 也可将 ADMIN 替换为 EDITOR；两种角色均可管理采集。
   ```

3. 打开 `/admin/repositories`，输入标准 HTTPS GitHub 仓库地址加入队列，或按关键词、最低 Star、每页数量和最多页数创建发现任务。
4. 确认 worker 正在运行，点击任务链接，在 `/admin/collection-tasks/:id` 查看状态、逐仓库结果、下一重试时间与日志。提交返回 202 只表示已入队；应以任务终态和日志判断采集结果。
5. 在仓库详情查看元数据与 README 摘录，按需刷新或暂停自动发现更新；FAILED 任务可以手动重试。新仓库保持 `DRAFT`、`UNKNOWN`，不会进入公开目录；刷新已有仓库不会覆盖人工编辑内容。

更改 `GITHUB_TOKEN` 后应重启所有 worker。没有 OAuth 配置时登录页会提示未配置；普通 USER 无后台权限。详细权限、参数和恢复机制见 [采集操作说明](docs/05-github-collector.md)。

## 5. 输入输出示例

以下公开 API 示例可在本地服务运行后直接执行；目录示例以完成首次 seed、未改动对应条目为前提。仓库计数、Star、时间和数据库 ID 会随实际数据变化，不固定为示例值。

### 示例一：检索办公类工具

网页输入：在目录搜索 `markitdown`，分类选择“办公效率”，资源类型选择“工具”。输出为 MarkItDown 条目，可进入详情查看 `microsoft/markitdown` 的来源信息。

等价 API 输入及结果字段提取：

```powershell
$result = Invoke-RestMethod -Uri 'http://localhost:3300/api/v1/skills?q=markitdown&type=TOOL&category=office&sort=stars&page=1&pageSize=1'
$result.data | ForEach-Object {
  [pscustomobject]@{
    slug = $_.slug
    title = $_.title
    type = $_.type
    repository = $_.repository.fullName
  }
} | ConvertTo-Json
```

输出（以上命令提取的字段，完整 API 返回还包含 `data` 和分页 `meta`）：

```json
{
  "slug": "markitdown",
  "title": "MarkItDown",
  "type": "TOOL",
  "repository": "microsoft/markitdown"
}
```

目录类型只接受 `SKILL`、`TOOL`、`FRAMEWORK`；排序只接受 `stars`、`recent`、`editor`；`page` 为 1–10000，`pageSize` 为 1–24，默认 6。关键词最长 100 字。只返回 `PUBLISHED` 条目，无匹配项时 `data` 为 `[]`、`meta.total` 为 `0`。

### 示例二：无效参数

输入：

```powershell
curl.exe -i 'http://localhost:3300/api/v1/skills?type=PLUGIN'
```

输出：HTTP `400 Bad Request`，JSON 正文为：

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "请求参数无效，请检查关键词、筛选条件或分页"
  }
}
```

### 示例三：后台仓库导入

已登录 EDITOR/ADMIN 在 `/admin/repositories` 的仓库地址框输入 `https://github.com/microsoft/markitdown`。页面发送的请求为：

```http
POST /api/v1/admin/repositories/import
Content-Type: application/json
Origin: http://localhost:3300

{"url":"https://github.com/microsoft/markitdown"}
```

此处是请求结构示例；实际调用还需要有效登录会话，推荐直接使用后台表单提交。输出为 HTTP `202`，响应的 `data.task.id` 是任务 ID，`data.reused` 表示是否复用已有活动任务；页面提供任务进度链接。

worker 采集成功后显示 `SUCCEEDED` 和真实仓库资料。这个种子仓库已经存在，导入会更新/复用对应记录；导入尚未收录的公开仓库则创建草稿，不自动发布。若遭遇 GitHub 限速，任务保留下一重试时间，应等待 worker 恢复处理，不将入队提示当作采集完成。

### 示例四：数据库健康检查

输入：

```powershell
curl.exe 'http://localhost:3300/api/health'
```

数据库可连接时输出 HTTP `200`：

```json
{"data":{"status":"ok","database":"connected","phase":1}}
```

当前路由的 `phase` 固定为 `1`，不是项目版本或整体功能验收状态。数据库不可用时返回 HTTP `503` 和 `SERVICE_UNAVAILABLE`，不会替换为模拟成功数据。

## 项目结构与文档

| 路径 | 内容 |
| --- | --- |
| `src/app/` | 前台、登录、用户中心、后台页面及 API Route Handlers |
| `src/server/` | 目录、教程读取及 GitHub 采集服务与 worker |
| `src/lib/` | 数据库连接、鉴权、访问控制、输入校验和 API 错误处理 |
| `prisma/` | 数据库 Schema、SQL 迁移、初始化数据 |
| `data/github-snapshot.json` | 首次初始化使用的公开仓库元数据快照 |
| `scripts/` | 本地启动、数据库初始化、管理员授权和验收脚本 |
| `tests/` | 安全和采集单元测试及采集测试夹具 |
| `docs/` | 架构、数据库、API、路线图、部署及阶段报告 |

进一步阅读：[架构与目录](docs/01-architecture.md)、[数据库](docs/02-database.md)、[API 清单](docs/03-api.md)、[分阶段计划与验收](docs/04-roadmap.md)、[部署说明](docs/deployment.md)、[第一阶段报告](docs/phase-1-report.md)、[第二阶段采集说明](docs/05-github-collector.md)、[第二阶段报告](docs/phase-2-report.md)。

## 质量门禁

```powershell
.\scripts\run.ps1 lint
.\scripts\run.ps1 typecheck
.\scripts\run.ps1 test
.\scripts\run.ps1 build
.\scripts\run.ps1 test:integration
# 本地站点运行时执行公共 HTTP 验收：
.\scripts\run.ps1 test:http
# 以下两项使用独立的 skillhub_p2_test 数据库，后台 HTTP 脚本自行启动 3301 测试服务：
.\scripts\run.ps1 test:collector
.\scripts\run.ps1 test:admin-http
# 真实 GitHub 网络验证，遇限速会保留待执行任务并返回非零：
.\scripts\run.ps1 test:collector-live
```

数据库和公共 HTTP 验收脚本仅允许连接本机专用数据库 `127.0.0.1:55432/skillhub`，并依赖初始数据状态，不能对生产运行。公共 HTTP 验收会创建临时草稿和会员教程后清理；采集及后台 HTTP 验收会重置独立的 `skillhub_p2_test` 测试库。真实采集验收保留新仓库草稿和任务日志，并清理临时操作者。

`data:refresh` 是 P1 一次性快照工具，通过固定 GitHub REST 端点读取公开元数据，遇限速明确失败；日常采集使用 P2 队列和 worker。已有阶段验收证据及其边界见阶段报告；文档示例不替代 OAuth 登录、容器部署或生产验收。

## 安全与内容边界

GitHub URL 只接受标准 HTTPS 仓库地址；采集不下载或执行第三方项目代码。采集到的 README 作为不可信资料读取，不作为系统指令。页面使用 React 文本转义，不渲染来源中的原始 HTML；后台写接口验证同源 Origin，角色与会员权益由服务端数据库记录决定。

AI JSON 契约已有 Zod 校验，但模型调用和人工审核流程待建设。GitHub、模型及会话密钥只配置在服务端环境变量中。Star 为元数据快照，精选不等于安装、兼容性或效果验证，不提供虚构增长、评分或用户。

## 技术栈与版本

Next.js App Router、严格 TypeScript、Tailwind CSS、shadcn/ui 源组件、PostgreSQL 与 Prisma，登录使用 NextAuth 的 GitHub Provider 和 Prisma Adapter。

当前依赖声明：Next.js 16.4.0、React 19.2.8、Prisma 6.19.3、next-auth 4.24.15、Tailwind CSS 4.3.3、ESLint 9.39.5、Vitest 4.1.11、tsx 4.23.15；`deepmerge-ts` 覆盖为 8.0.2。完整依赖以 `package.json` 和 `package-lock.json` 为准，历史运行环境和依赖验收记录见阶段报告。
