# T02 - 领域模型与 CSV 契约

- 状态：IN_PROGRESS
- 负责人：Agent B
- 依赖：无

## 目标
固化 Timer/Mark/Todo 的结构化模型、CSV 表头、字段校验和原子写入规则。

## 输入
- `PRD.md` 第 4.4 / 5 / 8.2 节

## 输出
- 模型字段约束文档
- CSV 读写规范
- 重启恢复策略说明

## DoD
1. 三个 CSV 文件表头固定且带版本兼容策略。
2. 写入流程明确：临时文件 + fsync + rename。
3. 明确 `mark` 重启恢复：按 `timer_id` 获取最后一条 `marked_at`。

## 子任务
- [ ] 定义 timers/marks/todos 字段约束
- [ ] 定义 CSV 转义与空值编码规则
- [ ] 定义原子写与故障恢复策略
