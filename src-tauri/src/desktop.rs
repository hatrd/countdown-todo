use std::path::PathBuf;

use parking_lot::Mutex;
use tauri::Manager;

use countdown_todo_core::command::{
    ArchiveTimerCommand, CommandApi, CreateMarkCommand, CreateTimerCommand, CreateTodoCommand,
    Envelope, UpdateTimerCommand, UpdateTodoStatusCommand,
};
use countdown_todo_core::model::{Mark, Timer, Todo, TodoStatus};
use countdown_todo_core::repository::CsvStore;
use countdown_todo_core::service::AppService;

struct DesktopState {
    api: Mutex<CommandApi<CsvStore>>,
}

#[tauri::command]
fn timer_create(
    state: tauri::State<'_, DesktopState>,
    name: String,
    target_at_minute: i64,
    now_minute: i64,
) -> Envelope<Timer> {
    state.api.lock().timer_create(CreateTimerCommand {
        name,
        target_at_minute,
        now_minute,
    })
}

#[tauri::command]
fn timer_list(
    state: tauri::State<'_, DesktopState>,
    include_archived: bool,
) -> Envelope<Vec<Timer>> {
    state.api.lock().timer_list(include_archived)
}

#[tauri::command]
fn timer_update(
    state: tauri::State<'_, DesktopState>,
    timer_id: String,
    name: String,
    target_at_minute: i64,
    now_minute: i64,
) -> Envelope<Timer> {
    state.api.lock().timer_update(UpdateTimerCommand {
        timer_id,
        name,
        target_at_minute,
        now_minute,
    })
}

#[tauri::command]
fn timer_archive(
    state: tauri::State<'_, DesktopState>,
    timer_id: String,
    now_minute: i64,
) -> Envelope<Timer> {
    state.api.lock().timer_archive(ArchiveTimerCommand {
        timer_id,
        now_minute,
    })
}

#[tauri::command]
fn todo_create(
    state: tauri::State<'_, DesktopState>,
    timer_id: String,
    title: String,
    now_minute: i64,
) -> Envelope<Todo> {
    state.api.lock().todo_create(CreateTodoCommand {
        timer_id,
        title,
        now_minute,
    })
}

#[tauri::command]
fn todo_list_by_timer(
    state: tauri::State<'_, DesktopState>,
    timer_id: String,
) -> Envelope<Vec<Todo>> {
    state.api.lock().todo_list_by_timer(&timer_id)
}

#[tauri::command]
fn todo_update_status(
    state: tauri::State<'_, DesktopState>,
    todo_id: String,
    status: String,
    now_minute: i64,
) -> Envelope<Todo> {
    let Some(parsed_status) = TodoStatus::from_str(&status) else {
        return Envelope {
            ok: false,
            data: None,
            error: Some(countdown_todo_core::command::CommandError {
                code: "E_VALIDATION",
                message: format!("unsupported todo status: {status}"),
                detail: None,
            }),
        };
    };

    state
        .api
        .lock()
        .todo_update_status(UpdateTodoStatusCommand {
            todo_id,
            status: parsed_status,
            now_minute,
        })
}

#[tauri::command]
fn mark_create(
    state: tauri::State<'_, DesktopState>,
    timer_id: String,
    marked_at_minute: i64,
    description: String,
    todo_ids: Vec<String>,
) -> Envelope<Mark> {
    state.api.lock().mark_create(CreateMarkCommand {
        timer_id,
        marked_at_minute,
        description,
        todo_ids,
    })
}

#[tauri::command]
fn mark_list_by_timer(
    state: tauri::State<'_, DesktopState>,
    timer_id: String,
) -> Envelope<Vec<Mark>> {
    state.api.lock().mark_list_by_timer(&timer_id)
}

fn resolve_data_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    if let Some(custom_path) = std::env::var_os("COUNTDOWN_TODO_DATA_DIR") {
        return PathBuf::from(custom_path);
    }

    if let Some(app_data_dir) = app_handle.path_resolver().app_data_dir() {
        return app_data_dir.join("countdown-todo");
    }

    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("data")
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = resolve_data_dir(&app.handle());
            let store = CsvStore::new(&data_dir)
                .map_err(|error: countdown_todo_core::AppError| error.to_string())?;
            let service = AppService::new(store);
            let api = CommandApi::new(service);

            app.manage(DesktopState {
                api: Mutex::new(api),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            timer_create,
            timer_list,
            timer_update,
            timer_archive,
            todo_create,
            todo_list_by_timer,
            todo_update_status,
            mark_create,
            mark_list_by_timer
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Countdown Todo desktop app");
}
