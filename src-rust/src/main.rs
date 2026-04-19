mod auth;
mod commands;
mod error;
mod models;
mod sse;
mod state;
mod sync;

use axum::{
    Router,
    routing::{get, post},
};
use state::AppState;
use std::net::TcpListener;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "hoomestead_chat_server=info,matrix_sdk=warn,matrix_sdk_crypto::backups=error,matrix_sdk::event_handler=error,matrix_sdk_base::sliding_sync=error,matrix_sdk::room::timeline=error,matrix_sdk_crypto=error".into()),
        )
        .init();

    // Determine data directory
    let data_dir = if let Ok(dir) = std::env::var("HOOMESTEAD_DATA_DIR") {
        std::path::PathBuf::from(dir)
    } else if let Some(data_home) = dirs::data_dir() {
        data_home.join("com.hoomestead.chat")
    } else {
        std::path::PathBuf::from("./hoomestead-data")
    };

    std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");
    tracing::info!("Data directory: {}", data_dir.display());

    let state = Arc::new(AppState::new(data_dir));

    let app = Router::new()
        // Auth
        .route("/api/login", post(auth::login))
        .route("/api/logout", post(auth::logout))
        .route("/api/restore-session", post(auth::restore_session))
        .route("/api/recover-encryption", post(auth::recover_encryption))
        .route("/api/avatar", post(auth::set_avatar))
        .route("/api/server-admin-status", post(auth::set_server_admin_status))
        // Spaces
        .route("/api/spaces", get(commands::spaces::get_spaces).post(commands::spaces::create_space))
        .route("/api/spaces/public", get(commands::spaces::get_discoverable_spaces))
        // Rooms
        .route("/api/spaces/{space_id}/rooms", get(commands::rooms::get_space_rooms))
        .route("/api/direct-rooms", get(commands::rooms::get_direct_rooms))
        .route("/api/rooms", post(commands::rooms::create_room))
        .route("/api/dm", post(commands::rooms::create_dm))
        .route("/api/rooms/all", get(commands::rooms::get_all_joined_rooms))
        .route("/api/rooms/join", post(commands::rooms::join_room))
        .route("/api/spaces/{space_id}/add-room", post(commands::rooms::add_room_to_space))
        .route("/api/rooms/{room_id}/leave", post(commands::rooms::leave_room))
        .route("/api/rooms/{room_id}/delete", post(commands::rooms::delete_room))
        // Messages
        .route("/api/rooms/{room_id}/messages", get(commands::messages::get_messages).post(commands::messages::send_message))
        // Members
        .route("/api/rooms/{room_id}/members", get(commands::members::get_room_members))
        .route("/api/friends", get(commands::members::get_friends))
        .route("/api/rooms/{room_id}/kick", post(commands::members::kick_member))
        .route("/api/rooms/{room_id}/ban", post(commands::members::ban_member))
        .route("/api/rooms/{room_id}/power-level", post(commands::members::set_power_level))
        // Media
        .route("/api/media", get(commands::media::get_media_url))
        .route("/api/rooms/{room_id}/upload", post(commands::media::upload_file))
        // Typing
        .route("/api/rooms/{room_id}/typing", post(commands::typing::send_typing))
        // Reactions
        .route("/api/rooms/{room_id}/reactions", post(commands::reactions::send_reaction))
        .route("/api/rooms/{room_id}/redact/{event_id}", post(commands::reactions::redact_event))
        // Receipts
        .route("/api/rooms/{room_id}/read-receipt/{event_id}", post(commands::receipts::send_read_receipt))
        // Voice/Video
        .route("/api/rooms/{room_id}/voice/join", post(commands::voip::join_voice_channel))
        .route("/api/rooms/{room_id}/voice/leave", post(commands::voip::leave_voice_channel))
        .route("/api/turn-server", get(commands::voip::get_turn_server))
        // SSE events
        .route("/api/events", get(sse::events_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    // Bind to port 0 for OS-assigned port, or use HOOMESTEAD_PORT env var
    let port: u16 = std::env::var("HOOMESTEAD_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(0);

    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .expect("Failed to bind");
    let actual_port = listener.local_addr().unwrap().port();

    // Print port as JSON on first line for Electron to read
    println!("{}", serde_json::json!({ "port": actual_port }));

    tracing::info!("Server listening on 127.0.0.1:{}", actual_port);

    let listener = tokio::net::TcpListener::from_std(listener).unwrap();
    axum::serve(listener, app).await.unwrap();
}
