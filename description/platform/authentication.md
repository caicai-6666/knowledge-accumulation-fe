# 统一登录与共享凭据

统一入口负责开发登录、钉钉生产免登及共享 token；管理平台从同源存储读取凭据。接口权威定义见后端[人员登录 API](../../../knowledge-accumulation-be/description/api/auth.md)，路径与代理见[环境与部署](deployment.md)。

## 模式与配置

默认 `npm run dev` 使用开发登录，生产构建使用钉钉登录。`VITE_AUTH_MODE` 可显式选择 `development` 或 `production`，必须与后端 `APP_ENV` 一致；开发服务器可选择生产模式进行钉钉联调，构建和预览仅允许生产模式。模式不通过公开后端接口获取，也不在生产失败时回退开发身份。

| 配置 | 用途 |
| --- | --- |
| `KNOWLEDGE_DEVELOPER_LOGIN_CREDENTIAL` | 仅开发服务器使用，固定登录凭据，值与 knowledge-accumulation-be 的 `AUTH_DEVELOPER_ACCESS_TOKEN` 一致；不是用户 token |
| `VITE_DINGTALK_CORP_ID` | 独立 Vite/Docker 构建使用的钉钉企业公开 CorpId，与后端企业配置一致；Compose 从部署目录 `DINGTALK_CORP_ID` 映射此值 |
| `VITE_AUTH_MODE` | 可选模式覆盖；通常使用默认值即可 |

独立开发时复制根目录 `.env.example` 到被忽略的 `.env.local` 后填写本机值，修改后重启服务。后端登录接口随应用提供，需具备其文档要求的中间件平台会话及中央登录授权；依赖故障按接口错误处理，不伪造登录成功。开发凭据禁止使用 `VITE_` 前缀；钉钉 AppKey、AppSecret 和应用 accessToken 只配置在后端。`VITE_` 配置会成为公开的浏览器构建内容。

Compose 部署只在 `knowledge-accumulation-deploy/.env` 维护公开的 `DINGTALK_CORP_ID`，同时供后端环境和前端构建参数使用；无需在前端实际 `.env` 重复配置。修改后重建前端镜像，并更新后端环境。部署映射见[Docker 与 Compose](deployment.md#docker-与-compose)。

## 登录流程

进入时先读取 `localStorage.access_token`，存在合法字符串时调用 `/auth/me` 验证。成功后展示工作台与当前姓名；401 清理对应旧凭据并重新登录；网络、超时、503 等错误保留已存 token，展示错误和手动重试。回到窗口时重新验证，其他标签页更新共享键时取消旧请求并验证新值。

“正在进入”与“暂时无法进入”共用同一个紧凑、固定尺寸的状态框，切换时标题及说明先淡出再淡入；标题置于上方，加载动画在其下方内容区域水平、垂直居中；加载时不展示连接说明或占位重试按钮，失败时在同一内容区域展示错误说明与重试入口，卡片外框不重建、不缩放或闪烁。进入或离开工作台仍通过透明度过渡衔接，工作台通过 `KeepAlive` 保留问答和平台选择，认证失败时停用，恢复同用户身份时激活；更换 userid 会淘汰旧工作台及其子缓存。系统减少动画偏好下即时切换。

“重新尝试”采用用户提供的 Uiverse.io / ke1221 浅灰浮雕按钮样式，按下时转为内凹阴影，与管理平台入口按钮保持一致。

开发模式从开发服务器专用的 `/dev/knowledge-accumulation/__auth/developer` 读取 `login_credential`，携带固定 Bearer 调用 `POST /auth/login`，不发送 body 或 Content-Type。校验成功响应后，仅将返回的随机 `access_token` 写入共享存储；固定凭据不作为用户会话，不传给 `/auth/me` 或业务接口。该凭据路由只存在于开发登录服务器，不在生产构建或预览中提供，响应禁止缓存。开发服务应仅向可信的开发访问范围开放。

生产模式按钉钉[官方 H5 示例](https://github.com/open-dingtalk/h5app-auth-demo/blob/main/frontend/src/App.js)调用 `dd.ready` 和 `dd.runtime.permission.requestAuthCode`，将新 code 以 `{"code":"..."}` 提交 `/auth/login`。成功后保存返回的中央用户 `access_token`，不保存 code，不向后端提交企业配置。失败后不重发同一个 code；点击重试会重新申请。没有可用共享 token 时，需要在已配置的钉钉企业内部 H5 应用中打开，普通浏览器显示提示。

两种模式均使用中央随机用户 token，`expires_in` 是登录时中央确认的剩余秒数；有效查询由中央续期，后端重启不会直接使中央 token 失效。同用户显式登录会使旧 token 失效。前端以 `/auth/me` 验证结果为准，不设置本地固定到期时间。生产首次登录可能初始化员工与头像，请求超时为 75 秒；钉钉 JSAPI 就绪与取码等待上限为 20 秒。

## 用户头像

工作台右上角在姓名旁显示圆形头像。`UserAvatar.vue` 从当前身份的 `avatar_url` 取得文件名，通过[头像读取接口](../../../knowledge-accumulation-be/description/api/resource.md#读取头像)携带共享 Bearer token 请求 WebP，再创建本地 Blob URL 显示；开发沿用 `/dev` 代理前缀，token 不放入图片 URL。

无头像、文件不存在、图片解码失败、网络异常或 15 秒超时时使用默认人像，不阻塞工作台，不修改共享凭据。身份更新时取消旧请求并加载新头像，过期响应不覆盖新身份；替换、解码失败和组件卸载时释放 Blob URL。

## 管理平台交接

| 项目 | 约定 |
| --- | --- |
| 存储 | `localStorage` |
| 键 | `access_token` |
| 值 | 原始 token 字符串，不添加 `Bearer `，不使用 JSON 包装 |
| 后续请求 | `Authorization: Bearer <access_token>` |

统一入口确认写入成功后才展示业务界面。各管理平台每次请求读取最新值，并由服务端验证身份与平台权限；文件访问等级 `platform_permissions` 不代表平台管理权限。`registry-fe` 已采用此共享键；其他平台仍需按此约定接入，不能假设它们原有的会话存储会自动兼容。

共享要求协议、域名、端口完全一致，例如 `https://pheno.szkl.com/dev/knowledge-accumulation/` 与同域其他路径。`localhost:24080` 与 `localhost:23080` 不共享；不同域名也不共享。跳转地址和 URL 参数中不携带 token。注册中心入口已按指定同源路径开放，具体地址与其他平台状态见[管理平台入口](../features/platforms.md#布局与交互)。

## 验证

`npm test` 覆盖两种模式、刷新复用、共享键、401/503、迟到响应、取消、存储受限、一次性 code 重试、JSAPI 及开发路由。真实开发联调应覆盖无 body 的 `/auth/login` 交换及返回 token 的 `/auth/me` 验证，生产钉钉全链路需要企业配置与钉钉客户端；模拟测试不代表真实生产登录已通过。
