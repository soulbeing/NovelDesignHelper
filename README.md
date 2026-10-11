# 故事织场 · Novel Design Helper

面向小说情节设计的浏览器无限画布。React + TypeScript + Vite，Node.js + Express，React Flow。

## 启动

需要 Node.js **22.12 或以上**。在项目目录运行：

```powershell
yarn install
yarn start
```

打开终端打印的 Vite 地址，默认 **http://localhost:5173**。`yarn start` / `yarn dev` 同时启动前端与 Node API，不需要提前构建。API 默认端口为 3001。若旧服务器正在运行，先在旧终端按 Ctrl+C，再启动。5173 已占用时 Vite 会打印新的前端端口，请以终端为准。

也支持 `npm install`、`npm start`。一个工作目录选择一种包管理器即可。

生产模式：

```powershell
yarn build
yarn serve
```

此时 Node 同时提供构建后的前端与 API，默认访问 **http://localhost:3001**。`serve` 必须先 `build`。

## 第一版能力

- 无限画布：平移、缩放、缩略图、定位全部元素。
- 情节、人物、设定、备注卡片；编辑标题、内容、阶段和故事核心。
- 拖动或依次点击卡片左右连接点创建有方向的关系，点击连线编辑含义。
- 搜索 / 类型筛选、删除、撤销 / 重做（Ctrl/⌘ Z、Ctrl/⌘ Shift Z）。输入框里的快捷键由浏览器处理。
- 修改后自动保存到 Node 服务器的 `data/board.json`；浏览器保留本机备份。未同步的本机草稿会提示恢复或下载。
- JSON 导入 / 导出，保留位置和结构；Markdown 导出包含完整内容与带 ID 的方向关系，方便提供给 AI。
- AI 搭档：自带 OpenAI API Key，结合当前故事板聊天，生成结构预览，添加到画布或替换整个故事板，应用后继续编辑或撤销。

首次打开包含可编辑的示例故事「雾港来信」。这是单用户、单故事板的基础版本；不同浏览器 / 设备连接同一服务器共享此故事板，暂不支持同时编辑、账号或实时协作。

## AI 设置

点击顶部「AI 搭档」，填写自己的 OpenAI API Key 和可访问的模型名称（默认 `gpt-5-mini`）。模型需支持 **Responses API + Structured Outputs**。

「讨论故事」只聊天；「生成结构」返回卡片与连线提案。展开提案查看内容后选择「添加到画布」或「替换整个故事板」。生成失败、停止或格式无效都不会修改现有故事。最多一次生成 60 个元素和 180 条关系，服务端等待上限 120 秒；输入较大时建议分段设计。

Key 仅存在页面内存和当次服务器请求，不写入 localStorage、故事文件或日志；刷新页面需要重新填写。聊天记录也仅存在本页面内存。请求固定发送到 `https://api.openai.com/v1/responses`，设置 `store: false`。聊天最近 24 条消息与**整个当前故事板**作为上下文发送至 OpenAI。调用按用户自己的 API 用量计费，需有 API 额度。

默认不开启真实 API 测试，以免消耗用户额度；测试通过模拟 OpenAI 响应验证请求、解析、错误处理和结构校验。

## Windows 与 iOS

Windows 在现代浏览器中使用。iPhone / iPad 使用 Safari；响应式侧栏、底部编辑面板、触摸拖动、双指缩放与点按连线已实现。iPad 横屏更适合大型情节图。尚未在 iOS 真机验证，也尚未实现离线 PWA 或原生安装包。

开发时 Windows 与 iOS 接入同一个 Wi-Fi，在 iOS 打开 `http://<Windows局域网IPv4>:5173`（用 `ipconfig` 查地址，并在 Windows 防火墙中允许对应端口）。手机的 `localhost` 指手机本身。若 Vite 打印了其他端口，请使用那个端口。

当前服务器用于个人本地 / 可信局域网使用，没有登录与租户隔离。部署到公网前需要补上认证和权限控制，并使用 HTTPS；提交 API Key 的设备到服务器链路也应使用 HTTPS。

## 数据与配置

- 服务器数据：`data/board.json`，已加入 Git 忽略。JSON 导出用于额外备份。
- 浏览器本机备份：localStorage，清除浏览器数据会删除该备份。
- 画布上限：1500 个元素、5000 条关系；保存 / 导入请求限制 2 MB。
- 撤销历史仅本次页面会话保留，最多 80 个快照。
- `PORT`：API / 生产端口，默认 3001。开发代理同步采用该值。
- `HOST`：Node 监听地址，默认 `0.0.0.0`。
- `DATA_DIR`：数据目录，默认 `data`。

例如 PowerShell 更换 API 端口：

```powershell
$env:PORT = '3002'
yarn start
```

## 验证

```powershell
yarn test
yarn build
```

测试覆盖导入校验、保存与拒绝无效覆盖、Markdown 内容、AI 结构的 ID 重映射、无效关系拒绝、聊天 / 生成模式、API Key 不泄露、上游失败与未完成输出。

## 技术选择

Next.js 可以实现此应用，但当前重点是客户端交互画布，服务端渲染不是必要条件。Vite 是构建工具，不是全栈框架；这里采用 React SPA + 独立 Node API，结构直接，适合先把编辑体验做稳。后续确实需要公开页面、复杂路由或服务端渲染时再考虑引入 Next.js。

React Flow 提供可定制节点、连线与触摸交互。当前定位是小说结构编辑器；自由手绘、多种几何图形、图片、分组与结构图图像导出属于后续迭代。

参考：[Next.js SPA](https://nextjs.org/docs/app/guides/single-page-applications)、[React Flow 自定义节点](https://reactflow.dev/learn/customization/custom-nodes)、[OpenAI 结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs)、[GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini)。
