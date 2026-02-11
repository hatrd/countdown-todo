use std::collections::HashMap;
use std::fs;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::model::{Mark, Timer, Todo, TodoStatus};

const TIMERS_HEADER: &str = "id,name,target_at,created_at,updated_at,archived";
const MARKS_HEADER: &str =
    "id,timer_id,marked_at,prev_marked_at,duration_minutes,description,todo_ids";
const TODOS_HEADER: &str = "id,timer_id,title,status,created_at,updated_at,done_at";

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

#[derive(Debug)]
pub struct CsvStore {
    root: PathBuf,
    timers: HashMap<String, Timer>,
    todos: HashMap<String, Todo>,
    marks_by_timer: HashMap<String, Vec<Mark>>,
}

impl CsvStore {
    pub fn new(root: impl Into<PathBuf>) -> AppResult<Self> {
        let root = root.into();
        fs::create_dir_all(&root).map_err(|error| {
            AppError::Internal(format!("failed to create data directory {root:?}: {error}"))
        })?;

        let timers_path = root.join("timers.csv");
        let marks_path = root.join("marks.csv");
        let todos_path = root.join("todos.csv");

        ensure_csv_file(&timers_path, TIMERS_HEADER)?;
        ensure_csv_file(&marks_path, MARKS_HEADER)?;
        ensure_csv_file(&todos_path, TODOS_HEADER)?;

        let timers = load_timers(&timers_path)?;
        let marks_by_timer = load_marks(&marks_path)?;
        let todos = load_todos(&todos_path)?;

        Ok(Self {
            root,
            timers,
            todos,
            marks_by_timer,
        })
    }

    fn timers_path(&self) -> PathBuf {
        self.root.join("timers.csv")
    }

    fn marks_path(&self) -> PathBuf {
        self.root.join("marks.csv")
    }

    fn todos_path(&self) -> PathBuf {
        self.root.join("todos.csv")
    }

    fn persist_timers(&self) -> AppResult<()> {
        let mut timers: Vec<&Timer> = self.timers.values().collect();
        timers.sort_by(|left, right| left.id.cmp(&right.id));

        let mut rows = Vec::with_capacity(timers.len() + 1);
        rows.push(TIMERS_HEADER.to_string());
        for timer in timers {
            rows.push(csv_row(&[
                &timer.id,
                &timer.name,
                &timer.target_at_minute.to_string(),
                &timer.created_at_minute.to_string(),
                &timer.updated_at_minute.to_string(),
                &timer.archived.to_string(),
            ]));
        }

        write_atomic(&self.timers_path(), &rows.join("\n"))
    }

    fn persist_marks(&self) -> AppResult<()> {
        let mut marks: Vec<&Mark> = self
            .marks_by_timer
            .values()
            .flat_map(|timer_marks| timer_marks.iter())
            .collect();
        marks.sort_by_key(|mark| {
            (
                mark.timer_id.clone(),
                mark.marked_at_minute,
                mark.id.clone(),
            )
        });

        let mut rows = Vec::with_capacity(marks.len() + 1);
        rows.push(MARKS_HEADER.to_string());
        for mark in marks {
            rows.push(csv_row(&[
                &mark.id,
                &mark.timer_id,
                &mark.marked_at_minute.to_string(),
                &optional_i64_to_csv(mark.prev_marked_at_minute),
                &optional_i64_to_csv(mark.duration_minutes),
                &mark.description,
                &mark.todo_ids.join(";"),
            ]));
        }

        write_atomic(&self.marks_path(), &rows.join("\n"))
    }

    fn persist_todos(&self) -> AppResult<()> {
        let mut todos: Vec<&Todo> = self.todos.values().collect();
        todos.sort_by(|left, right| left.id.cmp(&right.id));

        let mut rows = Vec::with_capacity(todos.len() + 1);
        rows.push(TODOS_HEADER.to_string());
        for todo in todos {
            rows.push(csv_row(&[
                &todo.id,
                &todo.timer_id,
                &todo.title,
                todo.status.as_str(),
                &todo.created_at_minute.to_string(),
                &todo.updated_at_minute.to_string(),
                &optional_i64_to_csv(todo.done_at_minute),
            ]));
        }

        write_atomic(&self.todos_path(), &rows.join("\n"))
    }
}

impl Store for CsvStore {
    fn save_timer(&mut self, timer: Timer) -> AppResult<()> {
        self.timers.insert(timer.id.clone(), timer);
        self.persist_timers()
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
        self.persist_todos()
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
        self.persist_marks()
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

fn ensure_csv_file(path: &Path, header: &str) -> AppResult<()> {
    if path.exists() {
        return Ok(());
    }
    write_atomic(path, header)
}

fn load_timers(path: &Path) -> AppResult<HashMap<String, Timer>> {
    let rows = load_csv_rows(path, TIMERS_HEADER)?;
    let mut timers = HashMap::new();

    for fields in rows {
        if fields.len() != 6 {
            return Err(AppError::Internal(format!(
                "timers.csv expected 6 columns, got {}",
                fields.len()
            )));
        }

        let timer = Timer {
            id: fields[0].clone(),
            name: fields[1].clone(),
            target_at_minute: parse_i64("target_at", &fields[2])?,
            created_at_minute: parse_i64("created_at", &fields[3])?,
            updated_at_minute: parse_i64("updated_at", &fields[4])?,
            archived: parse_bool("archived", &fields[5])?,
        };
        timers.insert(timer.id.clone(), timer);
    }

    Ok(timers)
}

fn load_todos(path: &Path) -> AppResult<HashMap<String, Todo>> {
    let rows = load_csv_rows(path, TODOS_HEADER)?;
    let mut todos = HashMap::new();

    for fields in rows {
        if fields.len() != 7 {
            return Err(AppError::Internal(format!(
                "todos.csv expected 7 columns, got {}",
                fields.len()
            )));
        }

        let status = TodoStatus::from_str(&fields[3])
            .ok_or_else(|| AppError::Internal(format!("invalid todo status '{}'", fields[3])))?;

        let todo = Todo {
            id: fields[0].clone(),
            timer_id: fields[1].clone(),
            title: fields[2].clone(),
            status,
            created_at_minute: parse_i64("created_at", &fields[4])?,
            updated_at_minute: parse_i64("updated_at", &fields[5])?,
            done_at_minute: parse_optional_i64("done_at", &fields[6])?,
        };
        todos.insert(todo.id.clone(), todo);
    }

    Ok(todos)
}

fn load_marks(path: &Path) -> AppResult<HashMap<String, Vec<Mark>>> {
    let rows = load_csv_rows(path, MARKS_HEADER)?;
    let mut marks_by_timer: HashMap<String, Vec<Mark>> = HashMap::new();

    for fields in rows {
        if fields.len() != 7 {
            return Err(AppError::Internal(format!(
                "marks.csv expected 7 columns, got {}",
                fields.len()
            )));
        }

        let timer_id = fields[1].clone();
        let mark = Mark {
            id: fields[0].clone(),
            timer_id: timer_id.clone(),
            marked_at_minute: parse_i64("marked_at", &fields[2])?,
            prev_marked_at_minute: parse_optional_i64("prev_marked_at", &fields[3])?,
            duration_minutes: parse_optional_i64("duration_minutes", &fields[4])?,
            description: fields[5].clone(),
            todo_ids: parse_todo_ids(&fields[6]),
        };

        marks_by_timer.entry(timer_id).or_default().push(mark);
    }

    for marks in marks_by_timer.values_mut() {
        marks.sort_by_key(|mark| mark.marked_at_minute);
    }

    Ok(marks_by_timer)
}

fn parse_todo_ids(value: &str) -> Vec<String> {
    if value.is_empty() {
        return Vec::new();
    }
    value
        .split(';')
        .map(|part| part.trim().to_string())
        .filter(|part| !part.is_empty())
        .collect()
}

fn load_csv_rows(path: &Path, expected_header: &str) -> AppResult<Vec<Vec<String>>> {
    let mut content = String::new();
    File::open(path)
        .and_then(|mut file| file.read_to_string(&mut content))
        .map_err(|error| AppError::Internal(format!("failed to read {path:?}: {error}")))?;

    let mut records = split_csv_records(&content)?.into_iter();
    let header = records.next().unwrap_or_default();
    if header != expected_header {
        return Err(AppError::Internal(format!(
            "csv header mismatch for {path:?}, expected '{expected_header}', got '{header}'"
        )));
    }

    let mut rows = Vec::new();
    for record in records {
        if record.is_empty() {
            continue;
        }
        rows.push(parse_csv_line(&record)?);
    }

    Ok(rows)
}

fn split_csv_records(content: &str) -> AppResult<Vec<String>> {
    let mut records = Vec::new();
    let mut current = String::new();
    let mut chars = content.chars().peekable();
    let mut in_quotes = false;

    while let Some(character) = chars.next() {
        match character {
            '"' => {
                current.push(character);
                if in_quotes {
                    if matches!(chars.peek(), Some('"')) {
                        current.push('"');
                        let _ = chars.next();
                    } else {
                        in_quotes = false;
                    }
                } else {
                    in_quotes = true;
                }
            }
            '\n' if !in_quotes => {
                let record = current.trim_end_matches('\r').to_string();
                records.push(record);
                current.clear();
            }
            _ => current.push(character),
        }
    }

    if in_quotes {
        return Err(AppError::Internal("unclosed quote in csv line".to_string()));
    }

    if !current.is_empty() {
        records.push(current.trim_end_matches('\r').to_string());
    }

    Ok(records)
}

fn parse_csv_line(line: &str) -> AppResult<Vec<String>> {
    let mut values = Vec::new();
    let mut current = String::new();
    let mut chars = line.chars().peekable();
    let mut in_quotes = false;

    while let Some(character) = chars.next() {
        match character {
            '"' => {
                if in_quotes {
                    if matches!(chars.peek(), Some('"')) {
                        current.push('"');
                        let _ = chars.next();
                    } else {
                        in_quotes = false;
                    }
                } else {
                    in_quotes = true;
                }
            }
            ',' if !in_quotes => {
                values.push(current.clone());
                current.clear();
            }
            _ => current.push(character),
        }
    }

    if in_quotes {
        return Err(AppError::Internal("unclosed quote in csv line".to_string()));
    }

    values.push(current);
    Ok(values)
}

fn csv_row(values: &[&str]) -> String {
    values
        .iter()
        .map(|value| csv_escape(value))
        .collect::<Vec<String>>()
        .join(",")
}

fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn optional_i64_to_csv(value: Option<i64>) -> String {
    value.map(|inner| inner.to_string()).unwrap_or_default()
}

fn parse_i64(name: &str, value: &str) -> AppResult<i64> {
    value
        .parse::<i64>()
        .map_err(|error| AppError::Internal(format!("failed to parse {name}='{value}': {error}")))
}

fn parse_optional_i64(name: &str, value: &str) -> AppResult<Option<i64>> {
    if value.is_empty() {
        return Ok(None);
    }
    parse_i64(name, value).map(Some)
}

fn parse_bool(name: &str, value: &str) -> AppResult<bool> {
    match value {
        "true" => Ok(true),
        "false" => Ok(false),
        _ => Err(AppError::Internal(format!(
            "failed to parse {name}='{value}' as bool"
        ))),
    }
}

fn write_atomic(path: &Path, content: &str) -> AppResult<()> {
    let temporary = path.with_extension("tmp");

    let mut file = File::create(&temporary)
        .map_err(|error| AppError::Internal(format!("failed to create {temporary:?}: {error}")))?;
    file.write_all(content.as_bytes())
        .map_err(|error| AppError::Internal(format!("failed to write {temporary:?}: {error}")))?;
    file.write_all(b"\n").map_err(|error| {
        AppError::Internal(format!("failed to write newline to {temporary:?}: {error}"))
    })?;
    file.sync_all().map_err(|error| {
        AppError::Internal(format!(
            "failed to fsync temporary csv {temporary:?}: {error}"
        ))
    })?;

    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| AppError::Internal(format!("failed to remove {path:?}: {error}")))?;
    }

    fs::rename(&temporary, path).map_err(|error| {
        AppError::Internal(format!(
            "failed to rename {temporary:?} to {path:?}: {error}"
        ))
    })
}

#[cfg(test)]
mod persistence {
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::repository::{CsvStore, MARKS_HEADER, Store, TIMERS_HEADER, TODOS_HEADER};
    use crate::service::AppService;

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("countdown-todo-{prefix}-{timestamp}"));
        std::fs::create_dir_all(&dir).expect("temporary dir should be created");
        dir
    }

    #[test]
    fn tests_writes_csv_headers_and_rows() {
        let root = unique_temp_dir("persist");
        let store = CsvStore::new(&root).expect("csv store should be created");
        let mut service = AppService::new(store);

        let timer = service
            .create_timer("phase2", 300, 100)
            .expect("timer should be created");
        let todo = service
            .create_todo(&timer.id, "implement csv", 110)
            .expect("todo should be created");
        service
            .create_mark(&timer.id, 120, "wrote csv repo", vec![todo.id])
            .expect("mark should be created");

        let timers_csv = std::fs::read_to_string(root.join("timers.csv"))
            .expect("timers csv should be readable");
        let marks_csv =
            std::fs::read_to_string(root.join("marks.csv")).expect("marks csv should be readable");
        let todos_csv =
            std::fs::read_to_string(root.join("todos.csv")).expect("todos csv should be readable");

        assert!(timers_csv.contains(TIMERS_HEADER));
        assert!(marks_csv.contains(MARKS_HEADER));
        assert!(todos_csv.contains(TODOS_HEADER));

        assert!(timers_csv.contains("phase2"));
        assert!(marks_csv.contains("wrote csv repo"));
        assert!(todos_csv.contains("implement csv"));
    }

    #[test]
    fn tests_reloads_data_after_store_reopen() {
        let root = unique_temp_dir("reload");

        {
            let store = CsvStore::new(&root).expect("csv store should be created");
            let mut service = AppService::new(store);
            let timer = service
                .create_timer("reloadable", 300, 100)
                .expect("timer should be created");
            service
                .create_mark(&timer.id, 140, "first pass", vec![])
                .expect("mark should be created");
        }

        let reopened_store = CsvStore::new(&root).expect("csv store should reopen");
        let reopened_service = AppService::new(reopened_store);
        let timers = reopened_service.list_timers(false);

        assert_eq!(timers.len(), 1);
        let marks = reopened_service
            .list_marks_by_timer(&timers[0].id)
            .expect("marks should load");
        assert_eq!(marks.len(), 1);
        assert_eq!(marks[0].description, "first pass");
    }

    #[test]
    fn tests_reloads_multiline_mark_description_after_store_reopen() {
        let root = unique_temp_dir("reload-multiline");

        {
            let store = CsvStore::new(&root).expect("csv store should be created");
            let mut service = AppService::new(store);
            let timer = service
                .create_timer("reloadable", 300, 100)
                .expect("timer should be created");
            service
                .create_mark(&timer.id, 140, "- a\n- a\n- a", vec![])
                .expect("mark should be created");
        }

        let reopened_store = CsvStore::new(&root).expect("csv store should reopen");
        let reopened_service = AppService::new(reopened_store);
        let timers = reopened_service.list_timers(false);

        assert_eq!(timers.len(), 1);
        let marks = reopened_service
            .list_marks_by_timer(&timers[0].id)
            .expect("marks should load");
        assert_eq!(marks.len(), 1);
        assert_eq!(marks[0].description, "- a\n- a\n- a");
    }

    #[test]
    fn tests_store_trait_compatibility() {
        let root = unique_temp_dir("trait");
        let mut store = CsvStore::new(&root).expect("csv store should be created");
        let timer = crate::model::Timer {
            id: "timer-1".to_string(),
            name: "compat".to_string(),
            target_at_minute: 200,
            created_at_minute: 100,
            updated_at_minute: 100,
            archived: false,
        };

        store.save_timer(timer).expect("save should succeed");
        assert!(store.get_timer("timer-1").is_some());
    }
}

#[cfg(test)]
mod restart {
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::repository::CsvStore;
    use crate::service::AppService;

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("countdown-todo-{prefix}-{timestamp}"));
        std::fs::create_dir_all(&dir).expect("temporary dir should be created");
        dir
    }

    #[test]
    fn tests_keeps_prev_marked_at_across_restart() {
        let root = unique_temp_dir("restart");
        let timer_id = {
            let store = CsvStore::new(&root).expect("csv store should be created");
            let mut service = AppService::new(store);
            let timer = service
                .create_timer("continuity", 500, 100)
                .expect("timer should be created");
            service
                .create_mark(&timer.id, 200, "before restart", vec![])
                .expect("first mark should be created");
            timer.id
        };

        let store = CsvStore::new(&root).expect("csv store should reopen");
        let mut service = AppService::new(store);

        let second_mark = service
            .create_mark(&timer_id, 245, "after restart", vec![])
            .expect("second mark should be created");

        assert_eq!(second_mark.prev_marked_at_minute, Some(200));
        assert_eq!(second_mark.duration_minutes, Some(45));
    }
}
