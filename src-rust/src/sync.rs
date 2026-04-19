use crate::models::{CallMemberChangeEvent, MemberChangeEvent, MessageInfo, NewMessageEvent, ReactionEvent, TypingEvent};
use crate::sse::SseEvent;
use matrix_sdk::{
    config::SyncSettings,
    room::Room,
    ruma::events::{
        call::member::CallMemberEventContent,
        reaction::OriginalSyncReactionEvent,
        room::member::OriginalSyncRoomMemberEvent,
        room::message::{MessageType, OriginalSyncRoomMessageEvent},
        typing::SyncTypingEvent,
        room::MediaSource,
        SyncStateEvent,
    },
    Client,
};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tokio::task::JoinHandle;
use tracing::{error, info, warn};

fn media_source_url(source: &MediaSource) -> Option<String> {
    match source {
        MediaSource::Plain(uri) => Some(uri.to_string()),
        MediaSource::Encrypted(file) => Some(file.url.to_string()),
    }
}

fn emit(tx: &broadcast::Sender<SseEvent>, event_type: &str, data: impl serde::Serialize) {
    if let Ok(json) = serde_json::to_string(&data) {
        let _ = tx.send(SseEvent {
            event_type: event_type.to_string(),
            data: json,
        });
    }
}

pub async fn start_sync(
    event_tx: broadcast::Sender<SseEvent>,
    sync_handle: Arc<RwLock<Option<JoinHandle<()>>>>,
    client: Client,
) {
    // Cancel any existing sync task
    {
        let mut handle = sync_handle.write().await;
        if let Some(h) = handle.take() {
            h.abort();
        }
    }

    let tx1 = event_tx.clone();
    client.add_event_handler(
        move |event: OriginalSyncRoomMessageEvent, room: Room| {
            let tx = tx1.clone();
            async move {
                let room_id = room.room_id().to_string();
                let sender = event.sender.to_string();

                let member = room
                    .get_member_no_sync(&event.sender)
                    .await
                    .ok()
                    .flatten();

                let sender_display_name = member.as_ref()
                    .and_then(|m| m.display_name().map(|s| s.to_string()));
                let sender_avatar_url = member.as_ref()
                    .and_then(|m| m.avatar_url().map(|u| u.to_string()));

                let (body, formatted_body, msg_type, media_url) = match &event.content.msgtype {
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
                        event.content.body().to_string(),
                        None,
                        "other".to_string(),
                        None,
                    ),
                };

                let reply_to = event
                    .content
                    .relates_to
                    .as_ref()
                    .and_then(|r| {
                        if let matrix_sdk::ruma::events::room::message::Relation::Reply { in_reply_to } = r {
                            Some(in_reply_to.event_id.to_string())
                        } else {
                            None
                        }
                    });

                let msg = MessageInfo {
                    event_id: event.event_id.to_string(),
                    sender,
                    sender_display_name,
                    sender_avatar_url,
                    body,
                    formatted_body,
                    timestamp: event.origin_server_ts.as_secs().into(),
                    msg_type,
                    reply_to,
                    media_url,
                };

                emit(&tx, "new-message", NewMessageEvent {
                    room_id,
                    message: msg,
                });
            }
        },
    );

    let tx2 = event_tx.clone();
    client.add_event_handler(
        move |event: SyncTypingEvent, room: Room| {
            let tx = tx2.clone();
            async move {
                emit(&tx, "typing", TypingEvent {
                    room_id: room.room_id().to_string(),
                    user_ids: event.content.user_ids.iter().map(|u| u.to_string()).collect(),
                });
            }
        },
    );

    let tx3 = event_tx.clone();
    client.add_event_handler(
        move |event: OriginalSyncReactionEvent, room: Room| {
            let tx = tx3.clone();
            async move {
                emit(&tx, "reaction", ReactionEvent {
                    room_id: room.room_id().to_string(),
                    event_id: event.event_id.to_string(),
                    relates_to: event.content.relates_to.event_id.to_string(),
                    sender: event.sender.to_string(),
                    key: event.content.relates_to.key.clone(),
                });
            }
        },
    );

    let tx4 = event_tx.clone();
    client.add_event_handler(
        move |event: OriginalSyncRoomMemberEvent, room: Room| {
            let tx = tx4.clone();
            async move {
                let membership = event.content.membership.to_string();
                emit(&tx, "member-change", MemberChangeEvent {
                    room_id: room.room_id().to_string(),
                    user_id: event.state_key.to_string(),
                    membership,
                    display_name: event.content.displayname.clone(),
                    avatar_url: event.content.avatar_url.map(|u| u.to_string()),
                });
            }
        },
    );

    let tx5 = event_tx.clone();
    client.add_event_handler(
        move |event: SyncStateEvent<CallMemberEventContent>, room: Room| {
            let tx = tx5.clone();
            async move {
                let room_id = room.room_id().to_string();
                match event {
                    SyncStateEvent::Original(original) => {
                        let user_id = original.state_key.user_id().to_string();
                        let device_id = original.state_key.device_id()
                            .map(|d| d.to_string())
                            .unwrap_or_default();

                        let action = if original.content.active_memberships(None).is_empty() {
                            "leave"
                        } else {
                            "join"
                        };

                        emit(&tx, "call-member", CallMemberChangeEvent {
                            room_id,
                            user_id,
                            device_id,
                            action: action.to_string(),
                        });
                    }
                    SyncStateEvent::Redacted(_) => {}
                }
            }
        },
    );

    // Do initial sync
    info!("Performing initial sync...");
    let tx_sync = event_tx.clone();
    let initial_settings = SyncSettings::default().timeout(std::time::Duration::from_secs(10));
    match client.sync_once(initial_settings).await {
        Ok(response) => {
            info!("Initial sync complete");
            emit(&tx_sync, "sync-ready", serde_json::json!({}));

            let tx_err = event_tx.clone();
            let handle = tokio::spawn(async move {
                let settings = SyncSettings::default().token(response.next_batch);
                if let Err(e) = client.sync(settings).await {
                    error!("Sync error: {}", e);
                    emit(&tx_err, "sync-error", e.to_string());
                }
            });

            let mut lock = sync_handle.write().await;
            *lock = Some(handle);
        }
        Err(e) => {
            warn!("Initial sync failed: {}, starting continuous sync", e);
            emit(&tx_sync, "sync-ready", serde_json::json!({}));

            let tx_err = event_tx.clone();
            let handle = tokio::spawn(async move {
                let settings = SyncSettings::default();
                if let Err(e) = client.sync(settings).await {
                    error!("Sync error: {}", e);
                    emit(&tx_err, "sync-error", e.to_string());
                }
            });

            let mut lock = sync_handle.write().await;
            *lock = Some(handle);
        }
    }
}
