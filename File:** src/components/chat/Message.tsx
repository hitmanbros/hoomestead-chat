// The reply_to check could be more robust
const reply_to =
    original.content.relates_to.as_ref().and_then(|r| {
        if let matrix_sdk::ruma::events::room::message::Relation::Reply {
            in_reply_to,
        } = r
        {
            Some(in_reply_to.event_id.to_string())
        } else {
            None
        }
    });
