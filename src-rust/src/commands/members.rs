use crate::error::AppResult;
use crate::models::{FriendInfo, MemberInfo};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::Json;
use matrix_sdk::ruma::api::client::membership::{ban_user, kick_user};
use matrix_sdk::ruma::api::client::presence::get_presence;
use serde::Deserialize;
use std::sync::Arc;

pub async fn get_room_members(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
) -> AppResult<Json<Vec<MemberInfo>>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_id = matrix_sdk::ruma::RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let room = client
        .get_room(&parsed_id)
        .ok_or("Room not found")?;

    let members = room
        .members(matrix_sdk::RoomMemberships::JOIN)
        .await
        .map_err(|e| format!("Failed to get members: {}", e))?;

    let my_user_id = client.user_id().map(|u| u.to_string()).unwrap_or_default();
    let am_i_server_admin = state.get_server_admin();

    let mut presence_futures = Vec::with_capacity(members.len());
    for member in &members {
        let user_id_str = member.user_id().to_string();
        if user_id_str == my_user_id {
            presence_futures.push(futures::future::Either::Left(async { "online".to_string() }));
        } else {
            let client = client.clone();
            let user_id = member.user_id().to_owned();
            presence_futures.push(futures::future::Either::Right(async move {
                let request = get_presence::v3::Request::new(user_id);
                match client.send(request).await {
                    Ok(response) => response.presence.to_string(),
                    Err(_) => "offline".to_string(),
                }
            }));
        }
    }

    let presences = futures::future::join_all(presence_futures).await;

    let room_creator: Option<String> = {
        use matrix_sdk::ruma::events::room::create::RoomCreateEventContent;
        match room.get_state_event_static::<RoomCreateEventContent>().await {
            Ok(Some(raw)) => raw.deserialize().ok().map(|ev| ev.sender().to_string()),
            _ => None,
        }
    };

    let max_power_level = {
        let mut max = 0i64;
        for m in &members {
            let pl = m.power_level();
            if pl > max { max = pl; }
        }
        if max < 100 { 100 } else { max }
    };

    let mut result = Vec::with_capacity(members.len());

    for (member, presence) in members.iter().zip(presences) {
        let mut power_level = member.power_level();

        if power_level == 0 {
            if let Some(ref creator) = room_creator {
                if member.user_id().to_string() == *creator {
                    power_level = max_power_level;
                }
            }
        }

        let uid_str = member.user_id().to_string();
        let is_server_admin = am_i_server_admin && uid_str == my_user_id;

        result.push(MemberInfo {
            user_id: uid_str,
            display_name: member.display_name().map(|s| s.to_string()),
            avatar_url: member.avatar_url().map(|u| u.to_string()),
            presence,
            power_level,
            is_server_admin,
        });
    }

    result.sort_by(|a, b| {
        let a_online = a.presence != "offline";
        let b_online = b.presence != "offline";
        b_online.cmp(&a_online)
            .then_with(|| b.is_server_admin.cmp(&a.is_server_admin))
            .then_with(|| b.power_level.cmp(&a.power_level))
            .then_with(|| {
                let a_name = a.display_name.as_deref().unwrap_or(&a.user_id);
                let b_name = b.display_name.as_deref().unwrap_or(&b.user_id);
                a_name.to_lowercase().cmp(&b_name.to_lowercase())
            })
    });

    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct KickBanRequest {
    pub user_id: String,
    pub reason: Option<String>,
}

pub async fn kick_member(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
    Json(body): Json<KickBanRequest>,
) -> AppResult<Json<()>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_room = matrix_sdk::ruma::RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;
    let parsed_user = matrix_sdk::ruma::UserId::parse(&body.user_id)
        .map_err(|e| format!("Invalid user ID: {}", e))?;

    let mut request = kick_user::v3::Request::new(parsed_room, parsed_user);
    if let Some(r) = body.reason {
        request.reason = Some(r);
    }

    client.send(request).await.map_err(|e| format!("Failed to kick: {}", e))?;
    Ok(Json(()))
}

pub async fn ban_member(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
    Json(body): Json<KickBanRequest>,
) -> AppResult<Json<()>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_room = matrix_sdk::ruma::RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;
    let parsed_user = matrix_sdk::ruma::UserId::parse(&body.user_id)
        .map_err(|e| format!("Invalid user ID: {}", e))?;

    let mut request = ban_user::v3::Request::new(parsed_room, parsed_user);
    if let Some(r) = body.reason {
        request.reason = Some(r);
    }

    client.send(request).await.map_err(|e| format!("Failed to ban: {}", e))?;
    Ok(Json(()))
}

#[derive(Deserialize)]
pub struct SetPowerLevelRequest {
    pub user_id: String,
    pub power_level: i64,
}

pub async fn set_power_level(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
    Json(body): Json<SetPowerLevelRequest>,
) -> AppResult<Json<()>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_room = matrix_sdk::ruma::RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;
    let parsed_user = matrix_sdk::ruma::UserId::parse(&body.user_id)
        .map_err(|e| format!("Invalid user ID: {}", e))?;

    let room = client.get_room(&parsed_room).ok_or("Room not found")?;

    let level = matrix_sdk::ruma::Int::from(body.power_level as i32);
    let updates = vec![(parsed_user.as_ref(), level)];
    let result = room.update_power_levels(updates).await;

    match result {
        Ok(_) => Ok(Json(())),
        Err(e) => {
            let err_str = e.to_string();
            if state.get_server_admin()
                && (err_str.contains("permission") || err_str.contains("M_FORBIDDEN"))
            {
                tracing::info!("Standard power level update failed, trying Synapse admin API");
                admin_set_power_level(client, &room_id, &body.user_id, body.power_level).await?;
                Ok(Json(()))
            } else {
                Err(format!("Failed to set power level: {}", e).into())
            }
        }
    }
}

fn mxc_to_http(mxc_url: &str, homeserver: &str) -> Option<String> {
    let stripped = mxc_url.strip_prefix("mxc://")?;
    let (server, media_id) = stripped.split_once('/')?;
    let hs = homeserver.trim_end_matches('/');
    Some(format!("{}/_matrix/media/v3/download/{}/{}", hs, server, media_id))
}

pub async fn get_friends(State(state): State<Arc<AppState>>) -> AppResult<Json<Vec<FriendInfo>>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let my_user_id = client.user_id().map(|u| u.to_string()).unwrap_or_default();
    let homeserver = client.homeserver().to_string();
    let mut friends = Vec::new();
    let mut seen_users = std::collections::HashSet::new();

    for room in client.joined_rooms() {
        if !room.is_direct().await.unwrap_or(false) {
            continue;
        }

        let members = room
            .members(matrix_sdk::RoomMemberships::JOIN)
            .await
            .unwrap_or_default();

        for member in &members {
            let uid = member.user_id().to_string();
            if uid == my_user_id || seen_users.contains(&uid) {
                continue;
            }
            seen_users.insert(uid.clone());

            let presence = {
                let user_id = member.user_id().to_owned();
                let request = get_presence::v3::Request::new(user_id);
                match client.send(request).await {
                    Ok(response) => response.presence.to_string(),
                    Err(_) => "offline".to_string(),
                }
            };

            let display_name = member.display_name().map(|s| s.to_string()).or_else(|| {
                let s = member.user_id().to_string();
                let ci = s.find(':');
                if s.starts_with('@') && ci.is_some() {
                    Some(s[1..ci.unwrap()].to_string())
                } else {
                    Some(s)
                }
            });

            let avatar_url = member.avatar_url().and_then(|u| {
                let url = u.to_string();
                if url.starts_with("mxc://") {
                    mxc_to_http(&url, &homeserver)
                } else {
                    Some(url)
                }
            });

            friends.push(FriendInfo {
                user_id: uid,
                display_name,
                avatar_url,
                presence,
                room_id: room.room_id().to_string(),
            });
        }
    }

    friends.sort_by(|a, b| {
        let a_online = a.presence != "offline";
        let b_online = b.presence != "offline";
        b_online.cmp(&a_online).then_with(|| {
            let a_name = a.display_name.as_deref().unwrap_or(&a.user_id);
            let b_name = b.display_name.as_deref().unwrap_or(&b.user_id);
            a_name.to_lowercase().cmp(&b_name.to_lowercase())
        })
    });

    Ok(Json(friends))
}

async fn admin_set_power_level(
    client: &matrix_sdk::Client,
    room_id: &str,
    user_id: &str,
    power_level: i64,
) -> Result<(), String> {
    let homeserver = client.homeserver();
    let Some(token) = client.matrix_auth().access_token() else {
        return Err("No access token".into());
    };

    let hs = homeserver.as_str().trim_end_matches('/');
    let encoded_room = urlencoding::encode(room_id);

    let http = reqwest::Client::new();
    let pl_url = format!("{}/_matrix/client/v3/rooms/{}/state/m.room.power_levels/", hs, encoded_room);
    let pl_resp = http
        .get(&pl_url)
        .header("Authorization", format!("Bearer {}", token))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Failed to get power levels: {}", e))?;

    let mut pl_content: serde_json::Value = pl_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse power levels: {}", e))?;

    if let Some(users) = pl_content.get_mut("users") {
        if let Some(obj) = users.as_object_mut() {
            obj.insert(user_id.to_string(), serde_json::json!(power_level));
        }
    } else {
        pl_content["users"] = serde_json::json!({ user_id: power_level });
    }

    let admin_url = format!("{}/_synapse/admin/v1/rooms/{}/state/m.room.power_levels", hs, encoded_room);
    let resp = http
        .put(&admin_url)
        .header("Authorization", format!("Bearer {}", token))
        .json(&pl_content)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await;

    match resp {
        Ok(r) if r.status().is_success() => Ok(()),
        Ok(r) => {
            let status = r.status();
            let body = r.text().await.unwrap_or_default();
            if status.as_u16() == 404 || body.contains("M_UNRECOGNIZED") {
                let state_url = format!("{}/_matrix/client/v3/rooms/{}/state/m.room.power_levels/", hs, encoded_room);
                let fallback = http
                    .put(&state_url)
                    .header("Authorization", format!("Bearer {}", token))
                    .json(&pl_content)
                    .timeout(std::time::Duration::from_secs(10))
                    .send()
                    .await
                    .map_err(|e| format!("Admin override failed: {}", e))?;

                if fallback.status().is_success() {
                    Ok(())
                } else {
                    let body = fallback.text().await.unwrap_or_default();
                    Err(format!("Permission denied: {}", body))
                }
            } else {
                Err(format!("Admin API error ({}): {}", status, body))
            }
        }
        Err(e) => Err(format!("Admin API request failed: {}", e)),
    }
}
