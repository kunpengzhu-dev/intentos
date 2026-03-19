# OpenClaw Gateway Client

这是一个放在 `intentos/packages/openclaw-gateway-client/` 下的独立示例实现，目标是给你一个“底层薄，业务层厚”的
OpenClaw Gateway client 骨架。

它有两个层次：

- 薄的传输层：`GatewayTransport`
  - WebSocket 建连
  - `connect.challenge -> connect -> hello-ok`
  - 请求/响应关联
  - `accepted -> final` 双阶段响应
  - 事件分发
- `tick` 保活、指数退避重连、connect 错误恢复
- connect 错误细节解析
- Node 端默认启用持久化 device identity，并在 connect 阶段发送签名后的 `device`
- 可选的 device token 加载/持久化/清理回调
  - 默认拒绝非 loopback 的明文 `ws://`
- 厚的业务层：`OpenClawGatewayClient`
  - `client.chat.*`
  - `client.agent.*`
  - `client.agents.*`
  - `client.sessions.*`
  - `client.models.list()`
  - `client.usage.*`
  - `client.runtime.*`
  - `client.channels.*`
  - `client.browser.request()`
  - `client.nodes.*`
  - `client.devices.*`
  - `client.config.*`
  - `client.cron.*`
  - `client.approvals.*`
  - `client.wizard.*`
  - `client.talk.*`
  - `client.tts.*`
  - `client.voiceWake.*`
  - `client.skills.*`
  - `client.tools.*`

## 设计边界

这个目录里的代码不依赖 `src/` 下的 OpenClaw 实现代码，也没有复用 repo 内部类型。
它是基于 `docs/spec/zh` 和当前协议行为手写出来的独立实现。

当前版本优先覆盖最常见的自定义后端场景：

- `operator` 角色
- 共享 `token` / `password` 鉴权
- Node 端默认 device identity 鉴权签名
- 当前 `src/gateway/server-methods-list.ts` 里静态列出的内建 Gateway 方法的高层封装入口
- 同时保留原始 `request()` / `requestPhased()` 薄层
- 对宽结果和 provider/plugin 扩展结果保留未知字段
- 可选的持久化 device token 回调：
  - `loadDeviceToken()`
  - `storeDeviceToken()`
  - `clearDeviceToken()`

没有在第一版里完整实现：

- 基于 device identity 的完整配对建连流程
  - 虽然已经封装了 `device.pair.*` / `node.pair.*` 这些 request 方法，但 connect 阶段的 device-auth 流程本身没有做
- 面向 `node` 角色的完整建连和认证流程
  - transport 虽然允许传 `role: "node"`，但目前没有补上 node 角色通常需要的完整 connect/auth 配套能力
- TLS fingerprint 校验
- 基于 schema 的严格运行时校验
  - 当前只对 frame 顶层和少量关键 payload 做了轻量判断，不做完整 payload schema 校验

## 目录结构

```text
packages/openclaw-gateway-client/
  src/types.ts
  src/transport.ts
  src/services.ts
  src/client.ts
  src/index.ts
  scripts/smoke-test.ts
  tests/gateway-client.test.ts
```

## 快速使用

```ts
import { OpenClawGatewayClient } from "./src/index.js";

const client = new OpenClawGatewayClient({
  url: "ws://127.0.0.1:18789",
  auth: { token: process.env.OPENCLAW_TOKEN },
  role: "operator",
  scopes: ["operator.admin"],
  client: {
    id: "gateway-client",
    version: "0.1.0",
    platform: "node",
    mode: "backend",
  },
});

await client.connect();

const history = await client.chat.history({
  sessionKey: "agent:main:main",
  limit: 50,
});

const { ack, final } = await client.chat.sendAndWaitFinal({
  sessionKey: "agent:main:main",
  message: "hello",
});

console.log(history.messages.length, ack.runId, final.state);
```

上面这个例子使用的是当前实现和当前 Gateway schema 都兼容的显式写法：

- `role: "operator"`
- `client.id: "gateway-client"`
- `client.mode: "backend"`
- `client.platform: "node"`

虽然这份独立实现会给 `client.version`、`client.platform`、`client.mode` 提供默认值，
但实际接入时更建议显式传入，避免“示例值”和“默认值”混在一起。

当前 transport 层的 connect 默认值是：

- `role`: `"operator"`
- `scopes`: `["operator.admin"]`
- `client.id`: `"gateway-client"`
- `client.version`: `"0.1.0"`
- `client.platform`: Node 运行时默认 `"node"`，浏览器环境回退到 `navigator.platform`
- `client.mode`: `"backend"`
- `deviceIdentity`: Node 环境默认从 `~/.openclaw-gateway-client/identity/device.json` 加载或生成

另外，当前 transport 还有几个显式行为：

- 默认拒绝连接远程明文 `ws://`；如果你确实要这么连，需要传 `allowInsecureWs: true`
- 对 connect 阶段常见的认证失败会暂停自动重连，避免死循环
- 如果你同时提供共享 token 和已持久化的 device token，它会在 `AUTH_TOKEN_MISMATCH` 这类可恢复错误后尝试一次 device-token 重试
- 如果你没有显式禁用，它会在 Node 端自动附带签名后的 `device` 负载，避免 3.13+ Gateway 把自声明 scopes 清空

如果你想显式控制 device identity，可以这样传：

```ts
import {
  loadOrCreateGatewayDeviceIdentity,
  OpenClawGatewayClient,
} from "./src/index.js";

const client = new OpenClawGatewayClient({
  url: "ws://127.0.0.1:18789",
  auth: { token: process.env.OPENCLAW_TOKEN },
  deviceIdentity: loadOrCreateGatewayDeviceIdentity("./tmp/device.json"),
});
```

如果你确实要关闭它，也可以显式传：

```ts
const client = new OpenClawGatewayClient({
  url: "ws://127.0.0.1:18789",
  auth: { token: process.env.OPENCLAW_TOKEN },
  deviceIdentity: null,
});
```

渠道、运维和审批面的方法也已经补了一层封装，例如：

```ts
const status = await client.channels.status({ probe: true });
const browserState = await client.browser.request({
  method: "GET",
  path: "/state",
});
const nodes = await client.nodes.list();
const tools = await client.tools.catalog({ includePlugins: true });
const wizard = await client.wizard.start({ mode: "remote" });
```

## 什么时候用薄层

如果你要调用插件动态注入的方法，或者未来 Gateway 新增但这里还没补的 API，直接用：

```ts
const result = await client.request("channels.status", { probe: true });
```

如果该方法是同一个 request id 上先 `accepted`、再 `final` 的模式，用：

```ts
const phased = await client.requestPhased("agent", {
  message: "run",
  idempotencyKey: crypto.randomUUID(),
});

const accepted = await phased.accepted;
const final = await phased.final;
```

当前内建的典型 two-phase 方法包括：

- `agent`
- `exec.approval.request`，当 `twoPhase: true` 时

## 服务入口

当前 `OpenClawGatewayClient` 已经直接暴露这些高层 service：

- `client.chat`
- `client.agent`
- `client.agents`
- `client.sessions`
- `client.models`
- `client.usage`
- `client.runtime`
- `client.channels`
- `client.browser`
- `client.nodes`
- `client.devices`
- `client.config`
- `client.cron`
- `client.approvals`
- `client.wizard`
- `client.talk`
- `client.tts`
- `client.voiceWake`
- `client.skills`
- `client.tools`

另外还保留了两个底层入口：

- `client.request(method, params)`
- `client.requestPhased(method, params)`

## 校验

```bash
cd intentos/packages/openclaw-gateway-client
pnpm run check
pnpm test
```

## 真实环境 Smoke Test

如果你想在真实 OpenClaw Gateway 上验证这份独立 client，而不是只跑本目录里的自测，
可以用这个目录自带的 smoke 脚本。

它现在会默认先读取 `intentos/.env`，再按下面的优先级取值：

- CLI 参数
- 当前 shell 环境变量
- `intentos/.env`
- 脚本内置默认值

默认使用的环境变量名是：

- `OPENCLAW_GATEWAY_URL`
- `OPENCLAW_TOKEN`
- `OPENCLAW_PASSWORD`

如果你还没准备本地环境文件，可以先从 `intentos/.env.example` 复制一份到 `intentos/.env`。

最简用法：

```bash
cd intentos/packages/openclaw-gateway-client
pnpm run smoke
```

如果你想显式覆盖 `.env` 的值，仍然可以传参数：

```bash
cd intentos/packages/openclaw-gateway-client
pnpm run smoke -- --url ws://127.0.0.1:18789 --token "$OPENCLAW_TOKEN"
```

这个脚本会把你关心的内建 Gateway 方法按项打印成：

- `METHOD <name>: PASS`
- `METHOD <name>: SKIP`
- `METHOD <name>: FAIL`

并输出每一项的原始 JSON 结果，方便直接观察协议返回。

每次运行还会在 `intentos/.artifacts/` 下生成本地文件：

- `logs/*.log`：完整终端日志
- `reports/*.json`：最终结果汇总，包含 hello、方法结果和事件观察结果

当前 smoke 的执行策略是：

- 只读方法自动执行并打印结果
- 修改型方法不自动执行，只打印 `SKIP`
- 依赖真实夹具的方法会先做前置发现
  - 比如先查 `agents.list` 再决定是否执行 `agents.files.*`
  - 先查 `sessions.list` 再决定是否执行 `sessions.preview` / `chat.history`

事件侧会订阅并打印这些 Gateway event：

- `connect.challenge`
- `agent`
- `chat`
- `presence`
- `tick`
- `health`
- `heartbeat`
- `cron`

事件 smoke 的策略是“只监听不判定”：

- 观察到事件就打印首个原始 frame 和计数
- 没观察到就打印 `not observed during smoke window`
- 不会因为某个事件没出现而让整次 smoke 失败

常用参数：

- `--password <value>`：改用 password 鉴权
- `--scopes operator.admin`：显式覆盖 scopes
- `--timeout-ms 30000`：调整被动事件观察窗口，默认值也是 `30000`
- `--allow-insecure-ws`：允许连接远程明文 `ws://`
  - 只建议测试环境使用；默认仍然拒绝非 loopback 的明文 `ws://`

查看帮助：

```bash
cd intentos/packages/openclaw-gateway-client
pnpm run smoke -- --help
```

## 原始 WS 监听

如果你只是想看 Gateway WebSocket 的原始往返帧，而不是跑 smoke，可以直接启动
raw monitor：

```bash
cd intentos/packages/openclaw-gateway-client
pnpm run monitor:raw
```

它会：

- 自动读取 `intentos/.env`
- 建连并完成 `connect.challenge -> connect`
- 默认声明 `caps: ["tool-events"]`
- 把入站/出站原始字符串逐条写入一个日志文件
- 一直持续监听，直到你手动结束

常用参数：

- `--out ./tmp/gateway-raw.log`
- `--events agent,chat`
- `--chat "hello from raw monitor" --session-key agent:main:main`
- `--device-identity-path ./tmp/device.json`
- `--allow-insecure-ws`

如果你想观察 `stream: "tool"` 的 agent 事件，建议配合 `--chat` 一起用。仅仅带上
`tool-events` capability 还不够，服务端只会把工具事件发给参与了对应 run 注册流程的连接。

例如，只保留 `agent` 和 `chat` 两类入站事件，同时主动发一次 chat：

```bash
cd intentos/packages/openclaw-gateway-client
pnpm run monitor:raw -- \
  --events agent,chat \
  --chat "please use a tool if helpful" \
  --session-key agent:main:main
```

文件默认写到 `intentos/.artifacts/logs/` 下。
