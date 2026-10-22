# 环境与部署

本文维护统一入口的资源前缀、后端代理与环境配置。登录模式及共享凭据见[统一登录](authentication.md)，项目启动命令见[项目总览](../project.md#本地开发与验证)。

## 开发映射

开发服务监听 `0.0.0.0:24080`，端口占用时失败，不自动换端口。

| 访问方式 | 地址 |
| --- | --- |
| 本机 | `http://localhost:24080/dev/knowledge-accumulation/` |
| 映射服务器 | `https://pheno.szkl.com/dev/knowledge-accumulation/` |

Vite `base` 为 `/dev/knowledge-accumulation/`，脚本、样式、图片、依赖与热更新连接均沿此前缀。开发网关保留完整 `/dev/knowledge-accumulation/` 路径，将请求原样转发到开发主机 24080，保留查询参数并支持 WebSocket 升级。HTTPS 在网关终止，内部使用 HTTP。

`config/developmentMapping.js` 对带 `/dev` 的 HTTP 与 WebSocket 请求直接透传，仅对旧网关移除前缀后的请求补回 `/dev`，不会重复添加前缀。依赖缓存使用 `node_modules/vite-cache`，避免隐藏目录映射限制；无需额外开放域名根目录 `/src/` 或 `/@vite/`。

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
