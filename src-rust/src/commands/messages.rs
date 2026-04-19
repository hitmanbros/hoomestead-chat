use crate::error::AppResult;
use crate::models::{MessageInfo, MessagesResponse};
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::Json;
use matrix_sdk::{
    room::MessagesOptions,
    ruma::{
        events::{
            room::message::{MessageType, RoomMessageEventContent},
            room::MediaSource,
            AnySyncTimelineEvent, SyncMessageLikeEvent,
        },
        RoomId, UInt,
    },
};
use serde::Deserialize;
use std::sync::Arc;

fn media_source_url(source: &MediaSource) -> Option<String> {
    match source {
        MediaSource::Plain(uri) => Some(uri.to_string()),
        MediaSource::Encrypted(file) => Some(file.url.to_string()),
    }
}

#[derive(Deserialize)]
pub struct MessagesQuery {
    pub limit: Option<u32>,
    pub from: Option<String>,
}

pub async fn get_messages(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
    Query(query): Query<MessagesQuery>,
) -> AppResult<Json<MessagesResponse>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_id = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let room = client
        .get_room(&parsed_id)
        .ok_or("Room not found")?;

    let mut options = MessagesOptions::backward();
    options.limit = UInt::from(query.limit.unwrap_or(100));

    if let Some(ref from_token) = query.from {
        options.from = Some(from_token.clone());
    }

    let response = room
        .messages(options)
        .await
        .map_err(|e| format!("Failed to get messages: {}", e))?;

    let end_token = response.end.clone();
    let has_more = response.end.is_some() && !response.chunk.is_empty();

    let mut messages = Vec::with_capacity(response.chunk.len());

    for timeline_event in &response.chunk {
        // Handle encrypted messages that couldn't be decrypted
        if let matrix_sdk::deserialized_responses::TimelineEventKind::UnableToDecrypt { event, .. } = &timeline_event.kind {
            // Extract basic info from the encrypted event
            if let Ok(event_id) = event.get_field::<String>("event_id") {
                if let (Some(event_id), Ok(Some(sender)), Ok(Some(ts))) = (
                    event_id,
                    event.get_field::<String>("sender"),
                    event.get_field::<u64>("origin_server_ts"),
                ) {
                    let sender_str = sender.clone();
                    let parsed_sender = matrix_sdk::ruma::UserId::parse(&sender_str);
                    let member = if let Ok(ref uid) = parsed_sender {
                        room.get_member_no_sync(uid).await.ok().flatten()
                    } else {
                        None
                    };

                    messages.push(MessageInfo {
                        event_id,
                        sender: sender_str,
                        sender_display_name: member.as_ref()
                            .and_then(|m| m.display_name().map(|s| s.to_string())),
                        sender_avatar_url: member.as_ref()
                            .and_then(|m| m.avatar_url().map(|u| u.to_string())),
                        body: "🔒 Unable to decrypt this message. Use Settings → Security to recover encryption keys.".to_string(),
                        formatted_body: None,
                        timestamp: ts / 1000, // origin_server_ts is in milliseconds
                        msg_type: "encrypted".to_string(),
                        reply_to: None,
                        media_url: None,
                    });
                }
            }
            continue;
        }

        let raw = timeline_event.raw();
        if let Ok(AnySyncTimelineEvent::MessageLike(
            matrix_sdk::ruma::events::AnySyncMessageLikeEvent::RoomMessage(msg_event),
        )) = raw.deserialize()
        {
            if let SyncMessageLikeEvent::Original(original) = msg_event {
                let sender = original.sender.to_string();

                let member = room
                    .get_member_no_sync(&original.sender)
                    .await
                    .ok()
                    .flatten();

                let sender_display_name = member.as_ref()
                    .and_then(|m| m.display_name().map(|s| s.to_string()));
                let sender_avatar_url = member.as_ref()
                    .and_then(|m| m.avatar_url().map(|u| u.to_string()));

                let (body, formatted_body, msg_type, media_url) =
                    match &original.content.msgtype {
                        MessageType::Text(text) => (
                            text.body.clone(),
                            text.formatted.as_ref().map(|f| f.body.clone()),
                            "text".to_string(),
                            None,
                        ),
                        MessageType::Image(img) => (
                            img.body.clone(),
                            None,
                            "image".to_string(),
                            media_source_url(&img.source),
                        ),
                        MessageType::File(file) => (
                            file.body.clone(),
                            None,
                            "file".to_string(),
                            media_source_url(&file.source),
                        ),
                        _ => (
                            original.content.body().to_string(),
                            None,
                            "other".to_string(),
                            None,
                        ),
                    };

                let reply_to =
                    original.content.relates_to.as_ref().and_then(|r| {
                        if let matrix_sdk::ruma::events::room::message::Relation::Reply {
                            in_reply_to,
                        } = r
                        {
                            Some(in_reply_to.event_id.to_string())
                        } else {
                            None
                        }
                    });

                messages.push(MessageInfo {
                    event_id: original.event_id.to_string(),
                    sender,
                    sender_display_name,
                    sender_avatar_url,
                    body,
                    formatted_body,
                    timestamp: original.origin_server_ts.as_secs().into(),
                    msg_type,
                    reply_to,
                    media_url,
                });
            }
        }
    }

    messages.reverse();
    Ok(Json(MessagesResponse {
        messages,
        end: end_token,
        has_more,
    }))
}

#[derive(Deserialize)]
pub struct SendMessageRequest {
    pub body: String,
    pub reply_to: Option<String>,
}

pub async fn send_message(
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<String>,
    Json(body): Json<SendMessageRequest>,
) -> AppResult<Json<String>> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_id = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let room = client
        .get_room(&parsed_id)
        .ok_or("Room not found")?;

    let mut content = RoomMessageEventContent::text_markdown(body.body);

    if let Some(reply_event_id) = body.reply_to {
        use matrix_sdk::ruma::{EventId, events::room::message::Relation, events::relation::InReplyTo};
        let reply_id = EventId::parse(&reply_event_id)
            .map_err(|e| format!("Invalid event ID: {}", e))?;
        content.relates_to = Some(Relation::Reply {
            in_reply_to: InReplyTo::new(reply_id),
        });
    }

    let response = room
        .send(content)
        .await
        .map_err(|e| format!("Failed to send message: {}", e))?;

    Ok(Json(response.event_id.to_string()))
}
