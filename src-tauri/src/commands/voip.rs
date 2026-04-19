use crate::state::AppState;
use matrix_sdk::ruma::{
    events::call::{
        answer::CallAnswerEventContent,
        candidates::{CallCandidatesEventContent, Candidate},
        hangup::CallHangupEventContent,
        invite::CallInviteEventContent,
        member::{
            ActiveFocus, ActiveLivekitFocus, Focus, LivekitFocus,
            CallMemberEventContent, CallMemberStateKey,
            Application, CallApplicationContent, CallScope,
        },
        SessionDescription,
    },
    uint, OwnedUserId, RoomId, VoipVersionId,
};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize)]
pub struct LiveKitToken {
    pub url: String,
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct IceCandidate {
    pub candidate: String,
}

/// Join a voice channel by sending a m.call.member state event and fetching a LiveKit JWT.
#[tauri::command]
pub async fn join_voice_channel(
    state: State<'_, AppState>,
    room_id: String,
) -> Result<LiveKitToken, String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_room = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;
    let room = client.get_room(&parsed_room).ok_or("Room not found")?;

    let device_id = client
        .device_id()
        .ok_or("No device ID")?
        .to_owned();

    // Fetch the LiveKit service URL from .well-known
    let homeserver = client.homeserver();
    let hs = homeserver.as_str().trim_end_matches('/');

    // Try to get LiveKit focus from .well-known
    // The .well-known is typically at the server_name domain (from user ID, e.g. "example.com")
    // but could also be at the homeserver URL domain (e.g. "matrix.example.com").
    // Try multiple candidates to be generic across different server setups.
    let hs_domain = homeserver.host_str().unwrap_or("");

    // Extract server_name from user ID (@user:server_name)
    let server_name = client.user_id()
        .map(|uid| uid.server_name().as_str().to_string())
        .unwrap_or_default();

    let mut well_known_urls = Vec::new();
    // 1. Try server_name from user ID first (most standard)
    if !server_name.is_empty() {
        well_known_urls.push(format!("https://{}/.well-known/matrix/client", server_name));
    }
    // 2. Try the homeserver URL domain
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

    // Send m.call.member state event to join the voice channel
    let lk_focus = LivekitFocus::new(
        room_id.clone(),
        lk_service_url.clone(),
    );
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

    // Get LiveKit JWT from the MatrixRTC auth service
    // Step 1: Get an OpenID token from the homeserver
    let Some(access_token) = client.matrix_auth().access_token() else {
        return Err("No access token".to_string());
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
        return Err(format!("OpenID token request failed: {}", body));
    }

    let openid_token: serde_json::Value = openid_resp.json().await
        .map_err(|e| format!("Failed to parse OpenID response: {}", e))?;

    // Step 2: Exchange OpenID token for a LiveKit JWT at the SFU auth service
    let jwt_url = format!(
        "{}/sfu/get",
        lk_service_url.trim_end_matches('/'),
    );

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
        return Err(format!("LiveKit auth failed: {}", body));
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

    Ok(LiveKitToken {
        url: lk_url,
        token: lk_token,
    })
}

/// Leave a voice channel by sending an empty m.call.member state event.
#[tauri::command]
pub async fn leave_voice_channel(
    state: State<'_, AppState>,
    room_id: String,
) -> Result<(), String> {
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
    Ok(())
}

#[tauri::command]
pub async fn get_turn_server(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let homeserver = client.homeserver();
    let Some(token) = client.matrix_auth().access_token() else {
        return Err("No access token".to_string());
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
        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| format!("Failed to parse TURN response: {}", e))
    } else {
        // No TURN configured — return empty config (STUN only)
        Ok(serde_json::json!({
            "uris": [],
            "username": "",
            "password": "",
            "ttl": 86400
        }))
    }
}

#[tauri::command]
pub async fn send_call_invite(
    state: State<'_, AppState>,
    room_id: String,
    call_id: String,
    sdp: String,
) -> Result<(), String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_room = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;
    let room = client.get_room(&parsed_room).ok_or("Room not found")?;

    let description = SessionDescription::new("offer".to_string(), sdp);
    let content = CallInviteEventContent::new(
        call_id.into(),
        uint!(30000), // 30 second lifetime
        description,
        VoipVersionId::V1,
    );

    room.send(content)
        .await
        .map_err(|e| format!("Failed to send call invite: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn send_call_answer(
    state: State<'_, AppState>,
    room_id: String,
    call_id: String,
    sdp: String,
) -> Result<(), String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_room = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;
    let room = client.get_room(&parsed_room).ok_or("Room not found")?;

    let description = SessionDescription::new("answer".to_string(), sdp);
    let content = CallAnswerEventContent::new(
        description,
        call_id.into(),
        VoipVersionId::V1,
    );

    room.send(content)
        .await
        .map_err(|e| format!("Failed to send call answer: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn send_call_candidates(
    state: State<'_, AppState>,
    room_id: String,
    call_id: String,
    candidates: Vec<IceCandidate>,
) -> Result<(), String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_room = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;
    let room = client.get_room(&parsed_room).ok_or("Room not found")?;

    let matrix_candidates: Vec<Candidate> = candidates
        .into_iter()
        .map(|c| Candidate::new(c.candidate))
        .collect();

    let content = CallCandidatesEventContent::new(
        call_id.into(),
        matrix_candidates,
        VoipVersionId::V1,
    );

    room.send(content)
        .await
        .map_err(|e| format!("Failed to send candidates: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn send_call_hangup(
    state: State<'_, AppState>,
    room_id: String,
    call_id: String,
) -> Result<(), String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_room = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;
    let room = client.get_room(&parsed_room).ok_or("Room not found")?;

    let content = CallHangupEventContent::new(
        call_id.into(),
        VoipVersionId::V1,
    );

    room.send(content)
        .await
        .map_err(|e| format!("Failed to send hangup: {}", e))?;

    Ok(())
}
