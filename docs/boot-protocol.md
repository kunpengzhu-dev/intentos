## Boot Integration

目标：你的脚本执行真实 boot 过程，并把进度回调给 IntentOS server。

### 你需要做什么

你的脚本需要：

1. 接收以下环境变量
- `BOOT_TOKEN`
- `BOOT_CALLBACK_URL`

2. 在 boot 过程中回调以下 HTTP 接口
- `POST /internal/boot/steps`
- `POST /internal/boot/step`
- `POST /internal/boot/completed`
- `POST /internal/boot/failed`

3. 请求头带上

```http
Authorization: Bearer <BOOT_TOKEN>
Content-Type: application/json
```

### 回调地址

你的脚本会收到：

- `BOOT_CALLBACK_URL`

例如：

```text
http://127.0.0.1:3001
```

实际请求地址为：

- `${BOOT_CALLBACK_URL}/internal/boot/steps`
- `${BOOT_CALLBACK_URL}/internal/boot/step`
- `${BOOT_CALLBACK_URL}/internal/boot/completed`
- `${BOOT_CALLBACK_URL}/internal/boot/failed`

### 1. 上报步骤定义

```http
POST /internal/boot/steps
```

请求体示例：

```json
{
  "steps": [
    { "id": "server_ready", "label": "Server", "weight": 1 },
    { "id": "storage_ready", "label": "Storage", "weight": 1 },
    { "id": "agent_ready", "label": "AI Agent", "weight": 2 }
  ]
}
```

说明：

- 这一步必须先调用
- server 收到 `steps` 后，才会向前端返回 `boot/start ACK`
- 后续 `stepId` 必须来自这里定义的 `steps`

### 2. 上报步骤进度

```http
POST /internal/boot/step
```

```json
{
  "stepId": "server_ready",
  "state": "running",
  "message": "Server is starting",
  "updatedAt": "2026-03-06T10:00:00.000Z"
}
```

字段：

- `stepId`: 当前步骤 ID
- `state`: `pending` | `running` | `ok` | `failed`
- `message`: 可选，当前阶段文案
- `error`: 可选，仅失败时传
- `updatedAt`: ISO 时间字符串

成功响应：

```json
{ "accepted": true }
```

### 3. 上报完成

```http
POST /internal/boot/completed
```

```json
{
  "completedAt": "2026-03-06T10:00:05.000Z"
}
```

成功响应：

```json
{ "accepted": true }
```

注意：

- 只有所有步骤都已经是 `ok` 时，这个请求才会被接受

### 4. 上报失败

```http
POST /internal/boot/failed
```

```json
{
  "stepId": "agent_ready",
  "reason": "Agent bootstrap failed",
  "failedAt": "2026-03-06T10:00:03.000Z"
}
```

字段：

- `stepId`: 可选，失败发生在哪一步
- `reason`: 失败原因
- `failedAt`: ISO 时间字符串

成功响应：

```json
{ "accepted": true }
```

### 什么时候会被拒绝

server 会返回：

```json
{ "accepted": false }
```

常见原因：

- `BOOT_TOKEN` 无效或过期
- `stepId` 不存在
- 没有先调用 `/internal/boot/steps`
- boot 已经完成或失败
- 在所有步骤未完成前调用了 `completed`

### 最小流程

1. 读取 `BOOT_TOKEN`
2. 读取 `BOOT_CALLBACK_URL`
3. 先调用 `steps`
4. 按步骤回调 `step`
5. 成功时回调 `completed`
6. 失败时回调 `failed`

### 示例

```text
POST /internal/boot/steps
POST /internal/boot/step      server_ready running
POST /internal/boot/step      server_ready ok
POST /internal/boot/step      storage_ready running
POST /internal/boot/step      storage_ready ok
POST /internal/boot/step      agent_ready running
POST /internal/boot/step      agent_ready ok
POST /internal/boot/completed
```
