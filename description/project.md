# 企业知识沉淀统一前端入口

本文说明 `knowledge-accumulation-fe` 的项目目标、职责边界、当前实现与待确认事项。开发约定见[开发规范](../AGENTS.md)，其他文档见[文档导航](readme.md)。

项目目录和 npm 包名统一为 `knowledge-accumulation-fe`。对外访问及 API 前缀仍为 `/knowledge-accumulation`，开发模式增加 `/dev`；浏览器存储键沿用原值，保留已有登录和使用偏好。

## 项目目标

本项目为企业知识沉淀提供统一的用户访问入口，主要承载智能体问答和管理平台入口两类能力，帮助用户通过统一界面提问、获取回答并访问相关管理平台。

| 目标能力 | 前端职责 | 当前状态 |
| --- | --- | --- |
| 智能体问答 | 提供问题输入、请求状态、回答展示及相关交互 | 已接入 exploration/resource，通过真实模型、SSE、树历史和 PDF 附件验收 |
| 管理平台统一入口 | 集中展示相关平台，并提供明确的访问入口 | 已接入真实子平台摘要、管理人及头像，注册中心与合同管理平台入口均已配置 |

统一登录、用户头像与管理平台目录已接入 `knowledge-accumulation-be`，问答已接入真实任务、服务端历史和公开过程；运行前置条件及验收状态见[联调与初始化](platform/exploration-integration.md)。

## 系统关系与职责边界

本项目的登录、身份、用户头像与平台目录直接对接同级 [`knowledge-accumulation-be`](../../knowledge-accumulation-be/description/project.md)。浏览器负责呈现与交互，业务请求交由后端处理。

| 项目或服务 | 与本项目的关系 |
| --- | --- |
| `knowledge-accumulation-fe` | 企业知识沉淀统一前端入口，负责页面、交互、前端状态和接口调用 |
| `knowledge-accumulation-be` | 客户后端，提供登录、中央用户身份验证、头像及平台基本信息，提供 exploration 树历史、任务 SSE 和鉴权附件 |
| `registry-be` | 维护权限与管理员资料，由独立管理前端访问 |
| `registry-fe` | 同级注册中心管理前端，其审核页面和业务流程不自动属于本项目 |
| 各管理平台 | 统一入口的访问目标，具体范围及跳转契约待确认 |

智能体执行、知识检索、模型调用、身份与权限校验及业务数据处理属于服务端职责。浏览器不直接连接数据库、中间件或模型服务，也不保存这些服务的访问密钥。

统一管理平台入口的职责是帮助用户找到并访问平台。是否需要在本项目承载某项管理操作，应由具体需求另行明确；不因提供入口就复制各平台的管理功能。前端可按服务端权限结果控制展示，实际访问权限仍须由服务端或目标平台校验。

## 当前实现

当前项目已完成公共工作台框架，使用 Vue 3 + Vite、JavaScript、ES Modules 和 Vue 单文件组件的 `<script setup>` 写法。问答页面对接真实会话与问答树交互，管理平台页从后端获取子平台名称、摘要、管理人及头像；平台名称、Markdown 描述和管理员均来自接口，注册中心入口地址由已确认配置维护。

主要代码位置如下：

| 位置 | 职责 |
| --- | --- |
| `src/main.js` | 创建 Vue 应用并加载全局样式 |
| `src/App.vue` | 组合背景和公共工作台 |
| `src/layouts/WorkspaceLayout.vue` | 品牌、顶部导航与两页内容容器 |
| `src/components/MolecularFieldBackground.vue` | 分子背景组件及生命周期管理 |
| `src/workers/molecular-field.worker.js` | 在 Worker 中绘制分子背景 |
| `src/style.css` | 全局样式 |
| `src/assets/`、`public/` | 静态资源 |
| `vite.config.js` | Vite 与 Vue 插件配置 |
| `Dockerfile`、`.dockerignore`、`nginx.conf` | 生产镜像构建、构建上下文及 Nginx 静态资源/API/SSE 配置 |
| `package.json` | 项目依赖和运行脚本 |

业务容器使用 Vue 内置 `KeepAlive`，不新增缓存依赖。当前未引入路由、全局状态库、UI 组件库或独立请求库；认证使用原生 Fetch 和同源开发代理，生产钉钉免登按需加载 `dingtalk-jsapi`。

## 公共界面框架

公共外观参照同级 `registry-fe` 的工作台：复用品牌图标与分子背景组件，沿用浅色半透明表面、圆角外框、细分隔线、柔和投影以及胶囊式导航。登录自动完成，等待与失败时展示状态及重试；工作台右上角显示当前姓名或 userid 及圆形头像，头像的认证请求和默认展示见[用户头像](platform/authentication.md#用户头像)，不复制独立登录页。

顶部导航提供“智能体问答”和“管理平台”，默认进入问答区域，分别通过 `#assistant` 与 `#platforms` 表示当前位置。使用原生链接和 Hash 变化同步选中状态，支持直接访问、刷新与浏览器前进、后退，无需额外路由依赖。导航滑块与内容轨道采用一致的 520ms 过渡。

`WorkspaceLayout.vue` 提供 `assistant`、`platforms` 两个具名插槽，分别接入 `AssistantWorkspace.vue` 和 `ManagementPlatforms.vue`。根工作台与两页业务容器均由 Vue `KeepAlive` 缓存；页面首次访问时才挂载，切换时保留离开页至 520ms 滑动结束，然后停用并移入缓存。非当前页立即设置 `inert` 与 `aria-hidden`；插槽传递 `active` 和 `rendered`，分别控制交互与缓存中的组件显示。工作台缓存按 userid 隔离且最多保留一份，短暂认证失败不清空同用户状态，切换用户淘汰整个旧缓存树。

900px 及以下导航移到第二行，640px 及以下收紧外框和标题间距，内容区域独立滚动。启用系统减少动画偏好时关闭工作台入场、导航和页面切换动画，背景保留静态绘制；后台页面暂停背景动画，不支持 Worker 或 OffscreenCanvas 时退化为静态底色。

## 后端契约与接入边界

后端现有接口见 [API 导航](../../knowledge-accumulation-be/description/api/readme.md)。接口字段、认证和错误语义由后端文档、路由、Schema 与实际 OpenAPI 核对确认，本项目文档不复制完整接口定义。

目前接入时需要关注以下边界：

- 用户问答使用后端 exploration 路由，附件使用 resource/attachment。重新连接复用 turn 与事件游标，方向调整由后端原子替代；契约见[探索接口](../../knowledge-accumulation-be/description/api/exploration.md)。
- [平台查看接口](../../knowledge-accumulation-be/description/api/platform.md)已接入可见平台基本信息与管理人资料，可包含注册中心，不返回管理平台跳转地址。前端只显示接口平台，不追加固定平台或覆盖描述。中间件存活状态不能直接解释为网页可访问或当前用户具备访问权限。
- [人员登录接口](../../knowledge-accumulation-be/description/api/auth.md)已接入开发固定凭据交换与生产钉钉免登，两者均返回随机中央用户 token，统一入口保存同源 `localStorage.access_token`，供管理平台读取。具体流程、失败策略及共享边界见[统一登录](platform/authentication.md)。
- 前端服务地址、请求处理、认证失效和错误提示的实现约定见[后端对接约定](../AGENTS.md#后端对接约定)。

## 业务界面

- [智能体问答与问答树](features/assistant.md)：左侧选择问答树并进行问答，右侧查看与选择任务节点，按根到所选节点保留上下文，支持主干延伸和分支生长。
- [管理平台入口](features/platforms.md)：两栏的平台选择与详情界面，展示真实摘要、带头像的管理人列表和已配置的平台入口。

问答和平台目录均使用真实接口；各页面的数据来源与后端接口边界见各自专题。

## 本地开发与验证

在项目根目录执行以下命令安装依赖并启动开发服务：

```bash
npm install
npm run dev
```

开发服务监听 `0.0.0.0:24080`，端口被占用时启动失败，不自动切换端口。访问地址：

- 本机：`http://localhost:24080/dev/knowledge-accumulation/`。
- 映射：`https://pheno.szkl.com/dev/knowledge-accumulation/`。

首次启动前复制 `.env.example` 为 `.env.local`，填写与知识后端一致的开发登录凭据；生产构建前填写钉钉 CorpId。配置规则见[统一登录](platform/authentication.md)，资源前缀、映射服务器和开发代理见[环境与部署](platform/deployment.md)。生产资源使用 `/knowledge-accumulation/` 前缀。

生产构建和本地预览命令如下：

```bash
npm run build
npm run preview
```

`preview` 用于预览构建产物。使用 `npm test` 运行认证、问答树与会话状态的 Node 功能测试；当前没有 Lint 或格式检查脚本。业务开发后仍需验证交互和接口链路，构建成功不能代替业务联调。后端的启动条件和方式见其[项目说明](../../knowledge-accumulation-be/description/project.md)。

## 待确认事项

以下事项应在对应功能实施前明确，并将确认结果记录在相关专题文档中：

- 问答服务：生产网关 SSE 缓冲设置、真实模型工具与来源展示的后续验证。
- 平台入口：纳入的平台范围、地址来源、当前页或新窗口访问方式，以及不可用状态的交互。
- 身份与权限：平台入口的可见范围、其他管理平台对共享 token 的适配。
- 部署接入：生产网关及静态托管配置，以及钉钉企业应用真实环境联调。

## 文档维护

本文件维护项目级目标、边界和整体状态。跨业务的前端基础能力与具体用户功能形成稳定设计后，再按[文档风格手册](documentation.md)建立专题文档，并在[文档导航](readme.md)登记；接口细节继续引用后端权威契约。
