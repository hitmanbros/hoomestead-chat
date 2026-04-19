use crate::models::{LoginRequest, UserInfo};
use crate::state::AppState;
use crate::sync::start_sync;
use matrix_sdk::authentication::matrix::MatrixSession;
use matrix_sdk::Client;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State, Url};
use tracing::{info, warn};

/// Saved session data persisted to disk between app launches.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedSession {
    homeserver_url: String,
    /// Serialized MatrixSession (access_token, device_id, user_id)
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
        .sqlite_store(data_dir, None)
        .build()
        .await
        .map_err(|e| format!("Failed to build client: {}", e))
}

/// Check if the current user is a server admin.
///
/// Strategy (hybrid, works across different server setups):
/// 1. Try Synapse admin API probe (GET /_synapse/admin/v1/server_version).
///    - Returns 200 → confirmed server admin (native Synapse auth).
///    - Returns 403 → confirmed NOT admin, OR server uses MAS (tokens lack admin scope).
///    - Connection error → server isn't Synapse (Dendrite, Conduit, etc).
/// 2. If the probe returns 403 or fails, fall back to a local config file
///    (server_admins.json keyed by homeserver). This covers MAS setups and
///    non-Synapse servers where there's no API to check.
///
/// The local config is NOT auto-populated. Users must explicitly claim admin
/// status via the set_server_admin_status command (a UI toggle in settings).
async fn check_server_admin(client: &Client, data_dir: &PathBuf) -> bool {
    let homeserver = client.homeserver();
    let user_id = match client.user_id() {
        Some(id) => id.to_string(),
        None => return false,
    };

    // Step 1: Try the Synapse admin API probe
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
                info!(
                    "Synapse admin API returned {} — checking local config fallback",
                    status
                );
            }
            Err(e) => {
                info!(
                    "Synapse admin API unreachable ({}), checking local config fallback",
                    e
                );
            }
        }
    }

    // Step 2: Fall back to local config (keyed by homeserver URL)
    check_local_admin_config(data_dir, homeserver.as_str(), &user_id)
}

/// Local admin config: maps homeserver URLs to lists of admin user IDs.
/// Stored in server_admins.json as { "https://matrix.example.com": ["@user:example.com"] }
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

    // Convert mxc:// to HTTP URL for frontend display
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

/// Try to restore a previously saved session. Called on app startup.
#[tauri::command]
pub async fn restore_session(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<UserInfo, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let saved = load_session_from_disk(&data_dir)
        .ok_or("No saved session found".to_string())?;

    info!("Restoring session for device {}", saved.session.meta.device_id);

    let client = build_client(&saved.homeserver_url, &data_dir).await?;

    client
        .matrix_auth()
        .restore_session(saved.session)
        .await
        .map_err(|e| {
            warn!("Session restore failed, clearing saved session: {}", e);
            delete_session_from_disk(&data_dir);
            format!("Session expired or invalid: {}", e)
        })?;

    let user_info = get_user_info(&client).await?;
    info!("Session restored for {}", user_info.user_id);

    let is_admin = check_server_admin(&client, &data_dir).await;
    state.set_server_admin(is_admin);
    info!("Server admin status: {}", is_admin);

    {
        let mut client_lock = state.client.write().await;
        *client_lock = Some(client.clone());
    }

    start_sync(app, state.sync_handle.clone(), client).await;

    Ok(user_info)
}

#[tauri::command]
pub async fn login(
    app: AppHandle,
    state: State<'_, AppState>,
    request: LoginRequest,
) -> Result<UserInfo, String> {
    let homeserver = request.homeserver.trim();
    if homeserver.is_empty() {
        return Err("Homeserver URL cannot be empty".to_string());
    }

    let homeserver_url = if homeserver.starts_with("http://") || homeserver.starts_with("https://") {
        homeserver.to_string()
    } else {
        format!("https://{}", homeserver)
    };

    // Validate the URL is well-formed
    if Url::parse(&homeserver_url).is_err() {
        return Err("Invalid homeserver URL".to_string());
    }

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let client = build_client(&homeserver_url, &data_dir).await?;

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
                        let path = data_dir.join(format!("{}.{}", prefix, ext));
                        let _ = std::fs::remove_file(&path);
                    }
                }

                let client = build_client(&homeserver_url, &data_dir).await?;
                client
                    .matrix_auth()
                    .login_username(&request.username, &request.password)
                    .initial_device_display_name("Hoomestead Chat")
                    .await
                    .map_err(|e| format!("Login failed: {}", e))?;
                client
            } else {
                return Err(format!("Login failed: {}", e));
            }
        }
    };

    // Save session to disk for future restores
    if let Some(session) = client.matrix_auth().session() {
        let saved = SavedSession {
            homeserver_url: homeserver_url.clone(),
            session,
        };
        if let Err(e) = save_session_to_disk(&data_dir, &saved) {
            warn!("Could not save session: {}", e);
        }
    }

    let user_info = get_user_info(&client).await?;
    info!("Logged in as {}", user_info.user_id);

    let is_admin = check_server_admin(&client, &data_dir).await;
    state.set_server_admin(is_admin);
    info!("Server admin status: {}", is_admin);

    {
        let mut client_lock = state.client.write().await;
        *client_lock = Some(client.clone());
    }

    start_sync(app, state.sync_handle.clone(), client).await;

    Ok(user_info)
}

/// Import encryption keys from server-side key backup using recovery key.
#[tauri::command]
pub async fn recover_encryption(
    state: State<'_, AppState>,
    recovery_key: String,
) -> Result<String, String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let recovery_key = recovery_key.trim().to_string();
    if recovery_key.is_empty() {
        return Err("Recovery key cannot be empty".to_string());
    }

    info!("Attempting to recover encryption keys from backup...");

    client
        .encryption()
        .recovery()
        .recover(&recovery_key)
        .await
        .map_err(|e| format!("Recovery failed: {}", e))?;

    info!("Encryption keys recovered successfully");
    Ok("Encryption keys recovered successfully. Encrypted messages should now be readable.".to_string())
}

#[tauri::command]
pub async fn logout(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Cancel sync task first
    {
        let mut handle = state.sync_handle.write().await;
        if let Some(h) = handle.take() {
            h.abort();
        }
    }

    // Delete saved session
    if let Ok(data_dir) = app.path().app_data_dir() {
        delete_session_from_disk(&data_dir);
    }

    let mut client_lock = state.client.write().await;
    if let Some(client) = client_lock.take() {
        client
            .matrix_auth()
            .logout()
            .await
            .map_err(|e| format!("Logout failed: {}", e))?;
    }
    Ok(())
}

/// Set the user's profile avatar from a file path.
#[tauri::command]
pub async fn set_avatar(
    state: State<'_, AppState>,
    file_path: String,
) -> Result<String, String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    // Validate file extension
    let lower_path = file_path.to_lowercase();
    let allowed_extensions = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
    if !allowed_extensions.iter().any(|ext| lower_path.ends_with(ext)) {
        return Err("Invalid file type. Allowed: PNG, JPG, GIF, WebP".to_string());
    }

    // Check file size before reading (max 10 MB)
    const MAX_AVATAR_SIZE: u64 = 10 * 1024 * 1024;
    let metadata = tokio::fs::metadata(&file_path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))?;
    if metadata.len() > MAX_AVATAR_SIZE {
        return Err(format!(
            "File too large ({:.1} MB). Maximum avatar size is 10 MB.",
            metadata.len() as f64 / (1024.0 * 1024.0)
        ));
    }

    let data = tokio::fs::read(&file_path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Detect mime type from extension
    let mime_type: mime::Mime = if lower_path.ends_with(".png") {
        "image/png".parse().unwrap()
    } else if lower_path.ends_with(".gif") {
        "image/gif".parse().unwrap()
    } else if lower_path.ends_with(".webp") {
        "image/webp".parse().unwrap()
    } else {
        "image/jpeg".parse().unwrap()
    };

    // Upload the image to the media repo
    let response = client
        .media()
        .upload(&mime_type, data, None)
        .await
        .map_err(|e| format!("Failed to upload avatar: {}", e))?;

    // Set as profile avatar
    client
        .account()
        .set_avatar_url(Some(&response.content_uri))
        .await
        .map_err(|e| format!("Failed to set avatar: {}", e))?;

    // Return the HTTP URL for immediate display
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
    Ok(http_url)
}

/// Toggle server admin status in local config.
/// Used for MAS-based servers or non-Synapse servers where the admin API
/// probe doesn't work. The UI should present this as a settings toggle.
#[tauri::command]
pub async fn set_server_admin_status(
    app: AppHandle,
    state: State<'_, AppState>,
    is_admin: bool,
) -> Result<(), String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;
    let user_id = client.user_id().ok_or("No user ID")?.to_string();
    let homeserver = client.homeserver().to_string();

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    save_local_admin_config(&data_dir, &homeserver, &user_id, is_admin)?;
    state.set_server_admin(is_admin);
    info!("Server admin status set to {} (local config)", is_admin);
    Ok(())
}
