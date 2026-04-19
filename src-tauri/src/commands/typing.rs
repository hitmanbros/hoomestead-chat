use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn send_typing(
    state: State<'_, AppState>,
    room_id: String,
    typing: bool,
) -> Result<(), String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_id = matrix_sdk::ruma::RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let room = client
        .get_room(&parsed_id)
        .ok_or("Room not found")?;

    room.typing_notice(typing)
        .await
        .map_err(|e| format!("Failed to send typing: {}", e))?;

    Ok(())
}
