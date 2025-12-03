# Plugin System

## Objectives
- 将备份、AI 等附加能力插件化，降低对核心同步流程的侵入；支持按需启用/隔离。

## Lifecycle & Protocol
- 插件作为独立进程，通过 JSON-RPC 2.0 + stdin/stdout（LSP 风格 Content-Length framing）与主进程通信。
- 典型生命周期：spawn → handshake（声明能力/路由）→ 运行期事件订阅 → shutdown（通知 + SIGTERM，超时后 SIGKILL）。

## Event Model
- 主进程事件总线广播关键事件（`sync:start/end`, `note:upsert/delete` 等）为 RPC 通知 `plugin/onEvent`。
- 订阅范围可按配置过滤；通知默认不等待回包，必要时插件可主动 ack。

## HTTP Exposure
- 插件在握手返回路由声明，由主进程挂载至 `/api/plugins/<name>/...`，主进程代理 HTTP → RPC 调用插件。
- 默认不向插件透传敏感凭据；可配置最小化 env，前置反代做鉴权/限流。

## Roadmap
- 第一阶段：进程管理 + RPC framing + 事件广播最小闭环，提供示例插件。
- 后续：重试/速率限制、反向 RPC、监控指标、订阅过滤、崩溃重启策略。
