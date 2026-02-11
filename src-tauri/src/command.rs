use crate::model::{EpochMinutes, Mark, Timer, Todo, TodoStatus};
use crate::{AppError, AppService, Store};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Envelope<T> {
    pub ok: bool,
    pub data: Option<T>,
    pub error: Option<CommandError>,
}

impl<T> Envelope<T> {
    fn success(data: T) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    fn failure(error: AppError) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(map_error(error)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateTimerCommand {
    pub name: String,
    pub target_at_minute: EpochMinutes,
    pub now_minute: EpochMinutes,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateTimerCommand {
    pub timer_id: String,
    pub name: String,
    pub target_at_minute: EpochMinutes,
    pub now_minute: EpochMinutes,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArchiveTimerCommand {
    pub timer_id: String,
    pub now_minute: EpochMinutes,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateTodoCommand {
    pub timer_id: String,
    pub title: String,
    pub now_minute: EpochMinutes,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateTodoStatusCommand {
    pub todo_id: String,
    pub status: TodoStatus,
    pub now_minute: EpochMinutes,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateMarkCommand {
    pub timer_id: String,
    pub marked_at_minute: EpochMinutes,
    pub description: String,
    pub todo_ids: Vec<String>,
}

pub struct CommandApi<S: Store> {
    service: AppService<S>,
}

impl<S: Store> CommandApi<S> {
    pub fn new(service: AppService<S>) -> Self {
        Self { service }
    }

    pub fn timer_create(&mut self, request: CreateTimerCommand) -> Envelope<Timer> {
        match self
            .service
            .create_timer(request.name, request.target_at_minute, request.now_minute)
        {
            Ok(timer) => Envelope::success(timer),
            Err(error) => Envelope::failure(error),
        }
    }

    pub fn timer_update(&mut self, request: UpdateTimerCommand) -> Envelope<Timer> {
        match self.service.update_timer(
            &request.timer_id,
            request.name,
            request.target_at_minute,
            request.now_minute,
        ) {
            Ok(timer) => Envelope::success(timer),
            Err(error) => Envelope::failure(error),
        }
    }

    pub fn timer_archive(&mut self, request: ArchiveTimerCommand) -> Envelope<Timer> {
        match self
            .service
            .archive_timer(&request.timer_id, request.now_minute)
        {
            Ok(timer) => Envelope::success(timer),
            Err(error) => Envelope::failure(error),
        }
    }

    pub fn timer_list(&self, include_archived: bool) -> Envelope<Vec<Timer>> {
        Envelope::success(self.service.list_timers(include_archived))
    }

    pub fn todo_create(&mut self, request: CreateTodoCommand) -> Envelope<Todo> {
        match self
            .service
            .create_todo(&request.timer_id, request.title, request.now_minute)
        {
            Ok(todo) => Envelope::success(todo),
            Err(error) => Envelope::failure(error),
        }
    }

    pub fn todo_update_status(&mut self, request: UpdateTodoStatusCommand) -> Envelope<Todo> {
        match self
            .service
            .set_todo_status(&request.todo_id, request.status, request.now_minute)
        {
            Ok(todo) => Envelope::success(todo),
            Err(error) => Envelope::failure(error),
        }
    }

    pub fn todo_list_by_timer(&self, timer_id: &str) -> Envelope<Vec<Todo>> {
        match self.service.list_todos_by_timer(timer_id) {
            Ok(todos) => Envelope::success(todos),
            Err(error) => Envelope::failure(error),
        }
    }

    pub fn mark_create(&mut self, request: CreateMarkCommand) -> Envelope<Mark> {
        match self.service.create_mark(
            &request.timer_id,
            request.marked_at_minute,
            request.description,
            request.todo_ids,
        ) {
            Ok(mark) => Envelope::success(mark),
            Err(error) => Envelope::failure(error),
        }
    }

    pub fn mark_list_by_timer(&self, timer_id: &str) -> Envelope<Vec<Mark>> {
        match self.service.list_marks_by_timer(timer_id) {
            Ok(marks) => Envelope::success(marks),
            Err(error) => Envelope::failure(error),
        }
    }
}

fn map_error(error: AppError) -> CommandError {
    match error {
        AppError::Validation(message) => CommandError {
            code: "E_VALIDATION",
            message,
            detail: None,
        },
        AppError::NotFound(message) => CommandError {
            code: "E_NOT_FOUND",
            message,
            detail: None,
        },
        AppError::Conflict(message) => CommandError {
            code: "E_CONFLICT",
            message,
            detail: None,
        },
        AppError::Internal(message) if message.contains("csv") => CommandError {
            code: "E_CSV_PARSE",
            message,
            detail: None,
        },
        AppError::Internal(message) if message.contains("read") || message.contains("write") => {
            CommandError {
                code: "E_IO",
                message,
                detail: None,
            }
        }
        AppError::Internal(message) => CommandError {
            code: "E_INTERNAL",
            message,
            detail: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use crate::command::{
        ArchiveTimerCommand, CommandApi, CreateMarkCommand, CreateTimerCommand, CreateTodoCommand,
    };
    use crate::repository::InMemoryStore;
    use crate::service::AppService;

    #[test]
    fn tests_returns_success_envelope_for_timer_create() {
        let service = AppService::new(InMemoryStore::default());
        let mut command_api = CommandApi::new(service);

        let response = command_api.timer_create(CreateTimerCommand {
            name: "phase3".to_string(),
            target_at_minute: 300,
            now_minute: 100,
        });

        assert!(response.ok);
        assert!(response.error.is_none());
        assert_eq!(response.data.expect("data should exist").name, "phase3");
    }

    #[test]
    fn tests_maps_not_found_for_mark_create() {
        let service = AppService::new(InMemoryStore::default());
        let mut command_api = CommandApi::new(service);

        let response = command_api.mark_create(CreateMarkCommand {
            timer_id: "missing".to_string(),
            marked_at_minute: 100,
            description: "orphan mark".to_string(),
            todo_ids: vec![],
        });

        assert!(!response.ok);
        let error = response.error.expect("error should exist");
        assert_eq!(error.code, "E_NOT_FOUND");
    }

    #[test]
    fn tests_maps_validation_error_for_empty_timer_name() {
        let service = AppService::new(InMemoryStore::default());
        let mut command_api = CommandApi::new(service);

        let response = command_api.timer_create(CreateTimerCommand {
            name: "  ".to_string(),
            target_at_minute: 200,
            now_minute: 100,
        });

        assert!(!response.ok);
        let error = response.error.expect("error should exist");
        assert_eq!(error.code, "E_VALIDATION");
    }

    #[test]
    fn tests_drives_todo_and_archive_flow() {
        let service = AppService::new(InMemoryStore::default());
        let mut command_api = CommandApi::new(service);

        let timer = command_api
            .timer_create(CreateTimerCommand {
                name: "flow".to_string(),
                target_at_minute: 500,
                now_minute: 100,
            })
            .data
            .expect("timer should exist");

        let todo_response = command_api.todo_create(CreateTodoCommand {
            timer_id: timer.id.clone(),
            title: "link todo".to_string(),
            now_minute: 110,
        });
        assert!(todo_response.ok);

        let archive_response = command_api.timer_archive(ArchiveTimerCommand {
            timer_id: timer.id,
            now_minute: 120,
        });
        assert!(archive_response.ok);
    }
}
