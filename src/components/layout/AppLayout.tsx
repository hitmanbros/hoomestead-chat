import { useEffect } from "react";
import ServerSidebar from "./ServerSidebar";
import ChannelSidebar from "./ChannelSidebar";
import HomeSidebar from "./HomeSidebar";
import MainContent from "./MainContent";
import MemberSidebar from "./MemberSidebar";
import Toasts from "../common/Toasts";
import { useSpaceStore } from "../../store/spaceStore";
import { useRoomStore } from "../../store/roomStore";
import { useMessageStore } from "../../store/messageStore";
import { useMemberStore } from "../../store/memberStore";
import { useUIStore } from "../../store/uiStore";
import {
  connectEvents,
  onNewMessage,
  onTyping,
  onPresence,
  onReaction,
  onMemberChange,
  onSyncReady,
} from "../../api/events";

export default function AppLayout() {
  const selectedSpaceId = useSpaceStore((s) => s.selectedSpaceId);
  const selectedRoomId = useRoomStore((s) => s.selectedRoomId);
  const showMemberSidebar = useUIStore((s) => s.showMemberSidebar);
  const addMessage = useMessageStore((s) => s.addMessage);
  const addReaction = useMessageStore((s) => s.addReaction);
  const setTypingUsers = useMemberStore((s) => s.setTypingUsers);
  const updatePresence = useMemberStore((s) => s.updatePresence);
  const fetchMembers = useMemberStore((s) => s.fetchMembers);
  const fetchSpaces = useSpaceStore((s) => s.fetchSpaces);
  const selectSpace = useSpaceStore((s) => s.selectSpace);

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    // Connect to SSE event stream
    unlisteners.push(connectEvents());

    unlisteners.push(
      onSyncReady(async () => {
        await fetchSpaces();
        const currentSpaces = useSpaceStore.getState().spaces;
        if (currentSpaces.length > 0 && !useSpaceStore.getState().selectedSpaceId) {
          selectSpace(currentSpaces[0].room_id);
        }
      }),
    );

    unlisteners.push(
      onNewMessage((event) => {
        addMessage(event.room_id, event.message);
      }),
    );

    unlisteners.push(
      onReaction((event) => {
        addReaction(event.room_id, event.relates_to, {
          eventId: event.event_id,
          sender: event.sender,
          key: event.key,
        });
      }),
    );

    unlisteners.push(
      onTyping((event) => {
        if (event.room_id === useRoomStore.getState().selectedRoomId) {
          setTypingUsers(event.user_ids);
        }
      }),
    );

    unlisteners.push(
      onPresence((event) => {
        updatePresence(event.user_id, event.presence);
      }),
    );

    unlisteners.push(
      onMemberChange((event) => {
        const currentRoom = useRoomStore.getState().selectedRoomId;
        if (currentRoom && event.room_id === currentRoom) {
          fetchMembers(currentRoom);
        }
      }),
    );

    return () => unlisteners.forEach((fn) => fn());
  }, []);

  return (
    <>
      <div className="app-layout">
        <ServerSidebar />
        {selectedSpaceId ? <ChannelSidebar /> : <HomeSidebar />}
        <MainContent />
        {selectedRoomId && showMemberSidebar && <MemberSidebar />}
      </div>
      <Toasts />
    </>
  );
}
