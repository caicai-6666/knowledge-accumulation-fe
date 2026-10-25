# 环境与部署

本文维护统一入口的资源前缀、后端代理与环境配置。登录模式及共享凭据见[统一登录](authentication.md)，项目启动命令见[项目总览](../project.md#本地开发与验证)。

## 开发映射

开发服务监听 `0.0.0.0:24080`，端口占用时失败，不自动换端口。

| 访问方式 | 地址 |
| --- | --- |
| 本机 | `http://localhost:24080/dev/knowledge-accumulation/` |
| 映射服务器 | `https://pheno.szkl.com/dev/knowledge-accumulation/` |

Vite `base` 为 `/dev/knowledge-accumulation/`，脚本、样式、图片、依赖与热更新连接均沿此前缀。开发网关保留完整 `/dev/knowledge-accumulation/` 路径，将请求原样转发到开发主机 24080，保留查询参数并支持 WebSocket 升级。HTTPS 在网关终止，内部使用 HTTP。

`config/developmentMapping.js` 对带 `/dev` 的 HTTP 与 WebSocket 请求直接透传，仅对旧网关移除前缀后的请求补回 `/dev`，不会重复添加前缀。依赖缓存使用项目根目录的 `cache/vite`，避免隐藏目录映射限制，也避免 npm 将 `node_modules` 下的额外缓存目录当作无用依赖清理。钉钉 SDK 明确加入依赖预构建列表；无需额外开放域名根目录 `/src/` 或 `/@vite/`。

## 移动 WebView 启动与资源类型

首屏通过独立 `src/bootstrap.js` 动态加载业务入口。模块加载与认证共用 `src/authentication-status.css` 的进入卡片样式，使用同样的“正在进入”与转圈，不显示额外的双语加载页；Vue 接管后卡片不重复淡入。初始化失败或超过 20 秒时，在同样的卡片内显示“暂时无法进入”、重新尝试和可展开的加载信息，不依赖 Vue 成功启动。加载信息仅留在本机页面，包含异常摘要、可获取的失败资源路径/HTTP 状态、浏览器及视口能力；不上传日志，不读取 token，资源 URL 的查询和 Hash 不展示。

认证成功后先挂载不可见、不可交互的工作台，以真实尺寸完成移动视口和内容布局。`workspaceReady.js` 仅等待首屏已经挂载的同源静态图片（或内联图片）、文档字体，以及连续两帧尺寸稳定；准备完成再淡入工作台，等待期间沿用进入卡片。模块与样式由业务入口加载链保证。整体等待最多 5 秒，静态图片失败不制造永久加载。头像 Blob、鉴权图片、外站图标、平台目录、树列表、附件与 SSE 均不纳入进入条件，首次失败即可采用各自默认状态，后续重试在后台进行。离开工作台或切换身份时取消旧等待，旧用户的完成通知不能揭开新用户页面。

明确的模块下载错误（例如 `TypeError: Importing a module script failed`）自动更换文档一次，不在已失败的模块缓存中重复 import。恢复地址增加临时 `ka_boot_retry`，保留其余参数和 Hash；成功后清理临时参数与恢复标记。sessionStorage 按页面路径记录两分钟内的恢复尝试，再次失败不自动循环，改为卡片内手动重试；存储受限时直接提供手动重试。代码执行异常、认证错误不触发此恢复。此措施用于短暂下载故障，不能代替排查持续的服务或网关问题。

开发服务器显式预构建 Vue、Markdown、钉钉 SDK 与 PDF 引擎并关闭运行时依赖发现，避免首访发现新依赖后重新优化导致并行请求版本失效。开发响应设置 `Cache-Control: no-store`，防止客户端预加载旧源码后继续引用已失效的依赖版本；这不改变生产哈希资源的长期缓存与公共图标缓存。只读核对发现过期依赖 URL 返回 504、当前完整模块链 82 项为正常 JavaScript；尚未获取报错手机的具体失败 URL，不能据此断言每次首访错误都由同一旧缓存引起。自动恢复与新响应头仍需该客户端实机复核。

图片使用 `new URL(..., import.meta.url).href` 提供给图片元素，避免开发模式将图片路径作为 `?import` JavaScript 模块请求。钉钉移动端曾报告脚本收到 `image/png` 导致拒绝执行；同 UA 的服务端依赖检查不能复现，尚不能仅凭该报错判定是网关、客户端图片处理还是缓存。生产构建仍由 Vite 转换为带哈希资源或内联图片，不影响图片缓存。

排查时先区分启动错误与登录错误：`module-startup-failed` 属于模块加载/初始化阶段，开发登录不调用钉钉 SDK，不能直接归因于 CorpId 或免登权限。可以提供页面中的加载信息定位；本次已由用户在 iPhone Air、iOS 26.4.1、钉钉 9.0.2 实机确认：改为普通图片 URL 后，开发地址恢复可进入。该结论只覆盖开发访问，未执行生产发布或生产钉钉免登验收。

## 钉钉移动端全屏入口

钉钉应用首页 URL 推荐直接配置以下地址，参数位于 Hash 之前：

- 开发：`https://pheno.szkl.com/dev/knowledge-accumulation/?dd_full_screen=true#assistant`
- 生产：`https://pheno.szkl.com/knowledge-accumulation/?dd_full_screen=true#assistant`

依据[钉钉移动端全屏能力](https://open.dingtalk.com/document/orgapp/full-screen-display-of-microapplication-page)，`dd_full_screen=true` 用于移动容器全屏展示；PC 不启用此能力。已从带参入口打开时不额外加载全屏 SDK，诊断阶段为 `entry-parameter`。移动钉钉从漏参旧地址打开时，先保持进入卡片隐藏，仅加载全屏辅助模块与 SDK，在 ready 后通过 [biz.navigation.replace](https://open.dingtalk.com/document/orgapp-client/replace-page) 将当前页面替换为带参地址，保留原查询参数与 Hash，不额外压入一个页面。新页面已有参数，不会再次跳转，此时才显示进入动画、加载业务模块和发起认证；旧容器不挂载应用、不发起登录。每个页面最多发起一次替换，迟到或重复回调不会重复执行。普通浏览器和钉钉 PC 不进行此跳转。

原生替换不可用或明确失败时，回退尝试 `biz.navigation.hideBar` 隐藏当前原生栏；全屏辅助模块、SDK 加载、桥接和原生调用总计最多等待 6 秒，超时停止等待，在当前页面显示进入动画，继续加载、登录和问答，不使用普通网页重载反复尝试。全屏流程不修改登录凭据、不主动调用登录接口，也不修改旧入口地址栏来伪造带参状态。

钉钉管理后台仍推荐直接配置上述带参首页，省去启动时的一次页面替换；仓库变更不会自动修改后台配置。实际隐藏效果需在钉钉客户端验证。发生不生效时，可在入口增加 `dd_display_debug=1`，页面显示原始入口是否带参、SDK 环境及阶段/错误；诊断仅在本机展示，不上传日志。`entry-parameter` 表示原始入口已带参数；`replace-success` 表示原生替换回调成功，`native-success` 表示回退隐藏接口回调成功，均不等同于实机视觉验收。用户已在 iPhone Air 钉钉 9.0.2 确认带参新入口可隐藏原生栏；从旧工作台入口自动替换的实际效果仍待实机确认。

此前 `sdk-failed: importing a module script failed` 已只读复现为 SDK 旧预构建 URL 返回 504：缓存目录被 npm 清理后，运行中的 Vite 仍持有旧引用；缓存已迁出 `node_modules`，配置变更触发开发服务器重建预构建依赖。

## API 转发

浏览器统一调用同源接口，不直接请求本机后端地址。

| 环境 | 浏览器 API 前缀 | 到后端的前缀 |
| --- | --- | --- |
| 开发 | `/dev/knowledge-accumulation/api` | knowledge-accumulation-be：`/knowledge-accumulation/api` |
| 生产与 preview | `/knowledge-accumulation/api` | knowledge-accumulation-be：`/knowledge-accumulation/api` |

开发代理只移除 `/dev`。登录、头像与平台目录均通过同一前缀调用 knowledge-accumulation-be。`KNOWLEDGE_BACKEND_URL` 控制开发和 preview 代理目标，默认 `http://127.0.0.1:24000`，必须是无凭据、路径、查询和片段的 HTTP/HTTPS 根地址，不注入浏览器。平台列表不再调用 registry-be，无需 `REGISTRY_BACKEND_URL`。

## 生产部署

生产资源前缀为 `/knowledge-accumulation/`，将 `dist/` 放在该路径；`/knowledge-accumulation/api/` 应优先转发到 knowledge-accumulation-be，保留完整业务前缀，不能退回前端 HTML。同源管理平台可使用更深的路径；网关需按最长路径优先匹配，避免被统一入口静态规则覆盖。

生产构建前配置公开企业标识：Compose 使用部署目录的 `DINGTALK_CORP_ID`，独立 Vite/Docker 构建使用 `VITE_DINGTALK_CORP_ID`。后端选择 `APP_ENV=production` 并配置对应钉钉应用。生产容器使用下述 Nginx 配置；`npm run preview` 仅用于验证产物及同源代理，不作为生产服务器。

## Docker 与 Compose

根目录 `Dockerfile` 使用 Node 24 构建、Nginx 1.28 Alpine 提供静态网页。`.dockerignore` 使用白名单，不将本机 `.env`、开发固定凭据、测试、依赖或构建产物发送到构建器。只通过公开构建参数 `VITE_DINGTALK_CORP_ID` 配置生产免登，缺失时构建失败；修改 CorpId 后必须重建镜像。

同级 [部署项目](../../../knowledge-accumulation-deploy/readme.md)的 `knowledge-frontend` 服务从 `../knowledge-accumulation-fe` 构建，宿主机默认 `127.0.0.1:24080` 映射容器 80。它与 `knowledge-backend` 位于同一网络，通过 `BACKEND_UPSTREAM=knowledge-backend:8000` 转发 API，等待后端 HTTP 健康后启动。独立运行镜像时须将该变量改为容器内可达的后端 `host:port`，不能填宿主机的 `127.0.0.1`。

Compose 共用部署目录 `.env` 中的 `DINGTALK_CORP_ID`：同一值传给知识后端环境变量 `DINGTALK_CORP_ID` 和前端构建参数 `VITE_DINGTALK_CORP_ID`，不再在部署目录维护两份企业标识。前端 Docker ARG 名和代码不变；独立运行 Vite 时仍在前端 `.env.local` 配置 `VITE_DINGTALK_CORP_ID`，独立构建 Docker 时仍使用 `--build-arg VITE_DINGTALK_CORP_ID=...`。AppKey/AppSecret 仅由知识后端实际配置提供，不传入前端构建。

在部署目录 `.env` 配置 `DINGTALK_CORP_ID` 和可选的 `KNOWLEDGE_FRONTEND_PORT` 后执行：

```bash
docker compose config --quiet
docker compose build knowledge-frontend
# 已有后端运行时，仅更新前端，避免连带重启其他服务。
docker compose up -d --no-deps knowledge-frontend
```

Nginx 保留 `/knowledge-accumulation/api/` 路径和 Bearer 头，不重试任务请求；API 禁止缓存，SSE 关闭代理缓冲，读取空闲超时为 3600 秒。请求体上限 22 MiB，为后端最多 20 MiB PDF 加 multipart 和问题字段预留空间，最终限制仍以后端校验为准。`/healthz` 仅检查前端 HTTP，不触发登录或模型任务。

镜像已在隔离 Docker 网络中验证 Nginx 配置、健康探针、路径回退、缓存头、鉴权头和 multipart 转发；超过 20 MiB 且包含额外字段的请求可通过代理，23 MiB 请求被拒绝。测试上游的首条 SSE 事件在延迟结束事件前即时到达。此验证使用公开测试 CorpId 和模拟上游，不替代生产钉钉免登或真实模型验收，不启动正式 Compose 服务。

外层网关应将生产 `/knowledge-accumulation/` 转发到前端 24080，并保留 HTTPS 的 `X-Forwarded-Proto`。网关也需关闭 SSE 缓冲并设置足够的空闲超时。`/knowledge-accumulation/registry` 和 `/knowledge-accumulation/contract` 必须优先转发至各自前端；当前统一入口容器对这两个前缀返回 404，不将子平台错误显示成统一入口。开发映射仍使用 Vite 和 `/dev`，生产容器不提供开发固定凭据路由。

代理和缓存指令以 [Nginx 代理模块](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)及[响应头模块](https://nginx.org/en/docs/http/ngx_http_headers_module.html)为参考。

## 公共图标缓存

Nginx 为 `/knowledge-accumulation/assets/` 下带内容哈希的图标及其他构建资源设置 `public, max-age=31536000, immutable`，小图标可能内嵌在同样带哈希的 JS 中并随其缓存。无哈希公共图标缓存 7 天；首页、SPA 回退页和 `icon-cache-sw.js` 使用 `no-cache` 以检查更新。缺失静态文件返回 404，不回退 HTML，也不获得长期缓存头。

统一入口注册 `icon-cache-sw.js`，在 HTTPS 或 localhost 且浏览器支持 Service Worker 时，为本地图标、图片及回答中的外站图标提供 Cache Storage 持久缓存。图标首次受控加载后可跨刷新复用，最长 7 天、最多 48 项，同一 URL 的并发加载合并；带版本哈希的构建资源更新后使用新 URL。外站支持 opaque 图片响应，不要求站点开放 CORS；请求不带 Cookie 或业务 Bearer。可读的失败响应及声明 no-store 的响应不落缓存；opaque 响应受浏览器限制，无法检查状态码或缓存头。

缓存仅处理统一入口页面发起的公共图片请求，不缓存子平台页面、接口、鉴权头像、附件、HTML 或脚本；开发与生产缓存按各自 scope 隔离。内联 SVG 图标不产生网络请求，无需额外缓存。浏览器禁止缓存或注册失败时回退正常图片加载，不影响登录及问答。网关需将该脚本按静态 JavaScript 正常返回，不能回退成 HTML；不应给 Service Worker 脚本设置长期 immutable 缓存。
