# T03 - Rust 服务层与 Tauri Commands

- 状态：IN_PROGRESS
- 负责人：Agent A
- 依赖：T01, T02

## 目标
实现服务层接口与命令层契约，覆盖 Timer/Mark/Todo 核心动作。

## 输入
- `PRD.md` 第 4 / 6 / 9.2 / 9.3 节

## 输出
- 命令接口清单
- 错误码清单
- 服务层职责边界

## DoD
1. 支持 Timer CRUD + 归档。
2. 支持 Mark 新增并自动计算 `prev_marked_at` 与 `duration_minutes`。
3. 支持 Todo CRUD + 状态更新 + mark 引用。
4. 命令返回结构化错误。

## 子任务
- [ ] 设计 command payload/response
- [ ] 设计 service/repo 分层
- [ ] 定义错误码与错误映射
