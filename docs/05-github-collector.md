# P2 GitHub 采集与后台管理

## 运行入口

本地 `Start-SkillHub.cmd` / `npm run start` 同时启动 Next standalone 和独立 collector worker。`npm run collector:worker` 可单独运行 worker；`npm run collector:once` 只处理当前可执行步骤，遇到未来重试时间即退出，任务仍保存在数据库。测试或只读预览可设置 `SKILLHUB_RUN_WORKER=false`。

Docker Compose 新增独立 worker 服务，使用tools镜像源代码、tsx和Prisma；Web镜像仍使用standalone，不附带worker执行环境。所有实例必须使用同一个GitHub凭据配置；更改Token应重启全部worker。Docker运行验收仍属于P5。

GitHub OAuth负责网站登录；`GITHUB_TOKEN`只用于采集鉴权，两者独立。填写 `.env` 的 `GITHUB_TOKEN`，不使用 `NEXT_PUBLIC_`，不提交Git、不发到聊天。公共仓库只需读取权限，不需要仓库写入权限或私有仓库授权。设置说明：[GitHub管理个人访问令牌](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)。未配置Token时可用匿名API，但共享出口的60次/小时额度可能被其他请求耗尽。

## 登录与权限

按部署说明配置GitHub OAuth后，新用户默认USER。明确选择已有用户ID，由拥有本机数据库配置的运维人员运行：

```powershell
.\scripts\run.ps1 admin:grant -- --user-id EXISTING_USER_ID --role ADMIN
```

也可用Node LTS下的npm：`npm run admin:grant -- --user-id EXISTING_USER_ID --role ADMIN`。命令不创建默认管理员，所有授予记录AuditLog。EDITOR也可使用仓库和采集管理；本阶段不提供用户权限CRUD。

每个页面/Route Handler都在服务端读取Auth.js数据库会话与当前数据库角色。没有会话401，普通用户403；角色撤销后既有会话失去权限。写接口校验Origin，且JSON正文最多8KiB。Cookie客户端角色不作为依据。受保护响应private/no-store。

## 后台工作流程

1. `/admin/repositories` 输入标准HTTPS GitHub仓库地址，或关键词、最低Star、每页数量和最大页数。
2. POST成功202返回taskId。相同活动请求复用任务；相同幂等键只可用于同一请求。
3. Worker按持久化队列采集。`/admin/collection-tasks/:id`显示状态、页游标、逐仓库进度、下一重试时间和分页日志。
4. 仓库唯一ID去重；同一仓库只对应一个Skill。新仓库的条目为DRAFT、UNKNOWN、无中文摘要，不自动进入公开目录。
5. 仓库详情显示来源、许可证、原始描述与README机械摘录；手动刷新使用独立元数据/README ETag。旧中文审核内容、编辑标题、分类、教程等不会被采集覆盖。
6. 暂停自动发现更新后，发现任务会跳过已知仓库并记录日志；显式手动刷新仍允许。没有自动发布/执行/安装操作。

## 持久化与失败恢复

- CollectionTask保存查询、页游标、总进度、重试次数、到期时间、租约与终态；CollectionTaskItem保存每个仓库的状态，分页重叠或重跑不重复累计。
- PostgreSQL事务锁 + 活动请求部分唯一索引保证并发去重；每分钟每操作者最多10次新提交/重试，活动队列上限100，提交上限在事务锁内验证。
- 全局worker租约使GitHub请求串行；请求间隔至少1.1秒。租约2分钟，HTTP超时15秒；旧worker失去租约后不能提交数据库结果。进程重启后可接管过期租约。
- 403/429主限额尊重X-RateLimit-Reset及Retry-After中较晚时间；无主限额头的403/429按二级限速至少等待1分钟。5xx/408/网络失败使用指数退避+抖动，单步骤最多5次尝试。限速等待持久化，不挂起Web请求。
- Token变更只可解除明确属于旧凭据的主限额等待；不会提前解除二级Retry-After。未知来源的等待保守保留。
- 401、404、跳转、来源不一致及Schema不合法不自动重复。README404记录MISSING；超过256KiB或非UTF8记录跳过状态及警告。
- 部分仓库失败时任务FAILED，保留成功项；手动重试只重排失败项或未完成搜索页，保留已有日志和游标。
- GitHub搜索以Link头分页，校验目标主机/路径/原查询、sort/order/per_page和连续页码；最多10页、100条/页，遵守1000结果上限。incomplete_results不能当成功完成。

## 安全和增量数据

所有出站路径仅可为固定api.github.com的仓库、README或仓库搜索端点。用户密码、非HTTPS、端口、查询片段、额外路径、编码/反斜线及其他主机一律拒绝；HTTP跳转不跟随。所有响应按流限制2MiB，README校验base64、实际字节数和UTF8。只下载必要公开文档，不下载仓库代码、压缩包或执行README中的指令。

Star/Fork日快照按Asia/Shanghai业务日归档，日内更新同一条记录；不从同一天伪造两期增长。原始资料contentVersion随描述/Topics/许可证/README改变更新，为P3防止旧AI草稿审核覆盖新资料准备。元数据304仍单独检查README，读取到的新元数据可在README暂时失败时保留，下次继续。

操作方法根据[GitHub REST最佳实践](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)及[分页说明](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api)实现。响应中不回传采集Token，日志不保存Authorization或原始上游错误正文。

## 可复跑验收

`npm test`运行输入、网络协议、限速和README安全单元测试；`test:collector`在独立 `skillhub_p2_test` 数据库运行实际事务/租约/去重/重试测试；`test:admin-http`启动3301端口的隔离standalone实例，用真实Auth.js数据库会话测试权限、CSRF和管理接口。测试会话是受控数据库夹具，不是GitHub OAuth登录实测。

`test:collector-live`仅在本机SkillHub数据库中通过真实GitHub REST尝试 github/spec-kit导入、重复增量刷新、agent-skills关键词两页发现。任务日志和来源数据保留，临时CLI验收操作者删除，不预置管理员。遇到限速返回非零并保存`.local/collector-live.json`，绝不把排队状态写为成功。Token配置后重新运行可以恢复已有验收任务。
