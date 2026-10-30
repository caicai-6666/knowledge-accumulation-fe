# 探索问答联调与初始化

前端调用、认证与交互见[智能体问答](../features/assistant.md)。本文保留首次接入真实后端的验收记录，并说明再次联调前需要核对的运行条件。历史服务状态、人员数量及授权仅属于当时环境，不代表当前运行状态。

当前开发入口为 `https://talent.szkl.com/dev/knowledge-accumulation/`，本机前端和后端端口分别为 `15080`、`15000`；网关和 Vite 均保留 `/dev`。完整配置见[环境与部署](deployment.md)。以下历史验收中的域名、端口和测试数量仅记录当时环境。

## 历史联调记录（2026-10-22）

2026-10-22 与 knowledge-accumulation-be 开发助手完成真实联调。用户明确授权在 `registry` 库建表及重启（含全量身份同步），后端已初始化 8 张问答表，新版本在 24000 运行。启动同步已确认用户 7 人、管理员关系 6 条，开发登录和查询正常。开发者身份由后端落库，登录与同步使用 SQL 资料为准。服务已脱离终端运行；尚未配置崩溃或电脑重启后的自动启动。

真实验收经 24080 开发代理及 `https://pheno.szkl.com/dev/knowledge-accumulation/` 映射完成：

- 创建探索、首问和主干推进均有真实模型答案；PDF 图片输入成功返回内容描述。
- 历史树恢复主干与分支，主干末尾正确，公开处理过程和后端耗时可读取。
- 待激活任务取消成功，待激活和已开始生成的任务均成功通过 supersedes 原子替代。
- 公网 SSE 首事件约 255ms 到达，替代任务正常结束；鉴权附件返回 9435 字节 PDF。
- 前端 `npm test` 91 项通过，`npm run build` 通过。测试不包含生产钉钉环境与生产网关。

验收探索以“前后端联调验收”命名，ID 为 `4e77962a90c94f64a119e333b47f598b`，保留用于查看真实结果，未删除既有探索。

当时开发请求使用 `/dev/knowledge-accumulation/api`，Vite 移除 `/dev` 后转发至 24000。当前开发链路已改为全程保留 `/dev`，生产仍使用 `/knowledge-accumulation/api`，登录与用户 token 契约不变。

## 待审查的数据库变更

以下为历史首次接入基础 exploration 时使用的脚本清单，不是后端所有能力的完整迁移清单。新环境应先核对后端[部署与初始化说明](../../../knowledge-accumulation-be/description/capability/application/docker.md)及目标库实际结构，再决定需要执行的迁移；个人助理、平台协作等能力可能另有前置条件。

当时目标为 `registry` 库，基础问答按以下顺序审查初始化脚本：

1. [001-question-tree.sql](../../../knowledge-accumulation-be/schema/001-question-tree.sql)
2. [002-question-node-memories.sql](../../../knowledge-accumulation-be/schema/002-question-node-memories.sql)
3. [004-node-persistence.sql](../../../knowledge-accumulation-be/schema/004-node-persistence.sql)
4. [006-question-tree-kind.sql](../../../knowledge-accumulation-be/schema/006-question-tree-kind.sql)
5. [007-question-node-path-type.sql](../../../knowledge-accumulation-be/schema/007-question-node-path-type.sql)
6. [008-question-node-lifecycle.sql](../../../knowledge-accumulation-be/schema/008-question-node-lifecycle.sql)
7. [009-question-tree-deletion.sql](../../../knowledge-accumulation-be/schema/009-question-tree-deletion.sql)
8. [010-question-node-display.sql](../../../knowledge-accumulation-be/schema/010-question-node-display.sql)

003/005 的 MyVector 和全文检索不是基础 exploration HTTP/SSE 的必需条件。执行前再次核对表状态，发现部分表已存在时不能盲目重放或 DROP。MySQL 多文件 DDL 无整体事务回滚，应先记录结构并做好恢复准备；问答结构迁移本身不改 employees、departments、platform_admins 数据；本次后端另按其身份落库需求新增开发者记录，不覆盖原有人员。

## 重启影响

停止旧运行配置后，在后端根目录使用该项目环境启动：

```bash
python -m app.main
```

不能只为加载路由就忽略启动副作用：当前后端启动会建立中间件会话，并自动发布 `user/full-table` 和 `platform/admins/full-table`。发布覆盖全部权威 employees 用户及 platform_admins 关系，开发者身份落库后也由 SQL 提供；完整替换可能删除源表之外的中央用户、登录缓存或管理员关系，范围不限当前测试用户。当前代码无关闭该启动发布的配置。

因此，真实建表及重启应在确认目标库、权威用户范围和发布窗口后执行。此次用户已授权这些操作；具体执行与验收状态以上文核对结果为准。后续部署仍需重新核对目标环境和全表同步范围，不能将此次授权解释为其他环境的长期授权。

## 验收

加载新后端后，先检查 OpenAPI 路由和列表读请求，再使用明确的测试探索验证首问、主干推进、历史分支、公开处理过程、停止、调整方向、断线恢复及 PDF 附件读取。刷新后应恢复服务端历史；不使用现有用户探索树进行删除测试，不以临时伪造答案代替真实模型结果。
