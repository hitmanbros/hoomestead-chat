use crate::models::SpaceInfo;
use crate::state::AppState;
use matrix_sdk::ruma::{
    api::client::room::create_room::v3::{CreationContent, Request as CreateRoomRequest},
    room::RoomType,
    serde::Raw,
};
use tauri::State;

#[tauri::command]
pub async fn get_spaces(state: State<'_, AppState>) -> Result<Vec<SpaceInfo>, String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let mut spaces = Vec::new();

    for room in client.joined_rooms() {
        if room.is_space() {
            let name = room.name();
            let avatar_url = room.avatar_url().map(|u| u.to_string());
            let topic = room.topic();

            spaces.push(SpaceInfo {
                room_id: room.room_id().to_string(),
                name,
                avatar_url,
                topic,
            });
        }
    }

    Ok(spaces)
}

#[tauri::command]
pub async fn create_space(
    state: State<'_, AppState>,
    name: String,
    topic: Option<String>,
) -> Result<SpaceInfo, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Space name cannot be empty".to_string());
    }

    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    use matrix_sdk::ruma::assign;

    let mut creation_content = CreationContent::new();
    creation_content.room_type = Some(RoomType::Space);

    let request = assign!(CreateRoomRequest::new(), {
        name: Some(name.clone()),
        topic: topic.clone(),
        creation_content: Some(Raw::new(&creation_content).map_err(|e| format!("Failed to serialize: {}", e))?),
    });

    let room = client
        .create_room(request)
        .await
        .map_err(|e| format!("Failed to create space: {}", e))?;

    Ok(SpaceInfo {
        room_id: room.room_id().to_string(),
        name: Some(name),
        avatar_url: None,
        topic,
    })
}
