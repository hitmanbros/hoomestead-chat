let homeserver_url = if homeserver.starts_with("http://") || homeserver.starts_with("https://") {
    homeserver.to_string()
} else {
    format!("https://{}", homeserver)
};
