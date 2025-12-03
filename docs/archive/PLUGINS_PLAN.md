# 插件通信规划（草案）

## 背景与目标
- 支持跨进程插件（含 Rust 等多语言），通过 JSON-RPC 2.0 + stdin/stdout 通道与主进程交互。
- 现有核心代码保持“事件驱动”解耦：所有业务交互从事件总线分发至插件；插件返回的 API 注册信息集中由主进程暴露。
- 运行期隔离：插件崩溃/超时不影响主流程，日志与错误可追踪。

## 通信协议与传输
- 协议：JSON-RPC 2.0，字段 `jsonrpc: "2.0"`, `method`, `params`, `id`，响应用 `result` 或 `error`。
- 错误码：沿用标准（-32700 解析错误，-32600 无效请求，-32601 方法未找到，-32602 无效参数，-32603 内部错误），业务自定义用正整数。
- 通道：stdin/stdout，采用 LSP 同款 framing：`Content-Length: <len>\r\n\r\n<body>`，UTF-8。
- 消息类型：
  - 请求/响应：主进程调用插件方法（有 `id`）。
  - 通知：主进程向插件推送事件（无 `id`）；插件一般无需回包。
  - 可选反向请求：插件调用主进程方法（需在握手声明支持），默认关闭。

## 插件生命周期与握手
- 配置驱动启动：启动时读取插件配置（路径/命令/环境变量/超时/重试上限）。
- 启动：spawn 子进程，设置 stdin/stdout/stderr 管道。
- 握手（超时时间建议 3-5s，失败则标记插件不可用但不影响主流程）：
  - 主进程调用 `plugin/handshake`，参数：`{ name, version, supportsReverseRpc?: boolean }`（由主进程告知期望）。
  - 插件返回元数据：`{ name, version, capabilities: [...], routes?: [...], events?: [...], reverseRpc?: boolean }`。
- 健康检查：可选定期调用 `plugin/health`（请求），或依靠进程存活与 stderr 心跳。
- 停止：主进程在退出或热重载时调用 `plugin/shutdown`（通知或请求），然后发送 SIGTERM，超时后 SIGKILL。

## 事件分发与订阅
- 主进程事件来源：EventBus（如 SyncStarted/SyncCompleted/SyncFailed 等）。
- 适配器订阅总线，将事件作为 JSON-RPC 通知发送：`{ method: "plugin/onEvent", params: { eventType, payload, metadata, timestamp } }`。
- 订阅范围：默认广播给所有插件；未来可按配置过滤事件类型。
- 超时与隔离：事件通知不等待插件回包；如需确认，可由插件主动回送 `plugin/ackEvent` 请求（可选）。

## API 注册与路由暴露
- 插件在握手或初始化阶段返回路由声明：`routes: [{ path, method, description, auth?: boolean, schema?: object }]`。
- 主进程将插件路由挂载在统一前缀：`/api/plugins/<pluginName>/...`，由主进程注册 handler 并通过 RPC 调用插件对应方法。
- RPC 映射：约定 `method` 字段与路由关联，如 `plugin/handleRequest`，`params` 包含 HTTP 请求上下文（path, method, headers, query, body）。
- 安全：路由前缀隔离；可按需在主进程层做鉴权/速率限制。

## 日志收集与隔离
- 子进程 stderr 视为插件日志流：逐行读取，封装成主日志输出，附加字段 `{ plugin: name, pid }`。
- 速率限制：简单阈值（如每秒 N 行）防止刷屏，超限时聚合提示。
- 严格避免将用户敏感信息写入主日志，可配置过滤器。

## 配置与安全
- 插件配置独立：命令、工作目录、环境变量、超时/重试、事件订阅过滤、是否允许反向 RPC。
- 主进程不向插件下发敏感凭据，除非显式配置；可使用受限 token。
- 路径/命令需白名单或位于可信目录，避免任意执行。
- 建议的配置格式（示例，JSON 或 YAML）：
  ```json
  {
    "plugins": [
      {
        "name": "backup-plugin",
        "command": "/opt/plugins/backup-plugin",
        "args": ["--config", "/etc/backup-plugin/config.toml"],
        "cwd": "/opt/plugins/backup-plugin",
        "env": {
          "LOG_LEVEL": "info",
          "PLUGIN_TOKEN": "placeholder"
        },
        "restart": {
          "enabled": true,
          "maxRetries": 3,
          "backoffMs": 2000
        },
        "rpcTimeoutMs": 5000,
        "handshakeTimeoutMs": 5000,
        "shutdownTimeoutMs": 3000,
        "events": {
          "include": ["SyncStarted", "SyncCompleted"],
          "exclude": []
        },
        "allowReverseRpc": false,
        "routePrefix": "/api/plugins/backup",
        "enabled": true
      }
    ]
  }
  ```
  - `events.include/exclude`：过滤订阅事件；两者同时存在时，先应用 exclude，再 include（或按实现约定明确优先级）。
  - `restart`：崩溃重启控制；`backoffMs` 支持线性或指数策略（可在实现中扩展）。
  - `rpcTimeoutMs`/`handshakeTimeoutMs`/`shutdownTimeoutMs`：不同阶段的超时。
  - `allowReverseRpc`：是否允许插件向主进程发请求；默认 false。
  - `routePrefix`：插件路由挂载前缀，缺省可用 `/api/plugins/<name>`。
  - `env`：仅注入插件需要的最小环境变量，避免泄露主系统敏感信息。

## 异常与重试策略
- 启动失败：标记不可用并报警，不影响其他插件。
- 运行中断（进程退出）：记录事件，按配置决定是否重启（带重试间隔与上限）。
- RPC 请求超时：返回超时错误给调用方（例如路由代理），不会阻塞主流程。
- 事件通知失败：记录并丢弃，不阻塞事件总线；可选重试队列。

## 实施步骤（里程碑）
1) 文档与协议固化：确认以上 JSON-RPC + Content-Length 规范、方法名、路由声明格式与错误码约定。
2) Node 侧基础设施：
   - 插件配置读取。
   - 进程管理器（spawn/监控/重启/关闭）+ JSON-RPC stdin/stdout 客户端（framing）。
   - stderr -> 主日志转发。
   - 当前步骤概述（本轮执行）：优先实现进程管理 + JSON-RPC framing 客户端的基础骨架，并接好配置读取入口，先落地最小 happy path，保持可扩展监控/重启留空。
3) 事件适配：EventBus 订阅器，将事件广播为 `plugin/onEvent` 通知。
4) 路由桥接：支持插件返回路由声明，主进程在 `/api/plugins/<plugin>` 注册并转发 RPC。
5) 健康/握手：实现 `plugin/handshake` 和可选 `plugin/health`，启动时握手、退出时 shutdown。
6) 示例插件：提供最小 Node/Rust 示例（回显握手、打印事件、注册 1 个简单路由）验证链路。
7) 强化：过滤订阅、速率限制、鉴权、反向 RPC（若需要）、监控指标。
