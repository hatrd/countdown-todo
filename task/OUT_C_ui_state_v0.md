# Agent C 产出：UI 状态模型草案 v0

## 顶层状态
- `selectedTimerId: string | null`
- `timers: TimerView[]`
- `marks: MarkView[]`
- `todos: TodoView[]`
- `markDraft: string`
- `insertedTodoIds: string[]`

## 刷新策略
- 倒计时分钟数：前端定时刷新（建议 1s tick + 分钟显示取整）。
- 数据列表：在命令成功后主动刷新。

## 交互约束
- 未选中 timer 禁止 `Mark Now`。
- 执行 `Mark Now` 成功后：清空 `markDraft`、刷新 marks。
- todo 插入时：追加文本并记录 `insertedTodoIds`。
