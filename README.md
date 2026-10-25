# knowledge-accumulation-fe

企业知识沉淀统一前端入口，提供智能体问答、问答树和管理平台入口，后端对接同级 `knowledge-accumulation-be`。

```bash
npm install
# 首次运行：复制 .env.example 为 .env.local 并配置开发登录凭据
npm run dev
```

开发端口为 `24080`，访问 `http://localhost:24080/dev/knowledge-accumulation/`，映射地址为 `https://pheno.szkl.com/dev/knowledge-accumulation/`。

钉钉移动端全屏入口：[开发环境](https://pheno.szkl.com/dev/knowledge-accumulation/?dd_full_screen=true#assistant)、[生产环境](https://pheno.szkl.com/knowledge-accumulation/?dd_full_screen=true#assistant)。钉钉应用首页应使用带参数的入口地址；漏参时，移动钉钉会先尝试原生替换到全屏入口，再展示进入动画并加载应用；失败或超时则继续在当前页面加载。

项目目录和 npm 包名为 `knowledge-accumulation-fe`；网页资源、API、平台跳转路径继续沿用 `/knowledge-accumulation`，开发模式增加 `/dev` 前缀。更名不改变浏览器存储键及用户偏好。

验证使用 `npm test`，构建使用 `npm run build`。详见[项目说明](description/project.md)、[文档导航](description/readme.md)和[开发规范](AGENTS.md)。

生产部署使用根目录 `Dockerfile` 和 `nginx.conf`，由同级 `knowledge-accumulation-deploy` 的 `knowledge-frontend` 服务统一编排。Compose 在部署目录 `.env` 使用共用的公开标识 `DINGTALK_CORP_ID`，映射至前端构建参数 `VITE_DINGTALK_CORP_ID`；独立 Vite/Docker 构建仍使用后者。配置、API/SSE 转发与图标缓存规则见[环境与部署](description/platform/deployment.md#docker-与-compose)。

Git 仅开放构建部署所需文件、描述文档和必要目录占位，具体以 `.gitignore` 白名单为准。测试及模拟数据仅保留在开发者本地，部署仓库不包含测试集；`npm test` 适用于保留测试文件的开发目录。
