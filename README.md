# Countdown Todo

跨平台（Tauri）倒计时任务工具：
- Timer：按截止时间显示剩余分钟
- Mark：随时记录阶段产出，自动计算与上次 mark 的间隔
- Todo：可插入到 mark 描述，并持久化 todo 引用
- 存储：纯文本 CSV（`timers.csv`/`marks.csv`/`todos.csv`）

## 目录
- `src-tauri/`：Rust 核心 + Tauri 桌面运行层
- `app/`：前端静态页面（HTML/CSS/JS）
- `task/`：任务拆分与执行记录

## 本地开发
### 1) 核心逻辑测试（不依赖 GUI）
```bash
cargo test --workspace
```

### 2) 启动 Tauri 桌面应用
```bash
cargo run -p src-tauri --features desktop --bin src-tauri
```

### 3) 指定数据目录（可选）
```bash
COUNTDOWN_TODO_DATA_DIR=/path/to/data cargo run -p src-tauri --features desktop --bin src-tauri
```

## Linux 桌面依赖（Tauri/WebKit）
若 `desktop` 构建报 `pkg-config` 缺少 `glib/gdk/atk`，请安装对应系统包（示例）：
- Debian/Ubuntu: `libgtk-3-dev libwebkit2gtk-4.0-dev libayatana-appindicator3-dev`
- Fedora: `gtk3-devel webkit2gtk3-devel libappindicator-gtk3-devel`

## 界面模式
- 标准模式：三栏视图（Timer / Mark / Todo）
- 便签模式：顶部快捷栏，支持快速 Mark / 快速 Todo / 一键插入进行中 Todo
- Windows 下桌面应用默认隐藏终端窗口，仅显示图形界面

## CI 产物
- 每次 GitHub Actions `windows-build` 都会上传可下载的便携版 `exe`：`countdown-todo-portable-exe`
- 同时保留安装器工件：`countdown-todo-windows-bundle`（NSIS/MSI）
- 推送 `v*` 标签（例如 `v0.1.1`）时，CI 会自动把便携版发布到 GitHub Release 附件

## 数据文件
启动后会在数据目录生成：
- `timers.csv`
- `marks.csv`
- `todos.csv`

`marks.csv` 支持跨重启连续：重启后新 mark 会正确续接 `prev_marked_at`。
