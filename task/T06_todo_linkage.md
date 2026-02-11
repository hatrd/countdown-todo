# T06 - Todo 管理与 Mark 联动

- 状态：DONE
- 负责人：Agent C
- 依赖：T03, T04

## 目标
实现 todo 面板、状态切换，并支持一键插入 mark 描述与引用保存。

## 输入
- `PRD.md` 第 4.3 / 6.3 / 10 节

## 输出
- Todo 列表与编辑区
- 插入到 mark 描述能力
- mark 的 `todo_ids` 引用链

## DoD
1. todo 可创建/更新状态。
2. 多个 todo 可插入同一条 mark 描述。
3. 提交 mark 后 `todo_ids` 正确落盘。
