use crate::error::AppResult;
use crate::models::{PublicSpaceInfo, SpaceInfo};
use crate::state::AppState;
use axum::extract::State;
use axum::Json;
use matrix_sdk::ruma::{
    api::client::room::create_room::v3::{CreationContent, Request as CreateRoomRequest},
    room::RoomType,
    serde::Raw,
    uint,
};
use serde::Deserialize;
use std::sync::Arc;

pub async fn get_spaces(State(state): State<Arc<AppState>>) -> AppResult<Json<Vec<SpaceInfo>>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let mut spaces = Vec::new();

    for room in client.joined_rooms() {
        if room.is_space() {
            spaces.push(SpaceInfo {
                room_id: room.room_id().to_string(),
                name: room.name(),
                avatar_url: room.avatar_url().map(|u| u.to_string()),
                topic: room.topic(),
            });
        }
    }

    Ok(Json(spaces))
}

#[derive(Deserialize)]
pub struct CreateSpaceRequest {
    pub name: String,
    pub topic: Option<String>,
    pub public: Option<bool>,
}

pub async fn create_space(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateSpaceRequest>,
) -> AppResult<Json<SpaceInfo>> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err("Space name cannot be empty".into());
    }

    let is_public = body.public.unwrap_or(true);

    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    use matrix_sdk::ruma::{
        assign,
        api::client::room::Visibility,
        api::client::room::create_room::v3::RoomPreset,
        events::room::join_rules::{JoinRule, RoomJoinRulesEventContent},
        events::InitialStateEvent,
    };

    let mut creation_content = CreationContent::new();
    creation_content.room_type = Some(RoomType::Space);

    let visibility = if is_public { Visibility::Public } else { Visibility::Private };
    let preset = if is_public { Some(RoomPreset::PublicChat) } else { Some(RoomPreset::PrivateChat) };

    let mut initial_state = Vec::new();
    if !is_public {
        let join_rules = InitialStateEvent::<RoomJoinRulesEventContent>::new(
            RoomJoinRulesEventContent::new(JoinRule::Invite),
        );
        initial_state.push(
            Raw::new(&join_rules).map_err(|e| format!("Serialize error: {}", e))?.cast()
        );
    }

    let request = assign!(CreateRoomRequest::new(), {
        name: Some(name.clone()),
        topic: body.topic.clone(),
        visibility,
        preset,
        initial_state,
        creation_content: Some(Raw::new(&creation_content).map_err(|e| format!("Failed to serialize: {}", e))?),
    });

    let room = client
        .create_room(request)
        .await
        .map_err(|e| format!("Failed to create space: {}", e))?;

    Ok(Json(SpaceInfo {
        room_id: room.room_id().to_string(),
        name: Some(name),
        avatar_url: None,
        topic: body.topic,
    }))
}

fn mxc_to_http(mxc_str: &str, homeserver: &str) -> Option<String> {
    let stripped = mxc_str.strip_prefix("mxc://")?;
    let (server, media_id) = stripped.split_once('/')?;
    Some(format!(
        "{}/_matrix/media/v3/download/{}/{}",
        homeserver.trim_end_matches('/'),
        server,
        media_id,
    ))
}

/// Get discoverable spaces: public room directory + rooms user has been invited to
pub async fn get_discoverable_spaces(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<PublicSpaceInfo>>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let homeserver = client.homeserver().to_string();

    // Collect already-joined room IDs to exclude
    let joined_ids: std::collections::HashSet<String> = client
        .joined_rooms()
        .iter()
        .map(|r| r.room_id().to_string())
        .collect();

    let mut seen_ids = std::collections::HashSet::new();
    let mut results = Vec::new();

    // 1) Public rooms from the directory
    use matrix_sdk::ruma::{
        api::client::directory::get_public_rooms_filtered::v3::Request as PublicRoomsRequest,
        assign,
        directory::Filter,
    };

    let request = assign!(PublicRoomsRequest::new(), {
        filter: assign!(Filter::new(), {
            generic_search_term: None,
        }),
        limit: Some(uint!(100)),
    });

    if let Ok(response) = client.send(request).await {
        for chunk in response.chunk {
            let room_id_str = chunk.room_id.to_string();
            if joined_ids.contains(&room_id_str) {
                continue;
            }
            seen_ids.insert(room_id_str.clone());

            let avatar_url = chunk.avatar_url
                .and_then(|mxc| mxc_to_http(&mxc.to_string(), &homeserver));

            results.push(PublicSpaceInfo {
                room_id: room_id_str,
                name: chunk.name,
                topic: chunk.topic,
                avatar_url,
                num_joined_members: chunk.num_joined_members.into(),
                join_rule: "public".to_string(),
                is_invited: false,
            });
        }
    }

    // 2) Rooms the user has been invited to (private/invite-only)
    for room in client.invited_rooms() {
        let room_id_str = room.room_id().to_string();
        if joined_ids.contains(&room_id_str) || seen_ids.contains(&room_id_str) {
            continue;
        }

        let name = room.name();
        let topic = room.topic();
        let avatar_url = room.avatar_url()
            .and_then(|mxc| mxc_to_http(&mxc.to_string(), &homeserver));

        results.push(PublicSpaceInfo {
            room_id: room_id_str,
            name,
            topic,
            avatar_url,
            num_joined_members: 0,
            join_rule: "invite".to_string(),
            is_invited: true,
        });
    }

    Ok(Json(results))
}
