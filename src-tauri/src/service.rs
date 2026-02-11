use std::sync::atomic::{AtomicU64, Ordering};

use crate::error::{AppError, AppResult};
use crate::model::{EpochMinutes, Mark, Timer, Todo, TodoStatus};
use crate::repository::Store;

#[derive(Debug)]
struct IdGenerator {
    sequence: AtomicU64,
}

impl Default for IdGenerator {
    fn default() -> Self {
        Self {
            sequence: AtomicU64::new(1),
        }
    }
}

impl IdGenerator {
    fn next(&self, prefix: &str) -> String {
        let number = self.sequence.fetch_add(1, Ordering::SeqCst);
        format!("{prefix}-{number}")
    }
}

pub struct AppService<S: Store> {
    store: S,
    ids: IdGenerator,
}

impl<S: Store> AppService<S> {
    pub fn new(store: S) -> Self {
        Self {
            store,
            ids: IdGenerator::default(),
        }
    }

    pub fn into_store(self) -> S {
        self.store
    }

    pub fn create_timer(
        &mut self,
        name: impl Into<String>,
        target_at_minute: EpochMinutes,
        now_minute: EpochMinutes,
    ) -> AppResult<Timer> {
        let name = name.into().trim().to_string();
        if name.is_empty() {
            return Err(AppError::Validation(
                "timer name cannot be empty".to_string(),
            ));
        }

        let timer = Timer {
            id: self.ids.next("timer"),
            name,
            target_at_minute,
            created_at_minute: now_minute,
            updated_at_minute: now_minute,
            archived: false,
        };

        self.store.save_timer(timer.clone())?;
        Ok(timer)
    }

    pub fn update_timer(
        &mut self,
        timer_id: &str,
        name: impl Into<String>,
        target_at_minute: EpochMinutes,
        now_minute: EpochMinutes,
    ) -> AppResult<Timer> {
        let mut timer = self
            .store
            .get_timer(timer_id)
            .ok_or_else(|| AppError::NotFound(format!("timer {timer_id}")))?;

        let name = name.into().trim().to_string();
        if name.is_empty() {
            return Err(AppError::Validation(
                "timer name cannot be empty".to_string(),
            ));
        }

        timer.name = name;
        timer.target_at_minute = target_at_minute;
        timer.updated_at_minute = now_minute;

        self.store.save_timer(timer.clone())?;
        Ok(timer)
    }

    pub fn archive_timer(&mut self, timer_id: &str, now_minute: EpochMinutes) -> AppResult<Timer> {
        let mut timer = self
            .store
            .get_timer(timer_id)
            .ok_or_else(|| AppError::NotFound(format!("timer {timer_id}")))?;
        timer.archived = true;
        timer.updated_at_minute = now_minute;
        self.store.save_timer(timer.clone())?;
        Ok(timer)
    }

    pub fn list_timers(&self, include_archived: bool) -> Vec<Timer> {
        self.store.list_timers(include_archived)
    }

    pub fn create_todo(
        &mut self,
        timer_id: &str,
        title: impl Into<String>,
        now_minute: EpochMinutes,
    ) -> AppResult<Todo> {
        self.ensure_timer_exists(timer_id)?;

        let title = title.into().trim().to_string();
        if title.is_empty() {
            return Err(AppError::Validation(
                "todo title cannot be empty".to_string(),
            ));
        }

        let todo = Todo {
            id: self.ids.next("todo"),
            timer_id: timer_id.to_string(),
            title,
            status: TodoStatus::Open,
            created_at_minute: now_minute,
            updated_at_minute: now_minute,
            done_at_minute: None,
        };
        self.store.save_todo(todo.clone())?;
        Ok(todo)
    }

    pub fn set_todo_status(
        &mut self,
        todo_id: &str,
        status: TodoStatus,
        now_minute: EpochMinutes,
    ) -> AppResult<Todo> {
        let mut todo = self
            .store
            .get_todo(todo_id)
            .ok_or_else(|| AppError::NotFound(format!("todo {todo_id}")))?;

        todo.status = status;
        todo.updated_at_minute = now_minute;
        todo.done_at_minute = if matches!(todo.status, TodoStatus::Done) {
            Some(now_minute)
        } else {
            None
        };

        self.store.save_todo(todo.clone())?;
        Ok(todo)
    }

    pub fn delete_todo(&mut self, todo_id: &str) -> AppResult<Todo> {
        let todo = self
            .store
            .get_todo(todo_id)
            .ok_or_else(|| AppError::NotFound(format!("todo {todo_id}")))?;

        self.store.delete_todo(todo_id)?;
        Ok(todo)
    }

    pub fn list_todos_by_timer(&self, timer_id: &str) -> AppResult<Vec<Todo>> {
        self.ensure_timer_exists(timer_id)?;
        Ok(self.store.list_todos_by_timer(timer_id))
    }

    pub fn create_mark(
        &mut self,
        timer_id: &str,
        marked_at_minute: EpochMinutes,
        description: impl Into<String>,
        todo_ids: Vec<String>,
    ) -> AppResult<Mark> {
        self.ensure_timer_exists(timer_id)?;

        let previous_mark = self
            .store
            .list_marks_by_timer(timer_id)
            .into_iter()
            .max_by_key(|mark| mark.marked_at_minute);

        let prev_marked_at_minute = previous_mark.as_ref().map(|mark| mark.marked_at_minute);
        let duration_minutes = prev_marked_at_minute.map(|prev| marked_at_minute - prev);

        let mark = Mark {
            id: self.ids.next("mark"),
            timer_id: timer_id.to_string(),
            marked_at_minute,
            prev_marked_at_minute,
            duration_minutes,
            description: description.into(),
            todo_ids,
        };

        self.store.append_mark(mark.clone())?;
        Ok(mark)
    }

    pub fn list_marks_by_timer(&self, timer_id: &str) -> AppResult<Vec<Mark>> {
        self.ensure_timer_exists(timer_id)?;
        Ok(self.store.list_marks_by_timer(timer_id))
    }

    fn ensure_timer_exists(&self, timer_id: &str) -> AppResult<()> {
        if self.store.get_timer(timer_id).is_none() {
            return Err(AppError::NotFound(format!("timer {timer_id}")));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::model::TodoStatus;
    use crate::repository::InMemoryStore;

    use super::AppService;

    #[test]
    fn calculates_timer_remaining_minutes() {
        let mut service = AppService::new(InMemoryStore::default());
        let timer = service
            .create_timer("vacation", 200, 100)
            .expect("timer should be created");

        assert_eq!(timer.remaining_minutes(160), 40);
        assert_eq!(timer.remaining_minutes(250), -50);
    }

    #[test]
    fn creates_mark_chain_with_duration() {
        let mut service = AppService::new(InMemoryStore::default());
        let timer = service
            .create_timer("study", 300, 100)
            .expect("timer should be created");

        let first_mark = service
            .create_mark(&timer.id, 120, "wrote architecture", vec![])
            .expect("first mark should be created");
        assert_eq!(first_mark.prev_marked_at_minute, None);
        assert_eq!(first_mark.duration_minutes, None);

        let second_mark = service
            .create_mark(&timer.id, 170, "built service", vec![])
            .expect("second mark should be created");
        assert_eq!(second_mark.prev_marked_at_minute, Some(120));
        assert_eq!(second_mark.duration_minutes, Some(50));
    }

    #[test]
    fn updates_todo_status_and_done_timestamp() {
        let mut service = AppService::new(InMemoryStore::default());
        let timer = service
            .create_timer("project", 500, 100)
            .expect("timer should be created");

        let todo = service
            .create_todo(&timer.id, "setup commands", 110)
            .expect("todo should be created");
        let done = service
            .set_todo_status(&todo.id, TodoStatus::Done, 120)
            .expect("todo should be completed");

        assert_eq!(done.status, TodoStatus::Done);
        assert_eq!(done.done_at_minute, Some(120));

        let reopened = service
            .set_todo_status(&todo.id, TodoStatus::Open, 130)
            .expect("todo should be reopened");
        assert_eq!(reopened.status, TodoStatus::Open);
        assert_eq!(reopened.done_at_minute, None);
    }

    #[test]
    fn rejects_mark_when_timer_not_found() {
        let mut service = AppService::new(InMemoryStore::default());
        let error = service
            .create_mark("missing-timer", 100, "ignored", vec![])
            .expect_err("mark should fail");
        assert!(error.to_string().contains("missing-timer"));
    }

    #[test]
    fn deletes_todo_and_removes_from_list() {
        let mut service = AppService::new(InMemoryStore::default());
        let timer = service
            .create_timer("project", 500, 100)
            .expect("timer should be created");

        let todo = service
            .create_todo(&timer.id, "cleanup", 110)
            .expect("todo should be created");

        let deleted = service
            .delete_todo(&todo.id)
            .expect("todo should be deleted");
        assert_eq!(deleted.id, todo.id);

        let todos = service
            .list_todos_by_timer(&timer.id)
            .expect("todos should list");
        assert!(todos.is_empty());
    }
}
