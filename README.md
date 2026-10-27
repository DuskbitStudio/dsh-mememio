# dsh-mememio

把 MeMeMio 的只读表情包 MCP 接入 DSH：在设置页填站点地址和只读令牌，连接后模型在情绪回复时会自主挑图。

## 功能

- 设置页填写 MeMeMio 站点 + 只读 PAT，支持测试、连接、断开、重新测试。
- 连接后注册 5 个只读工具：`search_memes`、`pick_meme_for_reply`、`get_meme_image`、`random_meme`、`list_vocab`（在 DSH 中显示为 `mcp__mememio__*`）。
- 自动表达：开心、吐槽、无语、庆祝、安慰等场景下，由模型自主决定是否配图；每轮最多 1 张、不替代文字；频率（克制/自然/活跃）与场景可在设置页调整。
- 选图策略：默认先读 `pick_meme_for_reply` 返回的候选文字（描述 / OCR / 标签），从中选最贴合的一张，直接用原图 URL 发；只有文字不足以判断时，才对最终一张取图确认，不逐张取图。
- 严肃场景开关：工作、技术讨论、代码、会议等场景默认不配图；可在设置页打开「严肃场景配图」，由用户决定是否允许。
- 只读：插件不上传、不修改、不删除任何图片；成人向与标签过滤器仍由 MeMeMio 网页的「设置 → MCP 接入」控制。
- 本地优先：设置页与 Host 之间的 API 仅接受 loopback + 同源请求，令牌不会回传到浏览器（只回掩码）。

## 界面

设置 → **MeMeMio 表情包**，先填站点地址与只读令牌：

![首次接入](docs/screenshots/01-settings-empty.png)

连接成功后可以查看连接详情、5 个只读工具，并调整自动表达：

![已连接与自动表达](docs/screenshots/02-settings-connected.png)

- 使用频率：克制 / 自然 / 活跃；
- 触发场景：开心、吐槽、无语、庆祝、安慰、打招呼、拒绝、其他，可自由勾选；
- **严肃场景配图**：工作、技术讨论、代码、会议等场景是否允许配图，默认关闭；
- 每轮最多 1 张、不替代文字；是否配图仍由模型自主判断。

暗色模式跟随 DSH 主题：

![暗色模式](docs/screenshots/03-settings-connected-dark.png)

> 截图使用示例数据（地址 `https://memes.example.com`，令牌为假掩码），实际地址与令牌以本机配置为准。

## 安装

把本仓库作为 bundle 安装到当前 DSH profile：

```text
plugin_manager action=install_bundle target=<仓库绝对路径>
```

安装结果出现 `application: applied` 即生效；若为 `restart-required`，重启 DSH。

## 使用

1. 打开 **设置 → MeMeMio 表情包**。
2. 在 MeMeMio 网页的「设置 → MCP 接入」创建一个**只读**令牌。
3. 填站点地址（示例：`https://memes.example.com`，插件会自动补 `/mcp`）与令牌，点「测试连接」。
4. 测试通过后点「保存并连接」；5 个工具会出现在当前 profile。
5. 自动表达默认开启（自然频率）；不需要时可在设置页关闭或调低频率。

> 仓库源码中的默认地址是示例 `https://memes.example.com`，令牌默认空；实际地址与令牌只保存在本机的 `$DSH_HOME/secrets/mememio.json`（权限 `0600`）。

## 配置与安全

- 配置（含令牌）保存在 `$DSH_HOME/secrets/mememio.json`，权限 `0600`；不要提交、上传或贴日志。
- 设置页本地 API 仅接受本机同源请求；令牌只回掩码，不写日志。
- MCP server 固定为 `mememio`，使用 `@deepseek-ai/dsh-mcp-client` 的 streamable-http transport。
- 自动表达是系统提示驱动的**模型自主行为**，不是硬编码每轮配图，不保证 100% 触发。
- v1 仅支持本机 DSH Web；远程访问需要改为 Host Remote 服务（后续版本）。

## 文件

```text
package.json          bundle / client 清单与 exports
cordis.patch.yml      Host 行 + 预置 mememio MCP 行（默认 disabled）
index.js              Host：本地 API、配置读写、MCP 行开关、系统提示
client.js             Client：设置页（settings.section）
locale/zh.json        插件管理器标题/描述（中文）
locale/en.json        插件管理器标题/描述（英文）
icon.svg              插件图标
test/                 Node 内置测试（不参与运行时与打包）
README.md             本文件
```

`docs/screenshots/` 仅用于 README 展示，不参与运行时。设计稿与交接文档不参与运行时，默认不随仓库上传（见 `.gitignore`）。

## 开发

```powershell
node --check index.js
node --check client.js
```

- 改 Host（`index.js`）后，重载 `include:dsh-mememio` 行生效。
- 改 Client（`client.js`）后，刷新/重开设置页生效。

## 测试

```powershell
npm test
```

覆盖 `expressionPrompt` 的候选复核、频率和严肃场景规则，以及 `normalizeConfig`、`normalizeMcpUrl`、`maskToken`。测试使用 Node 内置 `node:test`，不需要额外依赖，也不会连接 MeMeMio 或修改本机配置。

## 卸载

```text
plugin_manager action=remove_bundle target=dsh-mememio
```

会同时移除 bundle 内的 Host 行和 MCP 行。
