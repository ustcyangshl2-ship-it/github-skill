# API 接口清单

`/api/v1`；JSON envelope 为 `{data, meta?}` 或 `{error:{code,message}}`。Zod校验；400输入、401未登录、403无权限、404不存在、409冲突、429限速、503依赖/配置不可用。GitHub ID用字符串、时间用ISO8601。分页page≥1、pageSize 1–24。未实现路由在文档标记待建设，不用成功空响应伪装业务。

## 第一阶段接口

| 方法与路径 | 访问 | 内容 |
| --- | --- | --- |
| GET /api/health | 公共 | 最小数据库存活；失败503，不泄露连接信息 |
| GET /api/v1/skills | 公共 | q/category/type/sort(stars/recent/editor)/page/pageSize；仅已发布条目 |
| GET /api/v1/skills/:slug | 公共 | 已发布详情、原始元数据、许可证、评测透明状态；不含教程正文 |
| GET /api/v1/categories | 公共 | 分类及已发布条目数量 |
| GET /api/v1/tutorials/:slug | 公共/授权 | 已发布元信息；免费正文公开，会员正文服务端授权后返回，否则403 |
| GET/POST /api/auth/* | Auth.js | GitHub OAuth、session、CSRF等标准端点；缺配置503 |

第一阶段 /account、/admin 服务端验登录/角色，后台业务模块显示待建设。OAuth需要部署者的GitHub应用key，未配置不能模拟登录。

## 第二阶段已实现接口

所有接口前缀 `/api/v1/admin`。EDITOR/ADMIN可读写；服务器验证当前数据库角色。写请求必须具有同源Origin；导入/发现JSON≤8KiB。可选Idempotency-Key为8–100个字母数字、点、下划线或连字符；重用不同请求409。受保护响应private/no-store。

| 方法与路径 | 行为 |
| --- | --- |
| GET /repositories?q=&sync=enabled/disabled&page=1&pageSize=20 | 仓库分页与查询，GitHub ID字符串 |
| GET /repositories/:id | 原始元数据、README采集状态/摘录、条目状态 |
| POST /repositories/import | `{url}`，202 `{data:{task,reused}}`；相同活动URL复用任务 |
| POST /repositories/discover | `{query,minStars:0,perPage:10,maxPages:3}`，最多100条/页、10页，202 |
| POST /repositories/:id/refresh | 使用已存GitHub唯一ID和独立ETag，202 |
| PATCH /repositories/:id | `{syncEnabled:boolean}`；拒绝其他字段，记录审计 |
| GET /collection-tasks?status=&page=1&pageSize=20 | 持久化任务分页、进度、下一尝试、错误 |
| GET /collection-tasks/:id | 单个任务参数与状态，404保护 |
| GET /collection-tasks/:id/items?page=1&pageSize=20 | 每仓库步骤分页、唯一ID、状态和结果 |
| GET /collection-tasks/:id/logs?page=1&pageSize=20 | 时间倒序分页日志，不含Token |
| POST /collection-tasks/:id/retry | 仅FAILED可重试，保留成功项与历史日志，其他状态409 |

常见错误：QUEUE_LIMIT429、INVALID_ORIGIN403、INVALID_INPUT400、IDEMPOTENCY_CONFLICT409、TASK_NOT_RETRYABLE409。任务的GITHUB_RATE_LIMITED属于后台可恢复状态，不是POST接口成功采集的标记。

## 后续接口（待建设；表中P2采集接口已按上表落地）

| 方法与路径 | 权限 | 计划行为 |
| --- | --- | --- |
| GET /rankings?mode=stars/growth/editor | 公共 | 增长必须两期日快照，时段固定 |
| GET /collections、/collections/:slug | 公共 | 已发布精选专题与条目 |
| GET /tutorials | 公共 | 分页元信息；不返回会员正文 |
| GET/PUT/DELETE /me/favorites/:skillId | 用户 | 幂等收藏；只能收藏公开条目 |
| GET /me/membership | 用户 | 服务端当前权益与到期 |
| GET /admin/dashboard | 编辑/管理员 | 真实条目、任务、审核统计 |
| POST /admin/repositories/import | 编辑/管理员 | 校验GitHub URL、入持久化队列，202+taskId |
| POST /admin/repositories/discover | 编辑/管理员 | 关键词、页数上限、最低Star，202 |
| POST /admin/repositories/:id/refresh | 编辑/管理员 | 条件增量更新 |
| GET /admin/collection-tasks、/:id/logs | 编辑/管理员 | 分页任务、状态、限速与错误 |
| POST /admin/collection-tasks/:id/retry | 编辑/管理员 | 可重试失败才入队，409保护 |
| POST /admin/skills/:id/ai | 编辑/管理员 | inputHash去重，202；缺模型配置503 |
| GET /admin/ai-tasks、/:id | 编辑/管理员 | 待审结果、来源版本、模型与差异 |
| POST /admin/ai-tasks/:id/approve/reject | 编辑/管理员 | 版本检查、人工审核、事务发布/拒绝 |
| PATCH /admin/skills/:id | 编辑/管理员 | 手工编辑、发布状态和乐观锁 |
| POST/PATCH/DELETE /admin/reviews[/:id] | 编辑/管理员 | 证据、测试日期、测试环境；禁止伪验证 |
| POST/PATCH/DELETE /admin/collections[/:id] | 编辑/管理员 | 专题、顺序及发布 |
| POST/PATCH/DELETE /admin/tutorials[/:id] | 编辑/管理员 | 元信息、正文、会员访问级别、审核 |
| GET /admin/users | 管理员 | 分页，最小个人信息 |
| PATCH /admin/users/:id/role | 管理员 | 不允许移除最后一个管理员、审计 |
| POST /admin/users/:id/membership | 管理员 | 手动授权/撤销与有效期；不含支付市场 |
| GET /admin/audit-logs | 管理员 | 脱敏日志、分页 |

所有写请求验证同源Origin/CSRF；未来采集/AI接口另设用户速率和任务总量限制。幂等键与任务dedupeKey唯一；重试不是重新覆盖审计历史。README永不当系统提示或工具指令执行。
