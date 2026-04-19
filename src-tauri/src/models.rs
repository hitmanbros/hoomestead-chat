use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginRequest {
    pub homeserver: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct UserInfo {
    pub user_id: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SpaceInfo {
    pub room_id: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub topic: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RoomInfo {
    pub room_id: String,
    pub name: Option<String>,
    pub topic: Option<String>,
    pub is_direct: bool,
    pub unread_count: u64,
    pub avatar_url: Option<String>,
    /// For DMs: the other user's Matrix ID (used for consistent color hashing)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub other_user_id: Option<String>,
    /// Channel type: "text", "voice", or "link"
    pub channel_type: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MessageInfo {
    pub event_id: String,
    pub sender: String,
    pub sender_display_name: Option<String>,
    pub sender_avatar_url: Option<String>,
    pub body: String,
    pub formatted_body: Option<String>,
    pub timestamp: u64,
    pub msg_type: String,
    pub reply_to: Option<String>,
    pub media_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemberInfo {
    pub user_id: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub presence: String,
    pub power_level: i64,
    pub is_server_admin: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FriendInfo {
    pub user_id: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub presence: String,
    pub room_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TypingEvent {
    pub room_id: String,
    pub user_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NewMessageEvent {
    pub room_id: String,
    pub message: MessageInfo,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReactionEvent {
    pub room_id: String,
    pub event_id: String,
    pub relates_to: String,
    pub sender: String,
    pub key: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CallInviteEvent {
    pub room_id: String,
    pub sender: String,
    pub call_id: String,
    pub sdp: String,
    pub lifetime: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CallAnswerEvent {
    pub room_id: String,
    pub sender: String,
    pub call_id: String,
    pub sdp: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CallCandidatesEvent {
    pub room_id: String,
    pub sender: String,
    pub call_id: String,
    pub candidates: Vec<IceCandidateInfo>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IceCandidateInfo {
    pub candidate: String,
    pub sdp_mid: String,
    pub sdp_m_line_index: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CallHangupEvent {
    pub room_id: String,
    pub sender: String,
    pub call_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CallMemberChangeEvent {
    pub room_id: String,
    pub user_id: String,
    pub device_id: String,
    pub action: String, // "join" or "leave"
}

#[derive(Debug, Clone, Serialize)]
pub struct MemberChangeEvent {
    pub room_id: String,
    pub user_id: String,
    pub membership: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}
