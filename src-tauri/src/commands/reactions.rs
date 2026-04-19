use crate::state::AppState;
use matrix_sdk::ruma::{
    events::reaction::ReactionEventContent,
    events::relation::Annotation,
    EventId, RoomId,
};
use tauri::State;

#[tauri::command]
pub async fn send_reaction(
    state: State<'_, AppState>,
    room_id: String,
    event_id: String,
    key: String,
) -> Result<String, String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_room_id = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let parsed_event_id = EventId::parse(&event_id)
        .map_err(|e| format!("Invalid event ID: {}", e))?;

    let room = client
        .get_room(&parsed_room_id)
        .ok_or("Room not found")?;

    let annotation = Annotation::new(parsed_event_id, key);
    let content = ReactionEventContent::new(annotation);

    let response = room
        .send(content)
        .await
        .map_err(|e| format!("Failed to send reaction: {}", e))?;

    Ok(response.event_id.to_string())
}

#[tauri::command]
pub async fn redact_event(
    state: State<'_, AppState>,
    room_id: String,
    event_id: String,
    reason: Option<String>,
) -> Result<(), String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_room_id = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let parsed_event_id = EventId::parse(&event_id)
        .map_err(|e| format!("Invalid event ID: {}", e))?;

    let room = client
        .get_room(&parsed_room_id)
        .ok_or("Room not found")?;

    room.redact(&parsed_event_id, reason.as_deref(), None)
        .await
        .map_err(|e| format!("Failed to redact: {}", e))?;

    Ok(())
}
