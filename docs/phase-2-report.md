# SkillHub 第二阶段交付报告

日期：2026-10-12（Asia/Shanghai）。版本：0.2.0。完成范围：GitHub采集与后台仓库管理；没有线上部署，V1.0其余阶段仍待开发。

## 已完成

- 管理员/编辑输入GitHub地址导入、按关键词与最低Star发现；网页只提交202异步任务，不在请求内等待完整采集。
- 固定GitHub REST目标、公开仓库Schema校验、唯一ID去重、活动请求去重、幂等键冲突保护、查询和任务日志分页。
- 独立worker、持久化队列/逐仓库进度/游标/失败原因/重试时间、租约过期恢复、跨worker串行出站、失效租约写入保护。
- 至少1.1秒请求间隔，403/429尊重限额头，5xx/网络超时指数退避，每步骤最多5次尝试；失败项可重试并保留完成项和日志。提交/重试每操作者合计10次/分钟，活动队列最多100项。
- 元数据和README各自ETag增量更新；日快照按Asia/Shanghai归档，同日更新单条记录；contentVersion记录资料改变，不覆盖人工编辑字段。
- 后台仓库列表/搜索/筛选/分页、详情/来源/许可证/README摘录、手动刷新、暂停自动发现更新；采集任务列表/详情、步骤状态和分页日志。
- 所有页面/接口在服务端验证Auth.js数据库会话及当前角色；无会话401、普通用户403、撤销角色立即失效；写接口Origin与8KiB正文限制；操作AuditLog。
- 新仓库Skill均DRAFT/UNKNOWN、难度为空，不生成AI中文结论、不发布、不标记已验证。README只是未信任公开文档，最多256KiB；只存机械摘录，不执行其中指令或第三方代码。
- 四个P2迁移已用于本地真实PostgreSQL，另有独立测试库从空库应用全部迁移。更新Schema、API说明、采集说明、部署文件和启动脚本。

## 真实GitHub采集闭环

2026-10-12 12:40（Asia/Shanghai），应用worker直接请求 `api.github.com`，没有用固定样例或连接器替代本轮网络传输。此次为匿名请求：当时 `.env` 尚未配置GITHUB_TOKEN。此前12:08的真实403限速已经记录为延迟重试；按到期时间恢复后成功。

| 任务 | 真实结果 |
| --- | --- |
| IMPORT `cmv4qfoic0002uwzkc04uxt1u` | github/spec-kit，GitHub ID 1042367133；1项新增成功，保留此前1次限速重试日志 |
| REFRESH `cmv4rjz4n000xuwhwdq7maemt` | 同一仓库元数据ETag304、README UNCHANGED；新增0、未变1，没有重复仓库或同日快照 |
| DISCOVER `cmv4qfrpf000cuwzkvsm092l3` | `agent-skills in:name`，perPage=1、maxPages=2；实际保存两页，采集2个仓库成功 |

发现的真实仓库：[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)，ID 1158722119；[K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills)，ID 1079456184。导入来源：[github/spec-kit](https://github.com/github/spec-kit)。三者README、Star/Fork、Topics、许可证、原始描述和采集时间已落库；三者均DRAFT/UNKNOWN，各自当日快照1条。公开导航仍只有原来的8条，新增资料等待P3审核。仓库采集成功不代表项目代码或运行效果经过测试。

完整收据保存在被Git忽略的 `.local/collector-live.json`，数据库保留任务/步骤/日志；临时CLI操作者已删除，没有预置管理员。收据包含公开元数据和任务状态，不包含Token、Cookie或README全文。复跑 `test:collector-live` 可读回上述任务并断言唯一ID、README、快照和草稿边界。

## 质量门禁及验收

| 检查 | 结果与证据边界 |
| --- | --- |
| lint，max-warnings=0 | 通过 |
| TypeScript noEmit | 通过 |
| Vitest | 81项通过（2个文件）；覆盖URL/SSRF、角色/会员/AI契约、网络响应/分页/ETag/重试/README字节与UTF8 |
| 主库PostgreSQL回归 | 13项通过；seed幂等、唯一/FK/CHECK、事务回滚、无虚构用户/评测、未审核草稿不公开 |
| 采集事务集成 | 31项通过；独立skillhub_p2_test，真实PG+受控上游响应；并发去重/提交与重试共用上限、租约接管、分页重叠、304、429、5xx、404、重试上限、暂停更新、编辑内容保护 |
| 后台HTTP | 29项通过；独立测试库/3301 standalone；真实数据库会话USER/EDITOR/ADMIN、Origin、401/403/409、输入/只读字段保护、刷新/日志/分页、到期会话和角色撤销 |
| 公共HTTP回归 | 36项通过；公共页面/查询/分页、400/404/503、草稿隐藏、会员正文在HTML/RSC/API中不泄露 |
| 生产构建 | Next standalone成功；32个App Router页面/端点（含not-found） |
| 真实网络 | 导入、刷新和两页发现三个任务均SUCCEEDED；直接GitHub REST、元数据304/README未变、真实限速后恢复 |
| 只读视觉检查 | 后台仓库/任务桌面及390×844移动视口通过；表格在自身容器滚动，文档无横向溢出 |
| 生产依赖审计 | npm audit --omit=dev：0项告警 |
| 全依赖审计 | 仍有5项high，均braces问题传播至Next ESLint开发依赖链，暂无兼容修复；并非5个不同生产漏洞 |

后台视觉检查使用短期Auth.js数据库会话读取真实SSR，立即删除临时用户/会话，移除交互脚本后生成只读HTML；截图顶部明确写明此边界。这验证布局和真实记录呈现，不构成GitHub OAuth登录或浏览器提交业务操作实测。真实管理写操作已通过后台HTTP验收。

截图：`artifacts/admin-repositories-desktop.png`、`admin-repositories-mobile.png`、`admin-tasks-desktop.png`、`admin-tasks-mobile.png`。这些都是本机生成证据，没有上传、公开或部署。

最终复核：主库11个真实仓库、8个公开条目、3个新增草稿、3个成功采集任务；主库用户/会话均0，临时验收身份已清理。新版standalone与独立worker已共同启动验证。验收结束关闭本轮专用Web、worker、只读视觉服务及本地PG，保留构建、数据库和收据；双击Start-SkillHub.cmd可恢复运行。

## 遗留问题

1. 遵照用户选择保留GitHub登录，不增加本地登录。OAuth应用密钥尚未配置，实际OAuth回调和登录后浏览器操作仍待验；临时会话夹具不等于OAuth实测。配置后由运维明确选择已有用户ID运行admin:grant，记录授权日志。
2. 用户准备配置GITHUB_TOKEN；本次匿名额度恢复已完成闭环，但日常采集仍建议配置读取公共仓库的Token并重启全部worker。OAuth登录密钥与采集Token相互独立。
3. 本机没有Docker，Compose web/worker/迁移依赖仅做文件检查，未宣称容器启动通过；生产TLS、备份恢复、监控、跨宿主验证留到P5。
4. 尚未形成第二个真实业务日的快照，因此近期增长仍待建设；不伪造日期/数据。定时发现计划或定时刷新策略未在本阶段提供，当前由管理员创建发现/刷新任务，worker持续消费。
5. AI调用/分类/中文摘要/审核发布、评测、专题教程CRUD、收藏写入、会员开通、用户权限管理界面仍待P3/P4。新资料保持草稿，不把采集器判断当作人工评测。
6. 开发工具链仍有5项high依赖告警，详见[braces上游告警](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)。生产依赖0告警不等于完整安全审计；需在P5再次检查上游与兼容的lint替代路线。

## 下一步

P3接入可配置的大模型API，严格JSON/Zod校验、提示注入隔离、中文分类/摘要等草稿生成、来源版本绑定、人工审核与发布冲突保护；以真实模型处理至少1个本轮新增仓库并完成审批前后可见性验收。配置OAuth后追加登录及管理页面浏览器交互验收。启动仍使用 `Start-SkillHub.cmd`，会启动独立本地PG、网页和worker，现有数据与构建保留。
