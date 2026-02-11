# 阶段提交与测试门禁

## 规则
1. 每个阶段必须先通过对应测试，再允许 commit。
2. 每个阶段单独 commit，确保可回滚。
3. 允许通过 `git worktree` 开分支并行开发，再合并回主线。

## 阶段定义

### Phase 1 - 核心骨架
- 范围：Rust workspace + 领域模型 + 服务层基础逻辑
- 门禁测试：`cargo test --workspace`

### Phase 2 - CSV 持久化与重启恢复
- 范围：CSV 仓储、原子写、跨重启 mark 链条恢复
- 门禁测试：
  - `cargo test --workspace persistence::tests::`
  - `cargo test --workspace restart::tests::`

### Phase 3 - 命令层与联调
- 范围：命令契约、错误码映射、前端调用约定
- 门禁测试：`cargo test --workspace command::tests::`
