use crate::error::AppResult;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::Json;
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
use serde::Deserialize;
use std::sync::Arc;

#[derive(Deserialize)]
pub struct MediaQuery {
    pub mxc: String,
}

pub async fn get_media_url(
    State(state): State<Arc<AppState>>,
    Query(query): Query<MediaQuery>,
) -> AppResult<Json<String>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    if !query.mxc.starts_with("mxc://") {
        return Err("Invalid MXC URI: must start with mxc://".into());
    }

    let mxc_uri: OwnedMxcUri = query.mxc.into();

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
        return Err("Media content is empty".into());
    }

    let b64 = BASE64.encode(&data);
    Ok(Json(format!("data:application/octet-stream;base64,{}", b64)))
}

pub async fn upload_file(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
    mut multipart: axum::extract::Multipart,
) -> AppResult<Json<String>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let mut file_data: Option<Vec<u8>> = None;
    let mut file_name = String::new();
    let mut mime_type_str = String::from("application/octet-stream");

    while let Some(field) = multipart.next_field().await.map_err(|e| e.to_string())? {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                if let Some(fname) = field.file_name() {
                    file_name = fname.to_string();
                }
                if let Some(ct) = field.content_type() {
                    mime_type_str = ct.to_string();
                }
                file_data = Some(field.bytes().await.map_err(|e| e.to_string())?.to_vec());
            }
            "file_name" => {
                file_name = field.text().await.map_err(|e| e.to_string())?;
            }
            "mime_type" => {
                mime_type_str = field.text().await.map_err(|e| e.to_string())?;
            }
            _ => {}
        }
    }

    let data = file_data.ok_or("No file uploaded")?;

    const MAX_UPLOAD_SIZE: usize = 100 * 1024 * 1024;
    if data.len() > MAX_UPLOAD_SIZE {
        return Err(format!(
            "File too large ({:.1} MB). Maximum upload size is 100 MB.",
            data.len() as f64 / (1024.0 * 1024.0)
        ).into());
    }

    let content_type: mime::Mime = mime_type_str
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

    Ok(Json(msg_response.event_id.to_string()))
}
