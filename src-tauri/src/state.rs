use matrix_sdk::Client;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;

pub struct AppState {
    pub client: Arc<RwLock<Option<Client>>>,
    pub sync_handle: Arc<RwLock<Option<JoinHandle<()>>>>,
    pub is_server_admin: AtomicBool,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(RwLock::new(None)),
            sync_handle: Arc::new(RwLock::new(None)),
            is_server_admin: AtomicBool::new(false),
        }
    }

    pub fn set_server_admin(&self, val: bool) {
        self.is_server_admin.store(val, Ordering::SeqCst);
    }

    pub fn get_server_admin(&self) -> bool {
        self.is_server_admin.load(Ordering::SeqCst)
    }
}
