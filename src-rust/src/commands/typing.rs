use crate::error::AppResult;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::Json;
use serde::Deserialize;
use std::sync::Arc;

#[derive(Deserialize)]
pub struct TypingRequest {
    pub typing: bool,
}

pub async fn send_typing(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
    Json(body): Json<TypingRequest>,
) -> AppResult<Json<()>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_id = matrix_sdk::ruma::RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let room = client
        .get_room(&parsed_id)
        .ok_or("Room not found")?;

    room.typing_notice(body.typing)
        .await
        .map_err(|e| format!("Failed to send typing: {}", e))?;

    Ok(Json(()))
}
