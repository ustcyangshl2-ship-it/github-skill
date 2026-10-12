# SkillHub 第一阶段交付报告

日期：2026-10-12（Asia/Shanghai）。完成范围：P0设计 + P1初始化、真实数据库和基础页面。V1.0整体尚未完成，没有线上发布。

## 设计交付

已提供目录/架构、规范化Prisma Schema、完整API接口清单、P0–P5计划与各阶段验收方法，见docs/01–04。API表区分第一阶段可用端点与后续待建设端点。数据库涵盖原始仓库、导航、分类/标签/平台、快照、合集、教程元信息/正文、评测、认证、会员、收藏、采集/AI任务和审计。

## 已完成

- 验收运行时为Node24.19.0 LTS；保留系统Node25不变。Next16.4、React19.2.8、TypeScript严格模式、Tailwind4、shadcn/ui源组件、Prisma6.19.3、稳定next-auth4.24.15。
- PostgreSQL18.4独立本地实例：127.0.0.1:55432；UTF8、SCRAM密码验证；专属ASCII目录 `%LOCALAPPDATA%\SkillHub\postgres`。本地密码随机生成且不提交。
- 两个SQL迁移；外键/唯一/索引及计数、分数、测试证据、有效期、中文内容审核边界CHECK。
- 8个真实公开仓库元数据、6个导航方向、4个初始化专题、1篇站点自编免费入门指南。Star/Fork带采集时间，无假实时指标。
- 8份中文初始化草稿均在PENDING_REVIEW队列。provider/model明确是初始化代码助手草稿，不是运行时模型API调用；质量评分为null。公开页面先展示原始英文描述，未审核中文内容/受众/场景不发布，难度与平台建议不对外宣称。
- 首页搜索、目录关键词/分类/类型/排序/分页、条目详情、Star/编辑榜、合集列表/详情、教程中心/正文。
- GitHub OAuth配置基础、数据库会话、当前用户及后台角色由服务端读取；缺配置明确失败，无模拟登录。用户中心/管理后台保护入口和真实统计骨架，业务操作待建设。
- 会员教程正文分表，先授权后读取；免费文章公开；临时会员测试内容未泄露到API/HTML/RSC。
- `.env.example`、Dockerfile/compose、README、部署说明、API说明、PowerShell运行器与Start-SkillHub.cmd。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| Prisma validate + generate | 通过 |
| 空库迁移 + 第二个审核边界迁移 | 通过 |
| lint（max-warnings=0） | 通过 |
| TypeScript noEmit | 通过 |
| Vitest | 37项通过：URL/SSRF边界、查询参数、角色/会员边界、AI严格JSON契约 |
| PostgreSQL集成 | 13项通过：幂等seed、唯一/FK/CHECK、无虚构用户/评测、8份草稿不发布、失败事务回滚 |
| 生产构建 | Next standalone成功，18个App Router页面/端点（含not-found） |
| HTTP验收 | 36项通过：页面、搜索/过滤/排序/分页、400/404/503、登录跳转、草稿不可见、会员正文保护、HTML转义 |
| 数据库故障恢复 | 专用数据库停止时health/目录API均503；恢复后health=connected |
| 浏览器桌面 | 首页→搜索MarkItDown→更改排序→详情，来源/许可证/未实测可见 |
| 浏览器移动 | 390×844视口；首页、目录、详情无横向溢出；导航展开、目录翻页成功 |
| 依赖审计（生产依赖） | npm audit --omit=dev：0项告警 |
| 依赖审计（全依赖） | 仍有5个high报告，均同一braces递归模式问题传播到Next ESLint开发依赖链，暂无上游修复版本 |

浏览器截图保存在artifacts：home-desktop.png、home-mobile.png、catalog-mobile.png、detail-desktop.png、detail-mobile.png。截图反映第一阶段界面，不是项目安装或模型效果证据。源仓库中文解读调整为待审核后已重新构建、复跑接口并刷新截图。

验收结束已关闭专用本地应用/数据库服务，保留数据及standalone构建。双击Start-SkillHub.cmd可重新启动；不占用其他项目的数据库或端口。

## 环境限制与遗留事项

1. 本机未安装Docker/Compose，部署文件未做容器构建/启动验收；当前是本地真实PG和standalone验收。
2. 无GitHub OAuth应用密钥，实际登录、已登录用户角色矩阵和会员成功读取端到端尚未验证。匿名拒绝、服务端策略及会员时间边界已验证。
3. 未配置模型API，没有真实LLM调用、自动采集worker或审批发布流程；初始待审数据不等价于真实模型API测试。
4. 近期增长、评测、收藏写操作、内容/用户管理CRUD和会员授权均待建设；页面明确标注，没有一键安装/在线执行/交易市场。
5. 本地匿名GitHub REST请求因出口IP额度为0返回403，未伪造替代数据；真实初始化快照改由已连接GitHub读取REST取得，来源写入data/github-snapshot.json。未来采集器须真正实现限速/重试/日志。
6. ESLint9匹配Next当前插件peer范围但已停止维护；10超出当前React/import/a11y插件peer范围。全依赖剩余5个high对应[braces上游告警](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)，仅固定代码路径的lint工具链。上线前需复核上游或替换lint配置；不能把本次生产依赖0告警解释为完整安全审计。
7. 当前CSP允许Next内联脚本；nonce、TLS、出站模型地址策略、生产限流和备份恢复在P5单独验收。

## 下一阶段

P2先完成管理员导入/关键词发现、固定GitHub出站目标、分页/ID去重、ETag增量、429/403退避、断点续跑、持久化任务日志和后台仓库管理。验收以真实导入任务闭环及限速/失败测试为准。P3再接模型API与人工审批，中文草稿获人工审核前持续保持隐藏。
