# Agent D 产出：验收门禁 v0

## 阻断级问题（必须修复）
1. 程序重启后 `prev_marked_at` 断链。
2. mark 成功提示但 CSV 未落盘。
3. CSV 损坏后无可读错误反馈。

## 核心验收用例
- 用例 A：新建 timer -> 连续两次 mark，检查 duration。
- 用例 B：第一次 mark 后退出重启，再 mark，检查 `prev_marked_at`。
- 用例 C：todo 插入 mark 描述并验证 `todo_ids`。
- 用例 D：多 timer 并行记录，互不串链。

## 发布前最小清单
- Linux 开发环境通过核心流程
- Windows 运行核心流程
- CSV 文件可被外部脚本解析
