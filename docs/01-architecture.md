# SkillHub V1.0 架构与目录设计

设计日期：2026-10-12。当前交付边界：设计 + 第一阶段。产品为免费精选导航、免费/会员教程；不含交易市场、在线执行、安装器。

## 环境检查与版本决策

初始工作目录只有空 Git 仓库，没有已有代码或需迁移的数据。本机默认 Node 25.2.1、npm 11.6.2、Git 2.53.0、Python 3.14.5；Docker、Compose、psql 未在 PATH 中发现。

开发使用已存在的独立 Node 24.19.0 LTS，不修改系统 Node。Next.js 16.4.0、React 19.2 稳定补丁线、TypeScript 5、Tailwind 4、Prisma 6.19.3。Auth.js 使用 npm 稳定 dist-tag 的 next-auth 4.24.15，其 peerDependencies 明确支持 Next 16、React 19；不引入 v5 beta。安装时固定精确版本并提交 package-lock.json，以实际 lint、tsc、测试和构建结果验证兼容性。shadcn/ui 为本地可维护源组件，采用 Radix Slot、CVA 和 Tailwind。

参考：[Next.js 安装要求](https://nextjs.org/docs/app/getting-started/installation)、[Auth.js 版本说明](https://authjs.dev/getting-started)、[Prisma 6 系统要求](https://www.prisma.io/docs/orm/v6/reference/system-requirements)。具体补丁与 peer 范围通过 npm registry 核对，最终版本以锁文件为准。

## 模块边界

```text
src/
  app/                      App Router 页面、Route Handlers
    skills/[slug]/          目录与详情
    rankings/ collections/  排行与专题
    tutorials/[slug]/        元数据与授权后的正文
    account/ login/ admin/   登录、用户、服务端保护后台
    api/                    v1 API、Auth.js
  components/               站点布局、搜索、卡片
    ui/                     shadcn/ui 源组件
  lib/                      Prisma、环境、验证、鉴权、响应
  server/                   数据访问、目录查询、教程访问策略
  types/                    Auth.js 类型扩展
prisma/
  schema.prisma             PostgreSQL 规范化模型
  migrations/               可部署 SQL 迁移
  seed.ts                   幂等种子，无伪造用户/评测/会员
data/                       真实 GitHub 元数据快照及出处
scripts/                    本地数据库、快照刷新、验收脚本
tests/                      关键策略单元测试、真实数据库集成测试
docs/                       架构、数据库、API、计划、部署、阶段记录
Dockerfile compose.yaml     Next standalone + PostgreSQL
```

浏览器 → Next 服务端 → Prisma → PostgreSQL。未来 worker 使用同一代码仓库，独立进程处理数据库持久化队列；不在请求中执行长采集/AI任务。网页不执行第三方仓库代码。页面展示数据来源、快照日期、未测试状态；数据库故障显示真实错误或 503，不静默替换假数据。

## 内容流程与信任边界

GitHub 元数据入库 → README 以不可信文档存储 → AI 严格 JSON + Zod Schema → PENDING_REVIEW → 编辑差异审查 → 原子发布。Repo 原始数据和 Skill 已发布中文内容分离，AI 不覆盖已发布内容。模型建议分类只能引用现存分类/标签候选，未知值作为建议文本留待人工处理。

采集 worker：仅连接固定 api.github.com、HTTPS 443，路径由 owner/repo 校验后构造；拒绝用户密码、端口、查询、片段和非仓库路径；拒绝跳转，README 限字节并采用 GitHub API 返回正文。分页 ≤100/页，任务总页数封顶；ETag 条件获取，repo ID 去重；尊重 Retry-After/X-RateLimit-Reset，指数退避+抖动，次数与延迟上限。持久化任务、重试、游标、失败原因与日志，租约与幂等事务防重复执行。Star 日快照支持真实近期增长，无两期快照不生成增长值。

大模型 OpenAI-compatible base URL、model、key 配置仅在服务端；出站目标由部署者配置，生产禁止环回/私网/元数据地址；超时、正文大小、重试上限。README 放入明确的资料区，系统提示固定且无工具权限；结构化结果验证只是第一层，人工审核为最终发布边界。缺密钥返回 MODEL_NOT_CONFIGURED，不伪装固定样例为模型输出。

## 权限和安全

角色 USER、EDITOR、ADMIN；编辑可以处理内容，用户/权限及配置变更仅管理员。服务端每个写接口重新读取数据库角色，客户端标识不可信；会话只标识用户。会员为独立带有效期的 MembershipGrant，不用 role 假装付费状态。教程元数据与正文分别查询；未授权仅返回摘要，正文不能进入 HTML、RSC、JSON 或预取缓存。受保护响应 no-store/private。

写 API 校验 Origin/CSRF、输入 Schema、长度与频率；Auth.js 处理 OAuth CSRF。SQL 仅 Prisma 参数化查询；React 默认转义，第一阶段正文纯文本，无 dangerouslySetInnerHTML；未来 Markdown 禁用 HTML并清洗 URL。OAuth 新用户默认 USER，不以 GitHub用户名/请求参数提升角色；首个管理员通过运维离线脚本显式授予并审计。密钥不进入日志、Git、客户端。

不展示未发生的测试、AI结果、活跃用户数、下载量、会员优惠或支付入口。许可证及源项目始终可见。Docker部署、OAuth回调、真实模型和线上可用性各自单独验收。
