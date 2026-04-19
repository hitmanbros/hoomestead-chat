use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};

/// Application error type that implements IntoResponse for axum.
pub struct AppError(pub String);

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": self.0 })),
        )
            .into_response()
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        AppError(s.to_string())
    }
}

/// Result type alias for handlers.
pub type AppResult<T> = Result<T, AppError>;
