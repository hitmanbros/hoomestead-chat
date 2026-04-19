use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use crate::state::AppState;
use matrix_sdk::{
    media::{MediaFormat, MediaRequestParameters},
    ruma::{
        events::room::{
            message::{
                FileMessageEventContent, ImageMessageEventContent,
                MessageType, RoomMessageEventContent,
            },
            MediaSource,
        },
        OwnedMxcUri, RoomId,
    },
};
use tauri::State;

#[tauri::command]
pub async fn get_media_url(
    state: State<'_, AppState>,
    mxc_url: String,
) -> Result<String, String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    if !mxc_url.starts_with("mxc://") {
        return Err("Invalid MXC URI: must start with mxc://".to_string());
    }

    let mxc_uri: OwnedMxcUri = mxc_url.into();

    let request = MediaRequestParameters {
        source: MediaSource::Plain(mxc_uri),
        format: MediaFormat::File,
    };

    let data = client
        .media()
        .get_media_content(&request, true)
        .await
        .map_err(|e| format!("Failed to get media: {}", e))?;

    if data.is_empty() {
        return Err("Media content is empty".to_string());
    }

    // Return as base64 data URL
    let b64 = BASE64.encode(&data);
    Ok(format!("data:application/octet-stream;base64,{}", b64))
}

#[tauri::command]
pub async fn upload_file(
    state: State<'_, AppState>,
    room_id: String,
    file_path: String,
    file_name: String,
    mime_type: String,
) -> Result<String, String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    const MAX_UPLOAD_SIZE: u64 = 100 * 1024 * 1024; // 100 MB

    // Check file size before reading into memory
    let metadata = tokio::fs::metadata(&file_path)
        .await
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

    if metadata.len() > MAX_UPLOAD_SIZE {
        return Err(format!(
            "File too large ({:.1} MB). Maximum upload size is 100 MB.",
            metadata.len() as f64 / (1024.0 * 1024.0)
        ));
    }

    let data = tokio::fs::read(&file_path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let content_type: mime::Mime = mime_type
        .parse()
        .unwrap_or(mime::APPLICATION_OCTET_STREAM);

    let response = client
        .media()
        .upload(&content_type, data, None)
        .await
        .map_err(|e| format!("Failed to upload: {}", e))?;

    let parsed_room_id = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let room = client
        .get_room(&parsed_room_id)
        .ok_or("Room not found")?;

    let content = if content_type.type_() == mime::IMAGE {
        let img_content = ImageMessageEventContent::plain(file_name, response.content_uri);
        RoomMessageEventContent::new(MessageType::Image(img_content))
    } else {
        let file_content = FileMessageEventContent::plain(file_name, response.content_uri);
        RoomMessageEventContent::new(MessageType::File(file_content))
    };

    let msg_response = room
        .send(content)
        .await
        .map_err(|e| format!("Failed to send: {}", e))?;

    Ok(msg_response.event_id.to_string())
}
