mod auth;
mod commands;
mod models;
mod state;
mod sync;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Enable WebRTC in webkit2gtk before any window is created
    #[cfg(target_os = "linux")]
    {
        // webkit2gtk reads WEBKIT_FEATURE_LIST but we need the programmatic approach
        // Set env var for GStreamer WebRTC support
        std::env::set_var("GST_PLUGIN_FEATURE_RANK", "vp8enc:256,vp9enc:256,opusenc:256");
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "hoomestead_chat_lib=info,matrix_sdk=warn,matrix_sdk_crypto::backups=error,matrix_sdk::event_handler=error,matrix_sdk_base::sliding_sync=error,matrix_sdk::room::timeline=error,matrix_sdk_crypto=error".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .setup(|app| {
            // Enable WebRTC on Linux (webkit2gtk) — must happen before JS context loads
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    window.with_webview(|webview| {
                        use webkit2gtk::{SettingsExt, WebViewExt};
                        let wv = webview.inner();
                        if let Some(settings) = wv.settings() {
                            settings.set_enable_webrtc(true);
                            settings.set_enable_media_stream(true);
                            settings.set_media_playback_requires_user_gesture(false);
                            tracing::info!("WebRTC enabled on webkit2gtk");
                        }
                    }).ok();
                }
            }
            Ok(())
        })
        .on_page_load(|webview, _payload| {
            // Re-apply WebRTC settings on every page load to ensure they persist
            #[cfg(target_os = "linux")]
            {
                let _ = webview.with_webview(|wv| {
                    use webkit2gtk::{SettingsExt, WebViewExt};
                    let inner = wv.inner();
                    if let Some(settings) = inner.settings() {
                        settings.set_enable_webrtc(true);
                        settings.set_enable_media_stream(true);
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            auth::login,
            auth::logout,
            auth::restore_session,
            auth::recover_encryption,
            auth::set_avatar,
            auth::set_server_admin_status,
            commands::spaces::get_spaces,
            commands::spaces::create_space,
            commands::rooms::get_space_rooms,
            commands::rooms::get_direct_rooms,
            commands::rooms::create_room,
            commands::rooms::create_dm,
            commands::rooms::join_room,
            commands::rooms::leave_room,
            commands::messages::get_messages,
            commands::messages::send_message,
            commands::members::get_room_members,
            commands::members::get_friends,
            commands::members::kick_member,
            commands::members::ban_member,
            commands::members::set_power_level,
            commands::media::get_media_url,
            commands::media::upload_file,
            commands::typing::send_typing,
            commands::reactions::send_reaction,
            commands::reactions::redact_event,
            commands::receipts::send_read_receipt,
            commands::voip::get_turn_server,
            commands::voip::send_call_invite,
            commands::voip::send_call_answer,
            commands::voip::send_call_candidates,
            commands::voip::send_call_hangup,
            commands::voip::join_voice_channel,
            commands::voip::leave_voice_channel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
