# Agent B 产出：CSV 持久化与恢复策略 v0

## 原子写流程
1. 读取现有数据并合并变更。
2. 写入同目录临时文件（`.tmp`）。
3. flush + fsync。
4. 原子 rename 覆盖目标 CSV。

## 恢复规则
- 启动时对每个 `timer_id` 扫描 `marks.csv`，提取最新 `marked_at`。
- 作为下一次 `mark_create` 的 `prev_marked_at` 来源。

## CSV 规则
- 编码：UTF-8
- 首行固定表头
- 空值：空字符串
- `todo_ids`：`;` 分隔

## 校验
- 缺失关键列时返回 `E_CSV_PARSE` 并提示恢复建议。
