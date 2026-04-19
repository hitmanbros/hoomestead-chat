use matrix_sdk::Client;

#[tokio::test]
async fn test_matrix_connection() {
    let client = Client::builder()
        .homeserver_url("https://matrix.example.com")
        .build()
        .await;

    assert!(
        client.is_ok(),
        "Failed to connect to homeserver: {:?}",
        client.err()
    );
    let client = client.unwrap();
    println!("Connected to homeserver: {}", client.homeserver());
}

#[tokio::test]
async fn test_login() {
    let client = Client::builder()
        .homeserver_url("https://matrix.example.com")
        .build()
        .await
        .expect("Failed to build client");

    let login_result = client
        .matrix_auth()
        .login_username("bryan", "IlpwAlw98!")
        .initial_device_display_name("Hoomestead Chat Test")
        .await;

    assert!(
        login_result.is_ok(),
        "Login failed: {:?}",
        login_result.err()
    );

    let user_id = client.user_id().expect("No user ID");
    println!("Logged in as: {}", user_id);
    assert_eq!(user_id.as_str(), "@user:example.com");

    // Test getting display name
    let display_name = client.account().get_display_name().await;
    println!("Display name: {:?}", display_name);

    println!("User ID verified, login works!");

    // Logout to clean up test device
    let _ = client.matrix_auth().logout().await;
}

#[tokio::test]
async fn test_get_spaces_and_rooms() {
    let client = Client::builder()
        .homeserver_url("https://matrix.example.com")
        .build()
        .await
        .expect("Failed to build client");

    client
        .matrix_auth()
        .login_username("bryan", "IlpwAlw98!")
        .initial_device_display_name("Hoomestead Chat Test Spaces")
        .await
        .expect("Login failed");

    // Do a short sync to populate rooms
    use matrix_sdk::config::SyncSettings;
    let sync_settings = SyncSettings::default().timeout(std::time::Duration::from_secs(5));
    let _ = client.sync_once(sync_settings).await;

    // Check for spaces
    let mut space_count = 0;
    for room in client.joined_rooms() {
        if room.is_space() {
            space_count += 1;
            println!(
                "Space: {} ({})",
                room.name().unwrap_or_default(),
                room.room_id()
            );
        }
    }
    println!("Total spaces found: {}", space_count);

    // Check for regular rooms
    let mut room_count = 0;
    for room in client.joined_rooms() {
        if !room.is_space() {
            room_count += 1;
            println!(
                "Room: {} ({})",
                room.name().unwrap_or_default(),
                room.room_id()
            );
        }
    }
    println!("Total rooms found: {}", room_count);

    let _ = client.matrix_auth().logout().await;
}

#[tokio::test]
async fn test_messages_and_send() {
    use matrix_sdk::{config::SyncSettings, room::MessagesOptions};
    use matrix_sdk::ruma::{
        events::{
            room::message::{MessageType, RoomMessageEventContent},
            AnySyncTimelineEvent, SyncMessageLikeEvent,
        },
        UInt,
    };

    let client = Client::builder()
        .homeserver_url("https://matrix.example.com")
        .build()
        .await
        .expect("Failed to build client");

    client
        .matrix_auth()
        .login_username("bryan", "IlpwAlw98!")
        .initial_device_display_name("Hoomestead Chat Test Messages")
        .await
        .expect("Login failed");

    let sync_settings = SyncSettings::default().timeout(std::time::Duration::from_secs(5));
    let _ = client.sync_once(sync_settings).await;

    // Find a non-space room to test with
    let test_room = client
        .joined_rooms()
        .into_iter()
        .find(|r| !r.is_space() && r.name().is_some())
        .expect("No rooms found to test with");

    println!("Testing with room: {} ({})", test_room.name().unwrap_or_default(), test_room.room_id());

    // Test fetching messages
    let mut options = MessagesOptions::backward();
    options.limit = UInt::from(10u32);
    let messages = test_room.messages(options).await.expect("Failed to get messages");
    println!("Fetched {} messages", messages.chunk.len());

    for event in &messages.chunk {
        let raw = event.raw();
        if let Ok(AnySyncTimelineEvent::MessageLike(
            matrix_sdk::ruma::events::AnySyncMessageLikeEvent::RoomMessage(msg_event),
        )) = raw.deserialize()
        {
            if let SyncMessageLikeEvent::Original(original) = msg_event {
                if let MessageType::Text(text) = &original.content.msgtype {
                    println!("  [{:?}] {}: {}", original.origin_server_ts, original.sender, text.body);
                }
            }
        }
    }

    // Test sending a message
    let content = RoomMessageEventContent::text_plain("Test message from Hoomestead Chat integration test");
    let send_result = test_room.send(content).await;
    assert!(send_result.is_ok(), "Failed to send message: {:?}", send_result.err());
    println!("Message sent! Event ID: {}", send_result.unwrap().event_id);

    let _ = client.matrix_auth().logout().await;
}

#[tokio::test]
async fn test_reactions_and_read_receipts() {
    use matrix_sdk::config::SyncSettings;
    use matrix_sdk::ruma::{
        api::client::receipt::create_receipt::v3::ReceiptType,
        events::{
            reaction::ReactionEventContent,
            receipt::ReceiptThread,
            relation::Annotation,
            room::message::RoomMessageEventContent,
        },
    };

    let client = Client::builder()
        .homeserver_url("https://matrix.example.com")
        .build()
        .await
        .expect("Failed to build client");

    client
        .matrix_auth()
        .login_username("bryan", "IlpwAlw98!")
        .initial_device_display_name("Hoomestead Chat Test Reactions")
        .await
        .expect("Login failed");

    let sync_settings = SyncSettings::default().timeout(std::time::Duration::from_secs(5));
    let _ = client.sync_once(sync_settings).await;

    let test_room = client
        .joined_rooms()
        .into_iter()
        .find(|r| !r.is_space() && r.name().is_some())
        .expect("No rooms found");

    println!("Testing reactions in room: {} ({})", test_room.name().unwrap_or_default(), test_room.room_id());

    // Send a test message to react to
    let content = RoomMessageEventContent::text_plain("Testing reactions from integration test");
    let send_result = test_room.send(content).await.expect("Failed to send message");
    let msg_event_id = send_result.event_id;
    println!("Sent test message: {}", msg_event_id);

    // Send a reaction to that message
    let annotation = Annotation::new(msg_event_id.clone(), "👍".to_owned());
    let reaction_content = ReactionEventContent::new(annotation);
    let reaction_result = test_room.send(reaction_content).await;
    assert!(reaction_result.is_ok(), "Failed to send reaction: {:?}", reaction_result.err());
    println!("Reaction sent! Event ID: {}", reaction_result.unwrap().event_id);

    // Send a read receipt
    let receipt_result = test_room
        .send_single_receipt(ReceiptType::Read, ReceiptThread::Unthreaded, msg_event_id.clone())
        .await;
    assert!(receipt_result.is_ok(), "Failed to send read receipt: {:?}", receipt_result.err());
    println!("Read receipt sent for: {}", msg_event_id);

    // Check unread notification counts
    let counts = test_room.unread_notification_counts();
    println!("Unread notifications: {}, highlights: {}", counts.notification_count, counts.highlight_count);

    let _ = client.matrix_auth().logout().await;
}
