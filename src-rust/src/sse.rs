use axum::response::sse::{Event, KeepAlive, Sse};
use futures::stream::Stream;
use std::convert::Infallible;
use std::sync::Arc;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

use crate::state::AppState;

#[derive(Debug, Clone)]
pub struct SseEvent {
    pub event_type: String,
    pub data: String,
}

pub async fn events_handler(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.event_tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|result| {
        match result {
            Ok(sse_event) => Some(Ok(Event::default()
                .event(sse_event.event_type)
                .data(sse_event.data))),
            Err(_) => None, // skip lagged messages
        }
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}
