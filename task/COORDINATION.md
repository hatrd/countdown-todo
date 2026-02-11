# 多 Agent 协调看板

## 当前指挥
- 总管：Codex（本会话）
- 协调原则：先解耦、后联调；先契约、后实现

## Agent 分工
- Agent A: T01, T03
- Agent B: T02, T07
- Agent C: T04, T05, T06
- Agent D: 验收设计、联调清单、回归门禁

## 当前状态
- Agent A: DONE
- Agent B: DONE
- Agent C: DONE
- Agent D: DONE

## 风险同步
1. `mark` 跨重启连续性是硬约束，所有实现不得破坏 `prev_marked_at` 链条。
2. CSV 写入必须是原子策略，不允许直接覆盖写。
3. UI 刷新节奏不能导致输入卡顿。
