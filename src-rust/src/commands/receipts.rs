use crate::error::AppResult;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::Json;
use matrix_sdk::ruma::{
    api::client::receipt::create_receipt::v3::ReceiptType,
    events::receipt::ReceiptThread,
    EventId, RoomId,
};
use std::sync::Arc;

pub async fn send_read_receipt(
    State(state): State<Arc<AppState>>,
    Path((room_id, event_id)): Path<(String, String)>,
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

    room.send_single_receipt(
        ReceiptType::Read,
        ReceiptThread::Unthreaded,
        parsed_event_id,
    )
    .await
    .map_err(|e| format!("Failed to send read receipt: {}", e))?;

    Ok(Json(()))
}
