# Agent A 产出：Command 契约草案 v0

## 命令命名
- `timer_create`
- `timer_list`
- `timer_update`
- `timer_archive`
- `mark_create`
- `mark_list_by_timer`
- `todo_create`
- `todo_list_by_timer`
- `todo_update_status`

## 返回结构（统一）
```text
{ ok: true, data: ... }
{ ok: false, error: { code, message, detail? } }
```

## 错误码草案
- `E_IO`
- `E_CSV_PARSE`
- `E_VALIDATION`
- `E_NOT_FOUND`
- `E_CONFLICT`
- `E_INTERNAL`

## 关键约束
- `mark_create` 必须在服务层内部计算 `prev_marked_at` 与 `duration_minutes`。
- `mark_create` 写入成功后才返回 `ok: true`。
