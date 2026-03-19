# intentos backend

这里是 IntentOS 的后端实现说明。  
它不是把 OpenClaw Gateway 方法原样暴露成 HTTP，而是把底层 runtime 翻译成
IntentOS 自己的领域语言：

- `orb`
- `intent`
- `message`

这份 README 的目标不是介绍怎么启动服务，而是帮助你快速读懂代码结构，知道每一层为什么存在。

## 一句话理解这套架构

这套 backend 在做三次转换：

1. OpenClaw protocol
   `openclaw-gateway-client` 和 OpenClaw 通信
2. runtime DTO
   adapter 把 OpenClaw 数据翻成 backend 内部统一 runtime 结构
3. IntentOS domain model
   domain 把 runtime DTO 解释成 Orb、Intent、Message 这些业务对象

最后由 Fastify routes 暴露 HTTP / SSE / Swagger。

## 核心设计原则

### 1. 业务层不直接依赖 OpenClaw

只有 `adapters/openclaw/` 能直接接触：

- `sessions.list`
- `chat.history`
- `chat.send`
- `chat.abort`

`domain/`、`routes/`、`intent-coordinator.ts` 不应该直接依赖 OpenClaw 的原始类型。

### 2. adapter 只做协议翻译

adapter 负责：

- 连上 OpenClaw
- 调用 OpenClaw SDK
- 把 OpenClaw 返回的数据翻成 runtime DTO

adapter 不负责：

- Orb 规则
- Intent 展示规则
- 内部消息过滤规则
- 前端最终看到的领域对象

### 3. domain 只做业务解释

domain 负责：

- 哪个 intent 是 Orb
- 一个 runtime intent 应该显示什么 title/status/capabilities
- 哪些消息对前端可见
- runtime DTO 怎么变成 IntentOS 的 `IntentSummary` / `IntentDetail` / `IntentMessage`

### 4. shared 是契约中心

`packages/shared` 里放两类东西：

- TypeScript 领域类型
- Swagger/OpenAPI schema

backend 不应该再自己维护一份平行的领域 schema。

## 目录结构

```text
apps/backend/
  src/
    adapters/
      openclaw/
        openclaw-intent-runtime-gateway.ts
    config/
      env.ts
    domain/
      errors.ts
      intent-history-projector.ts
      intent-mapper.ts
      intent-message-policy.ts
      intent-stream-projector.ts
      tool-summary.ts
    ports/
      intent-runtime-gateway.ts
    routes/
      frontend.ts
      health.ts
      intents.ts
    app.ts
    intent-coordinator.ts
    server.ts
  tests/
    app.test.ts
    intent-coordinator.test.ts
```

下面按“读代码时最重要的顺序”解释。

## 推荐阅读顺序

如果你第一次读这套 backend，推荐按下面顺序看：

1. `src/ports/intent-runtime-gateway.ts`
2. `src/adapters/openclaw/openclaw-intent-runtime-gateway.ts`
3. `src/domain/intent-message-policy.ts`
4. `src/domain/intent-mapper.ts`
5. `src/domain/intent-history-projector.ts`
6. `src/domain/intent-stream-projector.ts`
7. `src/domain/tool-summary.ts`
8. `src/intent-coordinator.ts`
9. `src/routes/intents.ts`
10. `src/app.ts`
11. `src/server.ts`

这样会比较容易建立全局心智模型。

## 每个目录和文件的作用

### `src/ports/`

这里定义“业务层需要什么能力”，不关心谁来实现。

#### `src/ports/intent-runtime-gateway.ts`

这是 backend 的 runtime port。

它定义了 coordinator 可以依赖的能力，比如：

- `listIntents()`
- `previewIntents()`
- `readIntentMessages()`
- `sendIntentMessage()`
- `resetIntent()`
- `deleteIntent()`

这里还有一套 **runtime DTO**，例如：

- `RuntimeIntentRecord`
- `RuntimeIntentCatalog`
- `RuntimeIntentHistory`
- `RuntimeIntentEvent`
- `RuntimeIntentStreamEvent`

这些 DTO 很重要，它们的定位是：

- 不是 OpenClaw 原始类型
- 也不是前端最终使用的领域对象
- 而是 backend 内部统一的“运行时输入”

你可以把它理解成 backend 的“中间语”。

### `src/adapters/`

这里放具体实现。当前只有 OpenClaw 这一种 runtime。

#### `src/adapters/openclaw/openclaw-intent-runtime-gateway.ts`

这是 `IntentRuntimeGateway` 的 OpenClaw 实现。

职责：

- 用 `openclaw-gateway-client` 连接 OpenClaw
- 调 `sessions.*` / `chat.*`
- 把 OpenClaw 的返回值翻成 runtime DTO

它做的是：

- `GatewaySessionRow -> RuntimeIntentRecord`
- `ChatMessage -> RuntimeIntentMessageRecord`
- `ChatEventPayload -> RuntimeIntentEvent`
- `chat/agent` 原始事件 -> `RuntimeIntentStreamEvent`

它不应该做的是：

- 决定哪个是 Orb
- 决定哪些消息对用户可见
- 决定前端看到的 status/capabilities/placement

这些都属于 domain。

### `src/domain/`

这里是 IntentOS 的业务规则。

#### `src/domain/errors.ts`

定义领域错误。

当前最典型的是：

- `IntentNotFoundError`
- `GatewayConnectionError`

这些错误是 coordinator 和 adapter 的公共语义，不是 Fastify 专属错误。

#### `src/domain/intent-message-policy.ts`

这里定义“哪些 runtime 消息可以进入 IntentOS 领域层”。

例如当前会过滤：

- `OpenClaw runtime context (internal): ...`
- `<<<BEGIN_UNTRUSTED_CHILD_RESULT>>>`

主 session 上的 announce 消息不会在这里被一刀切过滤。现在 session 过滤和流式投影会负责把
真正该显示的通知留下，把子 session 的原始流隔离掉。

这一步为什么放 domain：

- 因为这是 IntentOS 的展示/业务规则
- 不是 OpenClaw 协议规则

OpenClaw 当然可以返回这些消息，但 IntentOS 不一定想给前端看。

#### `src/domain/intent-mapper.ts`

这是 runtime DTO -> IntentOS 领域对象的核心翻译器。

它把：

- `RuntimeIntentRecord`
- `RuntimeIntentPreview`
- `RuntimeIntentMessageRecord`
- `RuntimeIntentEvent`

翻成：

- `IntentSummary`
- `IntentDetail`
- `IntentMessage`
- `IntentEvent`

这里还负责推导业务语义，例如：

- `kind: "orb" | "intent"`
- `placement`
- `status`
- `execution`
- `capabilities`
- `lineage`

所以这个文件本质上是“IntentOS 业务投影器”。

#### `src/domain/intent-stream-projector.ts`

这是流式事件的领域投影器。

它把 adapter 提供的 `RuntimeIntentStreamEvent` 进一步解释成前端更稳定的 IntentOS 流事件：

- 只保留目标 intent/session 的事件
- 按 `runId` 维护流式状态
- 把 `agent lifecycle start` 变成可延迟 flush 的 run 事件
- 保留 `tool phase=start|update|result`
- 抑制 `NO_REPLY` / `NO` 这类静默回复前缀泄漏
- 保留主 session 上的 announce 结果
- 在同一个 `toolCallId` 生命周期里延续统一的 tool summary

#### `src/domain/intent-history-projector.ts`

这是历史消息的领域投影器。

它负责把已经进入 IntentOS 领域层的历史消息，投影成更适合 UI 直接消费的展示分组语义。

当前主要做的是：

- 给历史消息补 `displayGroupId`
- 把只有 `toolCall`、没有正文文本的 assistant follow-up 归到前一个 assistant 展示块
- 把 `toolResult` 通过 `toolCallId` 归到对应的 assistant 展示块

这一步放在 domain，而不是前端，是因为它已经属于 IntentOS 怎样解释一段历史对话的业务规则。

#### `src/domain/tool-summary.ts`

这里负责把工具调用和工具结果，归一化成稳定的摘要语义。

它同时服务两类来源：

- live `agent stream: tool`
- history `chat.history` 里的 `toolCall` / `toolResult`

目标不是保留所有 OpenClaw 原始字段，而是统一产出前端可直接显示的：

- tool name
- success / error 倾向
- 一条简洁 summary

### `src/`

这些文件负责“把 port、adapter、domain 和 route 串起来”。

#### `src/intent-coordinator.ts`

这是 backend 的应用服务层。

它不直接关心 OpenClaw，也不直接关心 Fastify。

它主要负责编排用例，比如：

- `listIntents()`
- `getIntent()`
- `getIntentView()`
- `getIntentMessages()`
- `sendMessage()`
- `resetIntent()`

可以把它理解成：

- route 调 coordinator
- coordinator 调 runtime port
- coordinator 再用 domain mapper 得到最终结果

这里是最接近“业务流程”的地方。

#### `src/config/env.ts`

读取 backend 启动所需配置，例如：

- host/port
- gateway 地址
- token/password
- `INTENTOS_ORB_INTENT_KEY`

这里是配置层，不应该塞业务逻辑。

#### `src/app.ts`

组装整个 Fastify app。

职责：

- 创建默认 coordinator
- 注册 CORS
- 注册 shared 里的 Swagger schemas
- 注册 Swagger/OpenAPI
- 注册 routes
- 注册统一错误处理

可以把它理解成“应用容器”。

#### `src/server.ts`

真正启动 HTTP 服务。

职责很薄：

- 读配置
- 建 app
- `listen()`
- 记录日志

也就是说：

- `app.ts` 负责构建应用
- `server.ts` 负责把应用跑起来

### `src/routes/`

这里是 HTTP 层。

#### `src/routes/health.ts`

系统健康接口：

- `GET /api/health`

#### `src/routes/intents.ts`

IntentOS 核心接口。

例如：

- `GET /api/intents`
- `GET /api/orb`
- `GET /api/intents/:intentKey`
- `GET /api/intents/:intentKey/messages`
- `POST /api/intents/:intentKey/messages`
- `GET /api/intents/:intentKey/events`

routes 的职责应该始终很薄：

- 读 params/query/body
- 调 coordinator
- 返回结果

它不应该包含复杂业务判断。

#### `src/routes/frontend.ts`

这是一个很薄的静态资源托管层，用来直接提供 Orb 的最小聊天页面。

它只是把 `apps/frontend/public/` 挂到 backend 上，方便在同一个服务里验证：

- `/`
- `app.js`
- `styles.css`

## 数据流怎么走

下面用“读一个 intent view”为例说明整个调用链：

1. 前端请求 `GET /api/intents/:intentKey/view`
2. `src/routes/intents.ts` 解析请求并调用 `IntentCoordinator.getIntentView()`
3. `src/intent-coordinator.ts` 调 `IntentRuntimeGateway`
4. `src/adapters/openclaw/openclaw-intent-runtime-gateway.ts` 调 OpenClaw SDK
5. adapter 把 OpenClaw 响应翻成 runtime DTO
6. coordinator 把 runtime DTO 交给 `IntentMapper`
7. `src/domain/intent-mapper.ts` 结合 `intent-message-policy.ts` 生成 `IntentMessage`
8. `src/domain/intent-history-projector.ts` 给历史消息补 UI 更稳定的 `displayGroupId`
9. route 把结果作为 HTTP JSON 返回

这条链里每层只做一件事，所以比较容易维护。

## 现在这套架构里每层回答的问题

可以把每层理解成在回答不同问题：

- `openclaw-gateway-client`
  “怎么和 OpenClaw 通信？”

- `adapters/openclaw`
  “OpenClaw 的数据怎么翻成 backend 的 runtime DTO？”

- `ports`
  “业务层需要 runtime 提供什么能力？”

- `domain`
  “runtime DTO 在 IntentOS 里代表什么业务含义？”

- `intent-history-projector.ts`
  “history 消息应该怎样分组，才能稳定还原成 UI 展示块？”

- `intent-stream-projector.ts`
  “live stream 事件应该怎样投影，才能稳定驱动 UI？”

- `tool-summary.ts`
  “live/history 的 tool 信息怎样统一成前端可直接显示的摘要？”

- `intent-coordinator.ts`
  “一个完整用例应该怎么编排？”

- `routes`
  “这个用例怎么暴露成 HTTP / SSE？”

- `app.ts`
  “整个后端怎么组装起来？”

- `server.ts`
  “服务怎么启动？”

## backend 和 shared 的关系

backend 不是领域契约的唯一来源。

真正的共享契约在：

- `packages/shared/src/intent.ts`
- `packages/shared/src/intent-schema.ts`

也就是：

- 类型在 shared
- Swagger schema 也在 shared
- backend 只消费这些契约

这样做的好处是：

- 前后端共享同一套 IntentOS 模型
- Swagger 不需要在 backend 里再维护一份平行定义

## 测试怎么看

### `tests/intent-coordinator.test.ts`

主要验证业务层：

- Orb 排序
- 消息过滤
- final message 处理
- catalog 读取复用
- stream projector 的投影行为

### `tests/app.test.ts`

主要验证应用装配层：

- 健康接口
- Swagger 文档输出
- view route 序列化后的消息字段

### `tests/intent-history-projector.test.ts`

主要验证历史消息投影：

- assistant 文本 + tool-only follow-up 的分组
- `toolResult` 是否能归到对应展示块
- user turn 是否会正确打断上一轮 assistant 分组

### `tests/openclaw-intent-runtime-gateway.test.ts`

主要验证 OpenClaw history / stream 到 runtime DTO 的协议翻译：

- `toolCall` / `toolResult` 的归一化
- `partialJson` 回退解析
- history tool summary 的初始映射

## 本地运行

```bash
cd intentos
pnpm install
pnpm dev:backend
```

默认监听：

- `127.0.0.1:3030`

文档入口：

- `http://127.0.0.1:3030/docs`
- `http://127.0.0.1:3030/docs/json`

## 校验

```bash
cd intentos
pnpm check:backend
pnpm test:backend
```

## 后续改代码时的经验法则

如果你以后新增逻辑，可以先问自己一句：

- 这是 OpenClaw 专属协议问题吗？
  放 adapter

- 这是 backend 运行时能力接口吗？
  放 port

- 这是 IntentOS 的业务解释规则吗？
  放 domain

- 这是一个完整用例的编排吗？
  放 coordinator

- 这是 HTTP 暴露方式吗？
  放 route

如果按这个规则放文件，代码会一直比较清楚。
