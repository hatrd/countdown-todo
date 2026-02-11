use std::collections::HashMap;

use crate::error::AppResult;
use crate::model::{Mark, Timer, Todo};

pub trait Store {
    fn save_timer(&mut self, timer: Timer) -> AppResult<()>;
    fn get_timer(&self, timer_id: &str) -> Option<Timer>;
    fn list_timers(&self, include_archived: bool) -> Vec<Timer>;

    fn save_todo(&mut self, todo: Todo) -> AppResult<()>;
    fn get_todo(&self, todo_id: &str) -> Option<Todo>;
    fn list_todos_by_timer(&self, timer_id: &str) -> Vec<Todo>;

    fn append_mark(&mut self, mark: Mark) -> AppResult<()>;
    fn list_marks_by_timer(&self, timer_id: &str) -> Vec<Mark>;
}

#[derive(Debug, Default)]
pub struct InMemoryStore {
    timers: HashMap<String, Timer>,
    todos: HashMap<String, Todo>,
    marks_by_timer: HashMap<String, Vec<Mark>>,
}

impl Store for InMemoryStore {
    fn save_timer(&mut self, timer: Timer) -> AppResult<()> {
        self.timers.insert(timer.id.clone(), timer);
        Ok(())
    }

    fn get_timer(&self, timer_id: &str) -> Option<Timer> {
        self.timers.get(timer_id).cloned()
    }

    fn list_timers(&self, include_archived: bool) -> Vec<Timer> {
        let mut timers: Vec<Timer> = self
            .timers
            .values()
            .filter(|timer| include_archived || !timer.archived)
            .cloned()
            .collect();
        timers.sort_by_key(|timer| timer.target_at_minute);
        timers
    }

    fn save_todo(&mut self, todo: Todo) -> AppResult<()> {
        self.todos.insert(todo.id.clone(), todo);
        Ok(())
    }

    fn get_todo(&self, todo_id: &str) -> Option<Todo> {
        self.todos.get(todo_id).cloned()
    }

    fn list_todos_by_timer(&self, timer_id: &str) -> Vec<Todo> {
        let mut todos: Vec<Todo> = self
            .todos
            .values()
            .filter(|todo| todo.timer_id == timer_id)
            .cloned()
            .collect();
        todos.sort_by_key(|todo| todo.created_at_minute);
        todos
    }

    fn append_mark(&mut self, mark: Mark) -> AppResult<()> {
        self.marks_by_timer
            .entry(mark.timer_id.clone())
            .or_default()
            .push(mark);
        Ok(())
    }

    fn list_marks_by_timer(&self, timer_id: &str) -> Vec<Mark> {
        let mut marks = self
            .marks_by_timer
            .get(timer_id)
            .cloned()
            .unwrap_or_default();
        marks.sort_by_key(|mark| mark.marked_at_minute);
        marks
    }
}
