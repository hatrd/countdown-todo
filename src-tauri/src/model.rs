use serde::{Deserialize, Serialize};

pub type EpochMinutes = i64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Timer {
    pub id: String,
    pub name: String,
    pub target_at_minute: EpochMinutes,
    pub created_at_minute: EpochMinutes,
    pub updated_at_minute: EpochMinutes,
    pub archived: bool,
}

impl Timer {
    pub fn remaining_minutes(&self, now_minute: EpochMinutes) -> EpochMinutes {
        self.target_at_minute - now_minute
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Mark {
    pub id: String,
    pub timer_id: String,
    pub marked_at_minute: EpochMinutes,
    pub prev_marked_at_minute: Option<EpochMinutes>,
    pub duration_minutes: Option<EpochMinutes>,
    pub description: String,
    pub todo_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TodoStatus {
    Open,
    Done,
}

impl TodoStatus {
    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "open" => Some(Self::Open),
            "done" => Some(Self::Done),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Done => "done",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Todo {
    pub id: String,
    pub timer_id: String,
    pub title: String,
    pub status: TodoStatus,
    pub created_at_minute: EpochMinutes,
    pub updated_at_minute: EpochMinutes,
    pub done_at_minute: Option<EpochMinutes>,
}
