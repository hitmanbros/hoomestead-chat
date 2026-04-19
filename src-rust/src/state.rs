use matrix_sdk::Client;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{broadcast, RwLock};
use tokio::task::JoinHandle;

use crate::sse::SseEvent;

pub struct AppState {
    pub client: Arc<RwLock<Option<Client>>>,
    pub sync_handle: Arc<RwLock<Option<JoinHandle<()>>>>,
    pub is_server_admin: AtomicBool,
    pub data_dir: PathBuf,
    pub event_tx: broadcast::Sender<SseEvent>,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> Self {
        let (event_tx, _) = broadcast::channel(256);
        Self {
            client: Arc::new(RwLock::new(None)),
            sync_handle: Arc::new(RwLock::new(None)),
            is_server_admin: AtomicBool::new(false),
            data_dir,
            event_tx,
        }
    }

    pub fn set_server_admin(&self, val: bool) {
        self.is_server_admin.store(val, Ordering::SeqCst);
    }

    pub fn get_server_admin(&self) -> bool {
        self.is_server_admin.load(Ordering::SeqCst)
    }
}
