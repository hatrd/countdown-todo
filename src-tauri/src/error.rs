use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppError {
    NotFound(String),
    Validation(String),
    Conflict(String),
    Internal(String),
}

impl Display for AppError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound(message) => write!(f, "not found: {message}"),
            Self::Validation(message) => write!(f, "validation failed: {message}"),
            Self::Conflict(message) => write!(f, "conflict: {message}"),
            Self::Internal(message) => write!(f, "internal error: {message}"),
        }
    }
}

impl std::error::Error for AppError {}

pub type AppResult<T> = Result<T, AppError>;
