// The sync task management could be improved to prevent overlapping tasks
let mut handle = sync_handle.write().await;
if let Some(h) = handle.take() {
    h.abort();
}
