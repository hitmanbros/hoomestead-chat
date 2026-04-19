use crate::error::AppResult;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::Json;
use matrix_sdk::ruma::{
    events::reaction::ReactionEventContent,
    events::relation::Annotation,
    EventId, RoomId,
};
use serde::Deserialize;
use std::sync::Arc;

#[derive(Deserialize)]
pub struct ReactionRequest {
    pub event_id: String,
    pub key: String,
}

pub async fn send_reaction(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
    Json(body): Json<ReactionRequest>,
) -> AppResult<Json<String>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_room_id = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let parsed_event_id = EventId::parse(&body.event_id)
        .map_err(|e| format!("Invalid event ID: {}", e))?;

    let room = client
        .get_room(&parsed_room_id)
        .ok_or("Room not found")?;

    let annotation = Annotation::new(parsed_event_id, body.key);
    let content = ReactionEventContent::new(annotation);

    let response = room
        .send(content)
        .await
        .map_err(|e| format!("Failed to send reaction: {}", e))?;

    Ok(Json(response.event_id.to_string()))
}

#[derive(Deserialize)]
pub struct RedactRequest {
    pub reason: Option<String>,
}

pub async fn redact_event(
    State(state): State<Arc<AppState>>,
    Path((room_id, event_id)): Path<(String, String)>,
    Json(body): Json<RedactRequest>,
) -> AppResult<Json<()>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_room_id = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let parsed_event_id = EventId::parse(&event_id)
        .map_err(|e| format!("Invalid event ID: {}", e))?;

    let room = client
        .get_room(&parsed_room_id)
        .ok_or("Room not found")?;

    room.redact(&parsed_event_id, body.reason.as_deref(), None)
        .await
        .map_err(|e| format!("Failed to redact: {}", e))?;

    Ok(Json(()))
}
