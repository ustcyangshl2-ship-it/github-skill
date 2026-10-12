# 数据库设计

权威可执行定义：[schema.prisma](../prisma/schema.prisma)。全部使用 PostgreSQL；主键通常 cuid，GitHub repository ID 使用 BigInt，API序列化成字符串。时间存储 UTC，界面以 Asia/Shanghai 展示。

| 实体 | 关系/用途 | 关键约束和索引 |
| --- | --- | --- |
| GithubRepository | 不可混淆的原始仓库元数据 | githubId、fullName、url唯一；updatedAt/sourceUpdatedAt索引 |
| RepositorySnapshot | Star/Fork日快照 | repositoryId+day唯一；day索引；不可用新值覆盖历史 |
| Skill | 一个仓库对应一个导航条目；已发布中文内容 | repositoryId、slug唯一；status/type/publishedAt索引 |
| Category / SkillCategory | 树形分类与条目多对多 | category slug唯一；关联联合主键、反向索引 |
| Tag / SkillTag | 标签多对多 | tag slug唯一；关联联合主键 |
| Platform / SkillPlatform | 适用平台多对多 | platform slug唯一；关联联合主键 |
| Collection / CollectionItem | 专题及顺序 | collection slug唯一；collectionId+skillId唯一 |
| Review | 人工评测、证据与测试日期 | skill/status索引；未经测试不能标为 VERIFIED |
| Tutorial / TutorialBody | 元信息与独立正文 | slug唯一；正文一对一；status/access/skill索引 |
| User | Auth.js用户与角色 | email唯一；默认USER |
| Account / Session / VerificationToken | Auth.js标准持久化模型 | provider+providerAccountId、sessionToken等唯一 |
| Favorite | 用户收藏 | userId+skillId联合主键 |
| MembershipGrant | 会员授权及到期、撤销、来源 | user/status/expiresAt索引 |
| CollectionTask / CollectionTaskLog | 采集、分页、重试、租约和日志 | status+nextAttemptAt；dedupeKey唯一 |
| CollectionTaskItem | 每仓库进度、失败与结果 | taskId+url、taskId+githubId唯一；逐项断点恢复 |
| CollectorRuntime | 全局worker租约、请求间隔与限速暂停 | singleton github；凭据指纹及主/二级限额分离 |
| AiTask | 输入版本、模型信息、结构化结果、人工审核 | skill/status/createdAt；dedupeKey唯一 |
| AuditLog | 用户操作记录和内容变更摘要 | actor、entityType+entityId、createdAt索引 |

内容记录保留作者、审核人、审核时间；删除用户 SetNull 保留历史，收藏/认证信息随用户删除。分类/标签/仓库等受引用资源按 Restrict 防误删，条目关联表 Cascade。教程正文不能由公共通用 include 查询加载。

Prisma不表达的 CHECK 在迁移SQL中追加：Star/Fork非负、评分0–100、会员结束时间晚于开始时间、已测试/VERIFIED评测必须具备测试日期、环境及证据、发布条目必须有发布时间。允许只公开源仓库元数据；公开中文摘要、描述、受众或场景必须具备审核人及审核时间。业务服务后续进一步验证审核状态和权限。审核批准在同一事务内更新内容、关联和审计；乐观锁 version 防并发覆盖。AI任务的 inputHash 对应源资料版本，过期任务不可直接发布。

种子包含真实公开仓库快照、初始化分类/标签/专题及一篇站点自编免费入门文章。8条初始化中文解读进入AiTask待审队列，明确provider为initialization-draft、model为code-assistant-draft-not-runtime-api；并非真实模型接口调用。公开卡片使用原始仓库描述，未经审核不展示中文解读、受众/场景或难度建议。评分为null，没有伪造人评、会员、管理员或历史增长。幂等seed不更新已有人工内容；只将精确匹配初版初始化内容且无人审核的原始P1记录迁入待审队列。
