use crate::models::MessageInfo;
use crate::state::AppState;
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
use tauri::State;

fn media_source_url(source: &MediaSource) -> Option<String> {
    match source {
        MediaSource::Plain(uri) => Some(uri.to_string()),
        MediaSource::Encrypted(file) => Some(file.url.to_string()),
    }
}

#[tauri::command]
pub async fn get_messages(
    state: State<'_, AppState>,
    room_id: String,
    limit: Option<u32>,
) -> Result<Vec<MessageInfo>, String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_id = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let room = client
        .get_room(&parsed_id)
        .ok_or("Room not found")?;

    let mut options = MessagesOptions::backward();
    if let Some(l) = limit {
        options.limit = UInt::from(l);
    }

    let response = room
        .messages(options)
        .await
        .map_err(|e| format!("Failed to get messages: {}", e))?;

    let mut messages = Vec::with_capacity(response.chunk.len());

    for timeline_event in &response.chunk {
        let raw = timeline_event.raw();
        if let Ok(AnySyncTimelineEvent::MessageLike(
            matrix_sdk::ruma::events::AnySyncMessageLikeEvent::RoomMessage(msg_event),
        )) = raw.deserialize()
        {
            if let SyncMessageLikeEvent::Original(original) = msg_event {
                let sender = original.sender.to_string();

                // Single member lookup instead of two separate calls
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

    // Reverse so oldest first
    messages.reverse();

    Ok(messages)
}

#[tauri::command]
pub async fn send_message(
    state: State<'_, AppState>,
    room_id: String,
    body: String,
    reply_to: Option<String>,
) -> Result<String, String> {
    let client_lock = state.client.read().await;
    let client = client_lock.as_ref().ok_or("Not logged in")?;

    let parsed_id = RoomId::parse(&room_id)
        .map_err(|e| format!("Invalid room ID: {}", e))?;

    let room = client
        .get_room(&parsed_id)
        .ok_or("Room not found")?;

    let mut content = RoomMessageEventContent::text_markdown(body);

    // For replies, set the relation manually
    if let Some(reply_event_id) = reply_to {
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

    Ok(response.event_id.to_string())
}
