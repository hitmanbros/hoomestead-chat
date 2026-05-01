use crate::error::AppResult;
use crate::models::{LoginRequest, UserInfo};
use crate::state::AppState;
use crate::sync::start_sync;
use axum::extract::State;
use axum::Json;
use matrix_sdk::authentication::matrix::MatrixSession;
use matrix_sdk::Client;
use matrix_sdk::config::RequestConfig;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedSession {
    homeserver_url: String,
    session: MatrixSession,
}

fn session_file_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("session.json")
}

fn save_session_to_disk(data_dir: &PathBuf, saved: &SavedSession) -> Result<(), String> {
    let path = session_file_path(data_dir);
    let json = serde_json::to_string_pretty(saved)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write session file: {}", e))?;
    info!("Session saved to {}", path.display());
    Ok(())
}

fn load_session_from_disk(data_dir: &PathBuf) -> Option<SavedSession> {
    let path = session_file_path(data_dir);
    let data = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

fn delete_session_from_disk(data_dir: &PathBuf) {
    let path = session_file_path(data_dir);
    let _ = std::fs::remove_file(&path);
}

async fn build_client(homeserver_url: &str, data_dir: &PathBuf) -> Result<Client, String> {
    Client::builder()
        .homeserver_url(homeserver_url)
        .request_config(RequestConfig::default().timeout(Duration::from_secs(30)))
        .sqlite_store(data_dir, None)
        .build()
        .await
        .map_err(|e| format!("Failed to build client: {}", e))
}

async fn check_server_admin(client: &Client, data_dir: &PathBuf) -> bool {
    let homeserver = client.homeserver();
    let user_id = match client.user_id() {
        Some(id) => id.to_string(),
        None => return false,
    };

    if let Some(token) = client.matrix_auth().access_token() {
        let url = format!(
            "{}/_synapse/admin/v1/server_version",
            homeserver.as_str().trim_end_matches('/')
        );
        let http_client = reqwest::Client::new();
        match http_client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
        {
            Ok(resp) => {
                let status = resp.status().as_u16();
                if status == 200 {
                    info!("Synapse admin API confirmed: user IS server admin");
                    return true;
                }
                info!("Synapse admin API returned {} — checking local config", status);
            }
            Err(e) => {
                info!("Synapse admin API unreachable ({}), checking local config", e);
            }
        }
    }

    check_local_admin_config(data_dir, homeserver.as_str(), &user_id)
}

fn check_local_admin_config(data_dir: &PathBuf, homeserver: &str, user_id: &str) -> bool {
    let path = data_dir.join("server_admins.json");
    if let Ok(data) = std::fs::read_to_string(&path) {
        if let Ok(config) = serde_json::from_str::<std::collections::HashMap<String, Vec<String>>>(&data) {
            let hs = homeserver.trim_end_matches('/');
            if let Some(admins) = config.get(hs) {
                return admins.contains(&user_id.to_string());
            }
        }
    }
    false
}

fn save_local_admin_config(
    data_dir: &PathBuf,
    homeserver: &str,
    user_id: &str,
    is_admin: bool,
) -> Result<(), String> {
    let path = data_dir.join("server_admins.json");
    let mut config: std::collections::HashMap<String, Vec<String>> = if let Ok(data) =
        std::fs::read_to_string(&path)
    {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };

    let hs = homeserver.trim_end_matches('/').to_string();
    let admins = config.entry(hs).or_default();

    if is_admin {
        if !admins.contains(&user_id.to_string()) {
            admins.push(user_id.to_string());
        }
    } else {
        admins.retain(|id| id != user_id);
    }

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write: {}", e))?;
    Ok(())
}

async fn get_user_info(client: &Client) -> Result<UserInfo, String> {
    let user_id = client.user_id().ok_or("No user ID")?.to_string();

    let display_name = client
        .account()
        .get_display_name()
        .await
        .ok()
        .flatten()
        .map(|s| s.to_string());

    let avatar_mxc = client
        .account()
        .get_avatar_url()
        .await
        .ok()
        .flatten()
        .map(|u| u.to_string());

    let homeserver = client.homeserver();
    let avatar_url = avatar_mxc.and_then(|mxc| {
        if let Some(stripped) = mxc.strip_prefix("mxc://") {
            if let Some((server, media_id)) = stripped.split_once('/') {
                Some(format!(
                    "{}/_matrix/media/v3/download/{}/{}",
                    homeserver.as_str().trim_end_matches('/'),
                    server,
                    media_id
                ))
            } else {
                Some(mxc)
            }
        } else {
            Some(mxc)
        }
    });

    Ok(UserInfo {
        user_id,
        display_name,
        avatar_url,
    })
}

pub async fn restore_session(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<UserInfo>> {
    let saved = load_session_from_disk(&state.data_dir)
        .ok_or("No saved session found".to_string())?;

    info!("Restoring session for device {}", saved.session.meta.device_id);

    let client = build_client(&saved.homeserver_url, &state.data_dir).await?;

    client
        .matrix_auth()
        .restore_session(saved.session)
        .await
        .map_err(|e| {
            warn!("Session restore failed, clearing saved session: {}", e);
            delete_session_from_disk(&state.data_dir);
            format!("Session expired or invalid: {}", e)
        })?;

    let user_info = get_user_info(&client).await?;
    info!("Session restored for {}", user_info.user_id);

    let is_admin = check_server_admin(&client, &state.data_dir).await;
    state.set_server_admin(is_admin);
    info!("Server admin status: {}", is_admin);

    {
        let mut client_lock = state.client.write().await;
        *client_lock = Some(client.clone());
    }

    start_sync(state.event_tx.clone(), state.sync_handle.clone(), client).await;

    Ok(Json(user_info))
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(request): Json<LoginRequest>,
) -> AppResult<Json<UserInfo>> {
    let homeserver = request.homeserver.trim();
    if homeserver.is_empty() {
        return Err("Homeserver URL cannot be empty".into());
    }

    let homeserver_url = if homeserver.starts_with("http://") || homeserver.starts_with("https://") {
        homeserver.to_string()
    } else {
        format!("https://{}", homeserver)
    };

    if url::Url::parse(&homeserver_url).is_err() {
        return Err("Invalid homeserver URL".into());
    }

    let client = build_client(&homeserver_url, &state.data_dir).await?;

    let login_result = client
        .matrix_auth()
        .login_username(&request.username, &request.password)
        .initial_device_display_name("Hoomestead Chat")
        .await;

    let client = match login_result {
        Ok(_) => client,
        Err(e) => {
            let err_str = e.to_string();
            if err_str.contains("crypto store") || err_str.contains("account in the store") {
                warn!("Crypto store mismatch, clearing all stores and retrying login");
                for prefix in &["matrix-sdk-state", "matrix-sdk-crypto", "matrix-sdk-event-cache"] {
                    for ext in &["sqlite3", "sqlite3-shm", "sqlite3-wal"] {
                        let path = state.data_dir.join(format!("{}.{}", prefix, ext));
                        let _ = std::fs::remove_file(&path);
                    }
                }

                let client = build_client(&homeserver_url, &state.data_dir).await?;
                client
                    .matrix_auth()
                    .login_username(&request.username, &request.password)
                    .initial_device_display_name("Hoomestead Chat")
                    .await
                    .map_err(|e| format!("Login failed: {}", e))?;
                client
            } else {
                return Err(format!("Login failed: {}", e).into());
            }
        }
    };

    if let Some(session) = client.matrix_auth().session() {
        let saved = SavedSession {
            homeserver_url: homeserver_url.clone(),
            session,
        };
        if let Err(e) = save_session_to_disk(&state.data_dir, &saved) {
            warn!("Could not save session: {}", e);
        }
    }

    let user_info = get_user_info(&client).await?;
    info!("Logged in as {}", user_info.user_id);

    let is_admin = check_server_admin(&client, &state.data_dir).await;
    state.set_server_admin(is_admin);
    info!("Server admin status: {}", is_admin);

    {
        let mut client_lock = state.client.write().await;
        *client_lock = Some(client.clone());
    }

    start_sync(state.event_tx.clone(), state.sync_handle.clone(), client).await;

    Ok(Json(user_info))
}

pub async fn recover_encryption(
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Json<String>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let recovery_key = body.get("recovery_key")
        .and_then(|v| v.as_str())
        .ok_or("Missing recovery_key")?
        .trim()
        .to_string();

    if recovery_key.is_empty() {
        return Err("Recovery key cannot be empty".into());
    }

    info!("Attempting to recover encryption keys from backup...");

    match client
        .encryption()
        .recovery()
        .recover(&recovery_key)
        .await
    {
        Ok(_) => {
            info!("Recovery succeeded, checking backup state...");
        }
        Err(e) => {
            warn!("Recovery failed: {}", e);
            return Err(format!("Recovery failed: {}. Make sure you're using the correct recovery key.", e).into());
        }
    }

    // Check backup state
    let backup_state = client.encryption().backups().state();
    info!("Backup state after recovery: {:?}", backup_state);

    // Try to download room keys for each encrypted room
    info!("Downloading room keys from backup for joined rooms...");
    let mut downloaded = 0u32;
    let mut failed = 0u32;
    for room in client.joined_rooms() {
        if room.is_encrypted().await.unwrap_or(false) {
            let room_id = room.room_id();
            // Get the room's timeline to find session IDs we're missing
            let mut options = matrix_sdk::room::MessagesOptions::backward();
            options.limit = matrix_sdk::ruma::UInt::from(100u32);
            if let Ok(response) = room.messages(options).await {
                for event in &response.chunk {
                    if let matrix_sdk::deserialized_responses::TimelineEventKind::UnableToDecrypt {
                        event, ..
                    } = &event.kind
                    {
                        // Extract session_id from the encrypted event
                        if let Ok(Some(session_id)) = event.get_field::<String>("content.session_id") {
                            match client
                                .encryption()
                                .backups()
                                .download_room_key(room_id, &session_id)
                                .await
                            {
                                Ok(true) => {
                                    downloaded += 1;
                                    info!("Downloaded key for room {} session {}", room_id, session_id);
                                }
                                Ok(false) => {
                                    info!("Key not found in backup for room {} session {}", room_id, session_id);
                                }
                                Err(e) => {
                                    failed += 1;
                                    warn!("Failed to download key for room {} session {}: {}", room_id, session_id, e);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    info!("Encryption keys recovered. Downloaded {} keys, {} failures", downloaded, failed);
    Ok(Json(format!(
        "Encryption keys recovered. Downloaded {} room keys from backup. Re-open channels to see decrypted messages.",
        downloaded
    )))
}

pub async fn logout(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<()>> {
    {
        let mut handle = state.sync_handle.write().await;
        if let Some(h) = handle.take() {
            h.abort();
        }
    }

    delete_session_from_disk(&state.data_dir);

    let mut client_lock = state.client.write().await;
    if let Some(client) = client_lock.take() {
        client
            .matrix_auth()
            .logout()
            .await
            .map_err(|e| format!("Logout failed: {}", e))?;
    }
    Ok(Json(()))
}

pub async fn set_avatar(
    State(state): State<Arc<AppState>>,
    mut multipart: axum::extract::Multipart,
) -> AppResult<Json<String>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let mut file_data: Option<Vec<u8>> = None;
    let mut file_name: Option<String> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| e.to_string())? {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            file_name = field.file_name().map(|s| s.to_string());
            file_data = Some(field.bytes().await.map_err(|e| e.to_string())?.to_vec());
        }
    }

    let data = file_data.ok_or("No file uploaded")?;
    let fname = file_name.unwrap_or_default().to_lowercase();

    let allowed_extensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
    if !allowed_extensions.iter().any(|ext| fname.ends_with(ext)) {
        return Err("Invalid file type. Allowed: PNG, JPG, GIF, WebP".into());
    }

    const MAX_AVATAR_SIZE: usize = 10 * 1024 * 1024;
    if data.len() > MAX_AVATAR_SIZE {
        return Err(format!(
            "File too large ({:.1} MB). Maximum avatar size is 10 MB.",
            data.len() as f64 / (1024.0 * 1024.0)
        ).into());
    }

    let mime_type: mime::Mime = if fname.ends_with(".png") {
        "image/png".parse().unwrap()
    } else if fname.ends_with(".gif") {
        "image/gif".parse().unwrap()
    } else if fname.ends_with(".webp") {
        "image/webp".parse().unwrap()
    } else {
        "image/jpeg".parse().unwrap()
    };

    let response = client
        .media()
        .upload(&mime_type, data, None)
        .await
        .map_err(|e| format!("Failed to upload avatar: {}", e))?;

    client
        .account()
        .set_avatar_url(Some(&response.content_uri))
        .await
        .map_err(|e| format!("Failed to set avatar: {}", e))?;

    let homeserver = client.homeserver();
    let mxc = response.content_uri.to_string();
    let http_url = if let Some(stripped) = mxc.strip_prefix("mxc://") {
        if let Some((server, media_id)) = stripped.split_once('/') {
            format!(
                "{}/_matrix/media/v3/download/{}/{}",
                homeserver.as_str().trim_end_matches('/'),
                server,
                media_id
            )
        } else {
            mxc
        }
    } else {
        mxc
    };

    info!("Avatar set successfully");
    Ok(Json(http_url))
}

#[derive(Deserialize)]
pub struct SetAdminRequest {
    pub is_admin: bool,
}

pub async fn set_server_admin_status(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SetAdminRequest>,
) -> AppResult<Json<()>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;
    let user_id = client.user_id().ok_or("No user ID")?.to_string();
    let homeserver = client.homeserver().to_string();

    save_local_admin_config(&state.data_dir, &homeserver, &user_id, body.is_admin)?;
    state.set_server_admin(body.is_admin);
    info!("Server admin status set to {} (local config)", body.is_admin);
    Ok(Json(()))
}
