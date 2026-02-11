# T05 - Mark 记录流与历史视图

- 状态：TODO
- 负责人：Agent C
- 依赖：T03, T04

## 目标
实现 mark 输入、提交、历史展示及与上一条 mark 的间隔计算呈现。

## 输入
- `PRD.md` 第 4.2 / 6.2 / 10 节

## 输出
- Mark 编辑器
- Mark 历史列表
- 提交反馈与错误提示

## DoD
1. 提交 mark 时可自动关联当前 timer。
2. 提交后历史列表立即刷新。
3. 可视化展示 `prev_marked_at` 与 `duration_minutes`。
