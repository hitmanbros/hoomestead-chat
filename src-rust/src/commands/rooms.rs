use crate::error::AppResult;
use crate::models::RoomInfo;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::Json;
use matrix_sdk::ruma::{
    api::client::space::get_hierarchy::v1::Request as HierarchyRequest,
    room::RoomType,
    RoomId, ServerName, UserId,
};
use serde::Deserialize;
use std::sync::Arc;

const VOICE_ROOM_TYPE: &str = "m.voice";
const ELEMENT_CALL_ROOM_TYPE: &str = "org.matrix.msc3417.call";

fn mxc_to_http(mxc_url: &str, homeserver: &str) -> Option<String> {
    let stripped = mxc_url.strip_prefix("mxc://")?;
    let (server, media_id) = stripped.split_once('/')?;
    let hs = homeserver.trim_end_matches('/');
    Some(format!("{}/_matrix/media/v3/download/{}/{}", hs, server, media_id))
}

pub async fn get_space_rooms(
    State(state): State<Arc<AppState>>,
    Path(space_id): Path<String>,
) -> AppResult<Json<Vec<RoomInfo>>> {
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

        let unread_count = client
            .get_room(&chunk.room_id)
            .map(|r| r.unread_notification_counts().notification_count)
            .unwrap_or(0);

        let channel_type = match chunk.room_type.as_ref().map(|t| t.as_str()) {
            Some(VOICE_ROOM_TYPE) | Some(ELEMENT_CALL_ROOM_TYPE) => "voice",
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

    Ok(Json(rooms))
}

pub async fn get_direct_rooms(State(state): State<Arc<AppState>>) -> AppResult<Json<Vec<RoomInfo>>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let my_user_id = client.user_id().map(|u| u.to_string()).unwrap_or_default();
    let homeserver = client.homeserver().to_string();
    let mut dms = Vec::new();

    for room in client.joined_rooms() {
        if room.is_direct().await.unwrap_or(false) {
            let mut dm_name = room.name();
            let mut dm_avatar = room.avatar_url().map(|u| u.to_string());
            let mut other_uid: Option<String> = None;

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

    Ok(Json(dms))
}

#[derive(Deserialize)]
pub struct CreateRoomRequest {
    pub name: String,
    pub topic: Option<String>,
    pub space_id: Option<String>,
    pub encrypted: Option<bool>,
    pub channel_type: Option<String>,
}

pub async fn create_room(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateRoomRequest>,
) -> AppResult<Json<RoomInfo>> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err("Room name cannot be empty".into());
    }

    let ch_type = body.channel_type.unwrap_or_else(|| "text".to_string());
    let encrypted = body.encrypted.unwrap_or(true);

    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    use matrix_sdk::ruma::{
        assign,
        api::client::room::create_room::v3::{Request as MatrixCreateRoomRequest, CreationContent, RoomPreset},
        api::client::room::Visibility,
        events::room::encryption::RoomEncryptionEventContent,
        events::room::join_rules::{AllowRule, JoinRule, RoomJoinRulesEventContent},
        events::room::history_visibility::{HistoryVisibility, RoomHistoryVisibilityEventContent},
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

    // Set join rules and history visibility for space rooms
    if let Some(ref space_id_str) = body.space_id {
        // Only members of the parent space can join (like Discord server channels)
        let space_room_id_for_rule = RoomId::parse(space_id_str)
            .map_err(|e| format!("Invalid space ID for join rule: {}", e))?;
        let allow = vec![AllowRule::room_membership(space_room_id_for_rule.to_owned())];
        let join_rules = InitialStateEvent::<RoomJoinRulesEventContent>::new(
            RoomJoinRulesEventContent::restricted(allow),
        );
        initial_state.push(Raw::new(&join_rules).map_err(|e| format!("Serialize error: {}", e))?.cast());

        // Make history visible to joined members
        let history_vis = InitialStateEvent::<RoomHistoryVisibilityEventContent>::new(
            RoomHistoryVisibilityEventContent::new(HistoryVisibility::Shared),
        );
        initial_state.push(Raw::new(&history_vis).map_err(|e| format!("Serialize error: {}", e))?.cast());
    }

    let mut cc = CreationContent::new();
    if ch_type == "voice" {
        cc.room_type = Some(RoomType::from(VOICE_ROOM_TYPE));
    }
    let creation_content = Some(Raw::new(&cc).map_err(|e| format!("Serialize error: {}", e))?);

    let request = assign!(MatrixCreateRoomRequest::new(), {
        name: Some(name.clone()),
        topic: body.topic.clone(),
        initial_state,
        creation_content,
        visibility: Visibility::Private,
        preset: Some(RoomPreset::PrivateChat),
    });

    let room = client
        .create_room(request)
        .await
        .map_err(|e| format!("Failed to create room: {}", e))?;

    if let Some(space_id) = &body.space_id {
        let space_room_id = RoomId::parse(space_id)
            .map_err(|e| format!("Invalid space ID: {}", e))?;
        if let Some(space) = client.get_room(&space_room_id) {
            use matrix_sdk::ruma::events::space::child::SpaceChildEventContent;
            // Extract server name from user ID (e.g. @user:example.com -> example.com)
            let server_name_str = client
                .user_id()
                .map(|u| u.server_name().to_string())
                .unwrap_or_else(|| {
                    client.homeserver().host_str().unwrap_or("").to_string()
                });
            let server_name = ServerName::parse(&server_name_str)
                .map_err(|e| format!("Invalid server name: {}", e))?;
            let child_content = SpaceChildEventContent::new(vec![server_name.to_owned()]);
            space
                .send_state_event_for_key(room.room_id(), child_content)
                .await
                .map_err(|e| format!("Failed to add room to space: {}", e))?;
        }
    }

    Ok(Json(RoomInfo {
        room_id: room.room_id().to_string(),
        name: Some(name),
        topic: body.topic,
        is_direct: false,
        unread_count: 0,
        avatar_url: None,
        other_user_id: None,
        channel_type: ch_type,
    }))
}

#[derive(Deserialize)]
pub struct CreateDmRequest {
    pub user_id: String,
}

pub async fn create_dm(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateDmRequest>,
) -> AppResult<Json<RoomInfo>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let target_user = UserId::parse(&body.user_id)
        .map_err(|e| format!("Invalid user ID: {}", e))?;

    for room in client.joined_rooms() {
        if room.is_direct().await.unwrap_or(false) {
            let members = room
                .members(matrix_sdk::RoomMemberships::JOIN)
                .await
                .unwrap_or_default();
            if members.len() == 2 && members.iter().any(|m| m.user_id() == target_user) {
                return Ok(Json(RoomInfo {
                    room_id: room.room_id().to_string(),
                    name: room.name(),
                    topic: room.topic(),
                    is_direct: true,
                    unread_count: room.unread_notification_counts().notification_count,
                    avatar_url: room.avatar_url().map(|u| u.to_string()),
                    other_user_id: Some(body.user_id.clone()),
                    channel_type: "text".to_string(),
                }));
            }
        }
    }

    use matrix_sdk::ruma::{
        assign,
        api::client::room::create_room::v3::{Request as MatrixCreateRoomRequest, CreationContent},
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

    let request = assign!(MatrixCreateRoomRequest::new(), {
        invite: vec![target_user.to_owned()],
        is_direct: true,
        initial_state,
        creation_content: Some(Raw::new(&creation_content).map_err(|e| format!("Serialize error: {}", e))?),
    });

    let room = client
        .create_room(request)
        .await
        .map_err(|e| format!("Failed to create DM: {}", e))?;

    let dm_name = room.name().or_else(|| Some(body.user_id.clone()));

    Ok(Json(RoomInfo {
        room_id: room.room_id().to_string(),
        name: dm_name,
        topic: None,
        is_direct: true,
        unread_count: 0,
        avatar_url: None,
        other_user_id: Some(body.user_id),
        channel_type: "text".to_string(),
    }))
}

#[derive(Deserialize)]
pub struct RoomIdRequest {
    pub room_id: String,
}

pub async fn join_room(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RoomIdRequest>,
) -> AppResult<Json<()>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_id = RoomId::parse(&body.room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    client
        .join_room_by_id(&parsed_id)
        .await
        .map_err(|e| format!("Failed to join room: {}", e))?;

    Ok(Json(()))
}

pub async fn leave_room(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
) -> AppResult<Json<()>> {
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

    Ok(Json(()))
}

#[derive(Deserialize)]
pub struct DeleteRoomRequest {
    pub space_id: Option<String>,
}

pub async fn delete_room(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
    Json(body): Json<DeleteRoomRequest>,
) -> AppResult<Json<()>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_id = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let room = client
        .get_room(&parsed_id)
        .ok_or("Room not found")?;

    // Remove from parent space if provided
    if let Some(space_id) = &body.space_id {
        let space_room_id = RoomId::parse(space_id)
            .map_err(|e| format!("Invalid space ID: {}", e))?;
        if let Some(space) = client.get_room(&space_room_id) {
            use matrix_sdk::ruma::events::space::child::SpaceChildEventContent;
            // Send empty space child event to unlink
            let empty_content = SpaceChildEventContent::new(vec![]);
            let _ = space
                .send_state_event_for_key(&parsed_id, empty_content)
                .await;
        }
    }

    // Kick all other members
    let my_user_id = client.user_id().map(|u| u.to_owned());
    if let Ok(members) = room.members(matrix_sdk::RoomMemberships::JOIN).await {
        for member in &members {
            if Some(member.user_id()) != my_user_id.as_deref() {
                let _ = room.kick_user(member.user_id(), Some("Room deleted")).await;
            }
        }
    }

    // Leave the room
    room.leave()
        .await
        .map_err(|e| format!("Failed to delete room: {}", e))?;

    Ok(Json(()))
}

/// List all joined rooms (for "add existing channel to space" UI)
pub async fn get_all_joined_rooms(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<RoomInfo>>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let mut rooms = Vec::new();
    for room in client.joined_rooms() {
        // Skip DMs
        if room.is_direct().await.unwrap_or(false) {
            continue;
        }
        // Skip spaces
        if room.room_type() == Some(RoomType::Space) {
            continue;
        }

        let channel_type = match room.room_type().as_ref().map(|t| t.as_str()) {
            Some(VOICE_ROOM_TYPE) | Some(ELEMENT_CALL_ROOM_TYPE) => "voice",
            _ => "text",
        }.to_string();

        rooms.push(RoomInfo {
            room_id: room.room_id().to_string(),
            name: room.name(),
            topic: room.topic(),
            is_direct: false,
            unread_count: room.unread_notification_counts().notification_count,
            avatar_url: room.avatar_url().map(|u| u.to_string()),
            other_user_id: None,
            channel_type,
        });
    }

    Ok(Json(rooms))
}

#[derive(Deserialize)]
pub struct AddToSpaceRequest {
    pub room_id: String,
}

/// Add an existing room to a space as a child
pub async fn add_room_to_space(
    State(state): State<Arc<AppState>>,
    Path(space_id): Path<String>,
    Json(body): Json<AddToSpaceRequest>,
) -> AppResult<Json<()>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let space_room_id = RoomId::parse(&space_id)
        .map_err(|e| format!("Invalid space ID: {}", e))?;
    let child_room_id = RoomId::parse(&body.room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let space = client
        .get_room(&space_room_id)
        .ok_or("Space not found")?;

    use matrix_sdk::ruma::events::space::child::SpaceChildEventContent;

    let server_name_str = client
        .user_id()
        .map(|u| u.server_name().to_string())
        .unwrap_or_else(|| {
            client.homeserver().host_str().unwrap_or("").to_string()
        });
    let server_name = ServerName::parse(&server_name_str)
        .map_err(|e| format!("Invalid server name: {}", e))?;

    let child_content = SpaceChildEventContent::new(vec![server_name.to_owned()]);
    space
        .send_state_event_for_key(&child_room_id, child_content)
        .await
        .map_err(|e| format!("Failed to add room to space: {}", e))?;

    Ok(Json(()))
}
