use crate::models::RoomInfo;
use crate::state::AppState;
use matrix_sdk::ruma::{
    api::client::space::get_hierarchy::v1::Request as HierarchyRequest,
    room::RoomType,
    RoomId, ServerName, UserId,
};

const VOICE_ROOM_TYPE: &str = "m.voice";
use tauri::State;

/// Convert an mxc:// URL to an HTTP URL using the Matrix content repository.
fn mxc_to_http(mxc_url: &str, homeserver: &str) -> Option<String> {
    let stripped = mxc_url.strip_prefix("mxc://")?;
    let (server, media_id) = stripped.split_once('/')?;
    let hs = homeserver.trim_end_matches('/');
    Some(format!("{}/_matrix/media/v3/download/{}/{}", hs, server, media_id))
}

#[tauri::command]
pub async fn get_space_rooms(
    state: State<'_, AppState>,
    space_id: String,
) -> Result<Vec<RoomInfo>, String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let space_room_id = RoomId::parse(&space_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let mut rooms = Vec::new();

    let request = HierarchyRequest::new(space_room_id);
    let response = client
        .send(request)
        .await
        .map_err(|e| format!("Failed to get space hierarchy: {}", e))?;

    for chunk in response.rooms {
        let room_id_str = chunk.room_id.to_string();
        if room_id_str == space_id {
            continue;
        }

        let is_space = chunk.room_type.as_ref() == Some(&RoomType::Space);
        if is_space {
            continue;
        }

        // Get real unread count from the joined room if available
        let unread_count = client
            .get_room(&chunk.room_id)
            .map(|r| r.unread_notification_counts().notification_count)
            .unwrap_or(0);

        let channel_type = match chunk.room_type.as_ref().map(|t| t.as_str()) {
            Some(VOICE_ROOM_TYPE) => "voice",
            _ => "text",
        }.to_string();

        rooms.push(RoomInfo {
            room_id: room_id_str,
            name: chunk.name,
            topic: chunk.topic,
            is_direct: false,
            unread_count,
            avatar_url: chunk.avatar_url.map(|u| u.to_string()),
            other_user_id: None,
            channel_type,
        });
    }

    Ok(rooms)
}

#[tauri::command]
pub async fn get_direct_rooms(state: State<'_, AppState>) -> Result<Vec<RoomInfo>, String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let my_user_id = client.user_id().map(|u| u.to_string()).unwrap_or_default();
    let homeserver = client.homeserver().to_string();
    let mut dms = Vec::new();

    for room in client.joined_rooms() {
        if room.is_direct().await.unwrap_or(false) {
            // For DMs, show the other user's display name instead of the room name
            let mut dm_name = room.name();
            let mut dm_avatar = room.avatar_url().map(|u| u.to_string());
            let mut other_uid: Option<String> = None;

            // Find the other member's display name and user ID
            if let Ok(members) = room.members(matrix_sdk::RoomMemberships::JOIN).await {
                for member in &members {
                    if member.user_id().to_string() != my_user_id {
                        other_uid = Some(member.user_id().to_string());
                        if dm_name.is_none() {
                            dm_name = member.display_name().map(|s| s.to_string())
                                .or_else(|| {
                                    let uid = member.user_id().to_string();
                                    let ci = uid.find(':');
                                    if uid.starts_with('@') && ci.is_some() {
                                        Some(uid[1..ci.unwrap()].to_string())
                                    } else {
                                        Some(uid)
                                    }
                                });
                        }
                        if dm_avatar.is_none() {
                            dm_avatar = member.avatar_url().map(|u| u.to_string());
                        }
                        break;
                    }
                }
            }

            // Convert mxc:// avatar URL to HTTP
            let resolved_avatar = dm_avatar.and_then(|url| {
                if url.starts_with("mxc://") {
                    mxc_to_http(&url, &homeserver)
                } else {
                    Some(url)
                }
            });

            dms.push(RoomInfo {
                room_id: room.room_id().to_string(),
                name: dm_name,
                topic: room.topic(),
                is_direct: true,
                unread_count: room.unread_notification_counts().notification_count,
                avatar_url: resolved_avatar,
                other_user_id: other_uid,
                channel_type: "text".to_string(),
            });
        }
    }

    Ok(dms)
}

#[tauri::command]
pub async fn create_room(
    state: State<'_, AppState>,
    name: String,
    topic: Option<String>,
    space_id: Option<String>,
    encrypted: bool,
    channel_type: Option<String>,
) -> Result<RoomInfo, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Room name cannot be empty".to_string());
    }

    let ch_type = channel_type.unwrap_or_else(|| "text".to_string());

    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    use matrix_sdk::ruma::{
        assign,
        api::client::room::create_room::v3::{Request as CreateRoomRequest, CreationContent},
        events::room::encryption::RoomEncryptionEventContent,
        events::InitialStateEvent,
        serde::Raw,
    };

    let mut initial_state = Vec::new();
    if encrypted {
        let encryption_event = InitialStateEvent::<RoomEncryptionEventContent>::new(
            RoomEncryptionEventContent::with_recommended_defaults(),
        );
        initial_state.push(Raw::new(&encryption_event).map_err(|e| format!("Serialize error: {}", e))?.cast());
    }

    // Set room type in creation content for voice/link channels
    let creation_content = match ch_type.as_str() {
        "voice" => {
            let mut cc = CreationContent::new();
            cc.room_type = Some(RoomType::from(VOICE_ROOM_TYPE));
            Some(Raw::new(&cc).map_err(|e| format!("Serialize error: {}", e))?)
        }
        _ => None,
    };

    let request = assign!(CreateRoomRequest::new(), {
        name: Some(name.clone()),
        topic: topic.clone(),
        initial_state,
        creation_content,
    });

    let room = client
        .create_room(request)
        .await
        .map_err(|e| format!("Failed to create room: {}", e))?;

    // If a space_id is provided, add the room as a child of the space
    if let Some(space_id) = space_id {
        let space_room_id = RoomId::parse(&space_id)
            .map_err(|e| format!("Invalid space ID: {}", e))?;
        if let Some(space) = client.get_room(&space_room_id) {
            use matrix_sdk::ruma::events::space::child::SpaceChildEventContent;
            let homeserver = client.homeserver().host_str().unwrap_or("").to_string();
            let server_name = ServerName::parse(&homeserver)
                .map_err(|e| format!("Invalid server name: {}", e))?;
            let child_content = SpaceChildEventContent::new(vec![server_name.to_owned()]);
            space
                .send_state_event_for_key(room.room_id(), child_content)
                .await
                .map_err(|e| format!("Failed to add room to space: {}", e))?;
        }
    }

    Ok(RoomInfo {
        room_id: room.room_id().to_string(),
        name: Some(name),
        topic,
        is_direct: false,
        unread_count: 0,
        avatar_url: None,
        other_user_id: None,
        channel_type: ch_type,
    })
}

/// Create or find an existing DM room with a user.
#[tauri::command]
pub async fn create_dm(
    state: State<'_, AppState>,
    user_id: String,
) -> Result<RoomInfo, String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let target_user = UserId::parse(&user_id)
        .map_err(|e| format!("Invalid user ID: {}", e))?;

    // Check if a DM already exists with this user
    for room in client.joined_rooms() {
        if room.is_direct().await.unwrap_or(false) {
            let members = room
                .members(matrix_sdk::RoomMemberships::JOIN)
                .await
                .unwrap_or_default();
            if members.len() == 2 && members.iter().any(|m| m.user_id() == target_user) {
                return Ok(RoomInfo {
                    room_id: room.room_id().to_string(),
                    name: room.name(),
                    topic: room.topic(),
                    is_direct: true,
                    unread_count: room.unread_notification_counts().notification_count,
                    avatar_url: room.avatar_url().map(|u| u.to_string()),
                    other_user_id: Some(user_id.clone()),
                    channel_type: "text".to_string(),
                });
            }
        }
    }

    // No existing DM — create one
    use matrix_sdk::ruma::{
        assign,
        api::client::room::create_room::v3::{Request as CreateRoomRequest, CreationContent},
        events::room::encryption::RoomEncryptionEventContent,
        events::InitialStateEvent,
        serde::Raw,
    };

    let encryption_event = InitialStateEvent::<RoomEncryptionEventContent>::new(
        RoomEncryptionEventContent::with_recommended_defaults(),
    );
    let initial_state = vec![
        Raw::new(&encryption_event).map_err(|e| format!("Serialize error: {}", e))?.cast(),
    ];

    let creation_content = CreationContent::new();

    let request = assign!(CreateRoomRequest::new(), {
        invite: vec![target_user.to_owned()],
        is_direct: true,
        initial_state,
        creation_content: Some(Raw::new(&creation_content).map_err(|e| format!("Serialize error: {}", e))?),
    });

    let room = client
        .create_room(request)
        .await
        .map_err(|e| format!("Failed to create DM: {}", e))?;

    // Get display name of the target user for the room name
    let dm_name = room.name().or_else(|| Some(user_id.clone()));

    Ok(RoomInfo {
        room_id: room.room_id().to_string(),
        name: dm_name,
        topic: None,
        is_direct: true,
        unread_count: 0,
        avatar_url: None,
        other_user_id: Some(user_id),
        channel_type: "text".to_string(),
    })
}

#[tauri::command]
pub async fn join_room(state: State<'_, AppState>, room_id: String) -> Result<(), String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_id = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    client
        .join_room_by_id(&parsed_id)
        .await
        .map_err(|e| format!("Failed to join room: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn leave_room(state: State<'_, AppState>, room_id: String) -> Result<(), String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_id = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let room = client
        .get_room(&parsed_id)
        .ok_or("Room not found")?;

    room.leave()
        .await
        .map_err(|e| format!("Failed to leave room: {}", e))?;

    Ok(())
}
