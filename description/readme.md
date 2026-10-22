# 项目文档导航

本目录维护 `knowledge-accumulation-fe` 企业知识沉淀统一前端入口的项目说明、设计与开发文档。当前已建立公共工作台、真实问答树，并接入统一登录和管理平台目录，专题文档随实际功能建设维护。

## 阅读入口

| 文档 | 阅读目的 |
| --- | --- |
| [项目总览](project.md) | 理解项目目标、系统关系、当前实现、运行方式和待确认事项 |
| [开发规范](../AGENTS.md) | 开始开发前确认代码、后端对接、验证和协作约定 |
| [文档撰写风格手册](documentation.md) | 新建或修改文档前确认命名、结构、引用与维护规则 |

首次参与项目时，先阅读项目总览和开发规范；涉及接口对接时，再阅读下方后端参考。

## 业务功能

| 文档 | 阅读目的 |
| --- | --- |
| [智能体问答与问答树](features/assistant.md) | 查看问答布局、上下文路径、主干与分支规则、接口边界及验证方式 |
| [管理平台入口](features/platforms.md) | 查看平台选择、详情、空状态与当前数据边界 |

## 前端基础能力

| 文档 | 阅读目的 |
| --- | --- |
| [统一登录与共享凭据](platform/authentication.md) | 配置开发与生产认证，了解 localStorage 交接与失败策略 |
| [环境与部署](platform/deployment.md) | 配置资源前缀、开发映射、API 代理和生产转发 |
| [问答联调与初始化](platform/exploration-integration.md) | 查看后端运行条件、首次建表、重启影响及验收状态 |

## 后端参考

登录、身份、头像与平台信息统一对接同级 `knowledge-accumulation-be`。以下链接指向后端维护的文档，本目录不另行复制接口契约。

| 文档 | 阅读目的 |
| --- | --- |
| [后端项目说明](../../knowledge-accumulation-be/description/project.md) | 查看后端能力、依赖和启动方式 |
| [后端文档导航](../../knowledge-accumulation-be/description/readme.md) | 查找后端架构与能力说明 |
| [API 导航](../../knowledge-accumulation-be/description/api/readme.md) | 查找已有接口及其请求、响应与错误语义 |
| [探索问答 API](../../knowledge-accumulation-be/description/api/exploration.md) | 核对树、轮次、SSE 与取消/替代协议 |
| [资源 API](../../knowledge-accumulation-be/description/api/resource.md) | 核对历史附件的归属校验与鉴权读取 |
| [人员登录 API](../../knowledge-accumulation-be/description/api/auth.md) | 核对现有人员认证契约 |
| [平台查看 API](../../knowledge-accumulation-be/description/api/platform.md) | 核对平台摘要、管理人姓名与头像、存活状态及实时查询契约 |

生产部署和其他管理平台适配的待确认事项见[项目总览中的待确认事项](project.md#待确认事项)。后端已有接口不代表本项目已经完成全部接入。

## 文档组织与维护

当前 `description/` 顶层保留 `project.md`、`readme.md` 和 `documentation.md`；跨业务的认证与部署文档位于 `platform/`，用户业务文档位于 `features/`。

新增正式文档时，在本页补充阅读入口；移动、重命名或删除文档时，同步修正导航和引用。项目范围与整体状态维护在项目总览，开发规则维护在 `AGENTS.md`，文档规则维护在风格手册，各专题只记录自身职责范围内的内容。
