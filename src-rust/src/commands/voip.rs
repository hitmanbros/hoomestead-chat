use crate::error::AppResult;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::Json;
use matrix_sdk::ruma::{
    events::call::member::{
        ActiveFocus, ActiveLivekitFocus, Focus, LivekitFocus,
        CallMemberEventContent, CallMemberStateKey,
        Application, CallApplicationContent, CallScope,
    },
    RoomId,
};
use serde::Serialize;
use std::sync::Arc;

#[derive(Debug, Serialize)]
pub struct LiveKitToken {
    pub url: String,
    pub token: String,
}

pub async fn join_voice_channel(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
) -> AppResult<Json<LiveKitToken>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_room = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;
    let room = client.get_room(&parsed_room).ok_or("Room not found")?;

    let device_id = client
        .device_id()
        .ok_or("No device ID")?
        .to_owned();

    let homeserver = client.homeserver();
    let hs = homeserver.as_str().trim_end_matches('/');

    let hs_domain = homeserver.host_str().unwrap_or("");
    let server_name = client.user_id()
        .map(|uid| uid.server_name().as_str().to_string())
        .unwrap_or_default();

    let mut well_known_urls = Vec::new();
    if !server_name.is_empty() {
        well_known_urls.push(format!("https://{}/.well-known/matrix/client", server_name));
    }
    if !hs_domain.is_empty() && hs_domain != server_name {
        well_known_urls.push(format!("https://{}/.well-known/matrix/client", hs_domain));
    }

    let http = reqwest::Client::new();
    let mut lk_service_url: Option<String> = None;

    for url in &well_known_urls {
        if lk_service_url.is_some() { break; }
        if let Ok(resp) = http.get(url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
        {
            if resp.status().is_success() {
                let body: serde_json::Value = resp.json().await.unwrap_or_default();
                lk_service_url = body.get("org.matrix.msc4143.rtc_foci")
                    .and_then(|foci| foci.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|f| f.get("livekit_service_url"))
                    .and_then(|u| u.as_str())
                    .map(|s| s.to_string());
            }
        }
    }

    let lk_service_url = lk_service_url
        .ok_or("LiveKit service not configured on this server")?;

    let lk_focus = LivekitFocus::new(room_id.clone(), lk_service_url.clone());
    let active_focus = ActiveFocus::Livekit(ActiveLivekitFocus::new());
    let call_app = CallApplicationContent::new(String::new(), CallScope::Room);
    let content = CallMemberEventContent::new(
        Application::Call(call_app),
        device_id.clone(),
        active_focus,
        vec![Focus::Livekit(lk_focus)],
        None,
    );

    let my_user_id = client.user_id().ok_or("No user ID")?.to_owned();
    let state_key = CallMemberStateKey::new(my_user_id.clone(), Some(device_id.clone()), true);

    room.send_state_event_for_key(&state_key, content)
        .await
        .map_err(|e| format!("Failed to join voice channel: {}", e))?;

    let Some(access_token) = client.matrix_auth().access_token() else {
        return Err("No access token".into());
    };

    let openid_url = format!(
        "{}/_matrix/client/v3/user/{}/openid/request_token",
        hs,
        urlencoding::encode(my_user_id.as_str()),
    );

    let openid_resp = http
        .post(&openid_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .body("{}")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Failed to get OpenID token: {}", e))?;

    if !openid_resp.status().is_success() {
        let body = openid_resp.text().await.unwrap_or_default();
        return Err(format!("OpenID token request failed: {}", body).into());
    }

    let openid_token: serde_json::Value = openid_resp.json().await
        .map_err(|e| format!("Failed to parse OpenID response: {}", e))?;

    let jwt_url = format!("{}/sfu/get", lk_service_url.trim_end_matches('/'));

    let sfu_request = serde_json::json!({
        "room": room_id,
        "openid_token": openid_token,
        "device_id": device_id.as_str(),
    });

    let jwt_resp = http
        .post(&jwt_url)
        .header("Content-Type", "application/json")
        .json(&sfu_request)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Failed to get LiveKit token: {}", e))?;

    if !jwt_resp.status().is_success() {
        let body = jwt_resp.text().await.unwrap_or_default();
        return Err(format!("LiveKit auth failed: {}", body).into());
    }

    let jwt_body: serde_json::Value = jwt_resp.json().await
        .map_err(|e| format!("Failed to parse LiveKit response: {}", e))?;

    let lk_token = jwt_body.get("jwt")
        .or_else(|| jwt_body.get("token"))
        .and_then(|v| v.as_str())
        .ok_or("No JWT in LiveKit response")?
        .to_string();

    let lk_url = jwt_body.get("url")
        .and_then(|v| v.as_str())
        .ok_or("No URL in LiveKit response")?
        .to_string();

    tracing::info!("Joined voice channel {}, got LiveKit token", room_id);

    Ok(Json(LiveKitToken {
        url: lk_url,
        token: lk_token,
    }))
}

pub async fn leave_voice_channel(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
) -> AppResult<Json<()>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_room = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;
    let room = client.get_room(&parsed_room).ok_or("Room not found")?;

    let device_id = client.device_id().ok_or("No device ID")?.to_owned();
    let my_user_id = client.user_id().ok_or("No user ID")?.to_owned();
    let state_key = CallMemberStateKey::new(my_user_id, Some(device_id), true);

    let content = CallMemberEventContent::new_empty(None);

    room.send_state_event_for_key(&state_key, content)
        .await
        .map_err(|e| format!("Failed to leave voice channel: {}", e))?;

    tracing::info!("Left voice channel {}", room_id);
    Ok(Json(()))
}

pub async fn get_turn_server(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<serde_json::Value>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let homeserver = client.homeserver();
    let Some(token) = client.matrix_auth().access_token() else {
        return Err("No access token".into());
    };

    let url = format!(
        "{}/_matrix/client/v3/voip/turnServer",
        homeserver.as_str().trim_end_matches('/')
    );

    let http = reqwest::Client::new();
    let resp = http
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Failed to get TURN server: {}", e))?;

    if resp.status().is_success() {
        Ok(resp.json::<serde_json::Value>()
            .await
            .map(Json)
            .map_err(|e| format!("Failed to parse TURN response: {}", e))?)
    } else {
        Ok(Json(serde_json::json!({
            "uris": [],
            "username": "",
            "password": "",
            "ttl": 86400
        })))
    }
}
