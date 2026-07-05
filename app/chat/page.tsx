"use client";

import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useRouter } from "next/navigation";
import "./chat.css";

import { supabase } from "@/src/lib/supabase";
import {
  getUsers,
  createProfile,
  getMyChats,
  getOrCreateDirectChat,
  createGroupChat,
  getMessages,
  sendMessage
} from "@/src/lib/chat";

import {
  encryptMessage,
  decryptMessage,
  generateKeyFromChat
} from "@/src/lib/crypto";

declare global {
  interface Window {
    __pigeonEmojiScriptLoaded?: boolean;
  }
}

type BannerType = "info" | "error";
type CallType = "audio" | "video";

type ChatMember = {
  id: string;
  email: string;
};

type ChatItem = {
  id: string;
  name?: string;
  title: string;
  is_group: boolean;
  created_at?: string;
  members: ChatMember[];
};

type IncomingCall = {
  chatId: string;
  fromUserId: string;
  fromEmail: string;
  callType: CallType;
} | null;

type RemoteMedia = {
  userId: string;
  email: string;
  stream: MediaStream;
};

type GifItem = {
  id: string;
  label: string;
  emoji: string;
};

const GIF_MESSAGE_PREFIX = "__PIGEON_GIF__:";

const PRESET_GIFS: GifItem[] = [
  { id: "celebrate", label: "Celebrate", emoji: "🎉" },
  { id: "heart", label: "Love", emoji: "💖" },
  { id: "laugh", label: "Laugh", emoji: "😂" },
  { id: "clap", label: "Clap", emoji: "👏" },
  { id: "wow", label: "Wow", emoji: "😮" },
  { id: "party", label: "Party", emoji: "🥳" },
  { id: "fire", label: "Fire", emoji: "🔥" },
  { id: "yes", label: "Yes", emoji: "👍" }
];

const isGifMessage = (value: string) =>
  typeof value === "string" && value.startsWith(GIF_MESSAGE_PREFIX);

const getGifIdFromMessage = (value: string) =>
  isGifMessage(value) ? value.slice(GIF_MESSAGE_PREFIX.length) : "";

export default function ChatPage() {
  const router = useRouter();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLElement | null>(null);
  const emojiPickerWrapRef = useRef<HTMLDivElement | null>(null);

  const signalChannelRef = useRef<any>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map()
  );
  const localStreamRef = useRef<MediaStream | null>(null);

  const currentUserRef = useRef<any>(null);
  const currentChatIdRef = useRef<string | null>(null);
  const inCallRef = useRef(false);
  const callTypeRef = useRef<CallType | null>(null);
  const callChatIdRef = useRef<string | null>(null);

  const [user, setUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [messages, setMessages] = useState<any[]>([]);

  const [chatId, setChatId] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<Uint8Array | null>(null);

  const [input, setInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedGroupUsers, setSelectedGroupUsers] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);

  const [bannerText, setBannerText] = useState("");
  const [bannerType, setBannerType] = useState<BannerType>("info");

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);

  const [incomingCall, setIncomingCall] = useState<IncomingCall>(null);
  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState<CallType | null>(null);
  const [callChatId, setCallChatId] = useState<string | null>(null);
  const [callMembers, setCallMembers] = useState<ChatMember[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<RemoteMedia[]>([]);

  const currentUserInitial = user?.email?.charAt(0)?.toUpperCase() || "U";

  const filteredChats = useMemo(() => {
    const cleanSearch = searchTerm.toLowerCase().trim();

    if (!cleanSearch) return chats;

    return chats.filter((chat) =>
      (chat.title || "").toLowerCase().includes(cleanSearch)
    );
  }, [chats, searchTerm]);

  const filteredUsers = useMemo(() => {
    const cleanSearch = searchTerm.toLowerCase().trim();

    if (!cleanSearch) return users;

    return users.filter((u) =>
      (u.email || "").toLowerCase().includes(cleanSearch)
    );
  }, [users, searchTerm]);

  const activeChat = useMemo(() => {
    return chats.find((chat) => String(chat.id) === String(chatId)) || null;
  }, [chats, chatId]);

  const formatMessageTime = (value: string) => {
    if (!value) return "";

    try {
      return new Intl.DateTimeFormat([], {
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(value));
    } catch {
      return "";
    }
  };

  const getChatAvatar = (chat: ChatItem | null) => {
    if (!chat) return "🕊️";
    if (chat.is_group) return "👥";
    return chat.title?.charAt(0)?.toUpperCase() || "💬";
  };

  const showInfo = (message: string) => {
    setBannerType("info");
    setBannerText(message);
  };

  const showError = (message: string) => {
    setBannerType("error");
    setBannerText(message);
  };

  const clearBanner = () => {
    setBannerText("");
  };

  const upsertCallMember = (userId: string, email: string) => {
    setCallMembers((current) => {
      const existing = current.find((member) => member.id === userId);

      if (existing) {
        return current.map((member) =>
          member.id === userId ? { id: userId, email } : member
        );
      }

      return [...current, { id: userId, email }];
    });
  };

  const removeCallMember = (userId: string) => {
    setCallMembers((current) => current.filter((member) => member.id !== userId));
  };

  const upsertRemoteMedia = (
    userId: string,
    email: string,
    stream: MediaStream
  ) => {
    setRemoteMedia((current) => {
      const existing = current.find((item) => item.userId === userId);

      if (existing) {
        return current.map((item) =>
          item.userId === userId ? { userId, email, stream } : item
        );
      }

      return [...current, { userId, email, stream }];
    });

    upsertCallMember(userId, email);
  };

  const removeRemoteMedia = (userId: string) => {
    setRemoteMedia((current) => current.filter((item) => item.userId !== userId));
  };

  const queueIceCandidate = (userId: string, candidate: RTCIceCandidateInit) => {
    const existing = pendingCandidatesRef.current.get(userId) || [];
    pendingCandidatesRef.current.set(userId, [...existing, candidate]);
  };

  const flushPendingCandidates = async (userId: string) => {
    const pc = peerConnectionsRef.current.get(userId);
    const pending = pendingCandidatesRef.current.get(userId) || [];

    if (!pc || pending.length === 0) return;

    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("addIceCandidate error:", error);
      }
    }

    pendingCandidatesRef.current.delete(userId);
  };

  const stopLocalMedia = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    setLocalStream(null);
  };

  const destroyPeerConnection = (remoteUserId: string) => {
    const pc = peerConnectionsRef.current.get(remoteUserId);

    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch (error) {
        console.error("close peer connection error:", error);
      }
    }

    peerConnectionsRef.current.delete(remoteUserId);
    pendingCandidatesRef.current.delete(remoteUserId);
    removeRemoteMedia(remoteUserId);
    removeCallMember(remoteUserId);
  };

  const destroyAllPeerConnections = () => {
    const ids = Array.from(peerConnectionsRef.current.keys());
    ids.forEach((id) => destroyPeerConnection(id));
  };

  const broadcastSignal = useCallback(async (event: string, payload: any) => {
    if (!signalChannelRef.current) return;

    try {
      await signalChannelRef.current.send({
        type: "broadcast",
        event,
        payload
      });
    } catch (error) {
      console.error(`broadcast ${event} error:`, error);
    }
  }, []);

  const startLocalMedia = async (nextCallType: CallType) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Your browser does not support calling.");
    }

    stopLocalMedia();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: nextCallType === "video"
    });

    localStreamRef.current = stream;
    setLocalStream(stream);

    return stream;
  };

  const getOrCreatePeerConnection = useCallback(
    async (remoteUserId: string, remoteEmail: string) => {
      const existing = peerConnectionsRef.current.get(remoteUserId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" }
        ]
      });

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          const alreadyAdded = pc
            .getSenders()
            .some((sender) => sender.track?.id === track.id);

          if (!alreadyAdded) {
            pc.addTrack(track, localStreamRef.current as MediaStream);
          }
        });
      }

      pc.onicecandidate = async (event) => {
        if (!event.candidate) return;
        if (!currentUserRef.current || !callChatIdRef.current) return;

        await broadcastSignal("signal", {
          chatId: callChatIdRef.current,
          fromUserId: currentUserRef.current.id,
          fromEmail: currentUserRef.current.email,
          toUserId: remoteUserId,
          candidate: event.candidate.toJSON()
        });
      };

      pc.ontrack = (event) => {
        const stream = event.streams?.[0];
        if (stream) {
          upsertRemoteMedia(remoteUserId, remoteEmail, stream);
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed" ||
          pc.connectionState === "disconnected"
        ) {
          destroyPeerConnection(remoteUserId);
        }
      };

      peerConnectionsRef.current.set(remoteUserId, pc);
      return pc;
    },
    [broadcastSignal]
  );

  const createOfferForUser = useCallback(
    async (remoteUserId: string, remoteEmail: string) => {
      const pc = await getOrCreatePeerConnection(remoteUserId, remoteEmail);

      if (pc.signalingState !== "stable") return;
      if (!currentUserRef.current || !callChatIdRef.current) return;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await broadcastSignal("signal", {
        chatId: callChatIdRef.current,
        fromUserId: currentUserRef.current.id,
        fromEmail: currentUserRef.current.email,
        toUserId: remoteUserId,
        description: pc.localDescription
      });
    },
    [broadcastSignal, getOrCreatePeerConnection]
  );

  const leaveCall = useCallback(
    async (sendSignal: boolean, infoMessage?: string) => {
      if (sendSignal && currentUserRef.current && callChatIdRef.current) {
        await broadcastSignal("leave-call", {
          chatId: callChatIdRef.current,
          fromUserId: currentUserRef.current.id,
          fromEmail: currentUserRef.current.email
        });
      }

      destroyAllPeerConnections();
      stopLocalMedia();

      setIncomingCall(null);
      setInCall(false);
      setCallType(null);
      setCallChatId(null);
      setCallMembers([]);
      setRemoteMedia([]);

      inCallRef.current = false;
      callTypeRef.current = null;
      callChatIdRef.current = null;

      if (infoMessage) {
        showInfo(infoMessage);
      }
    },
    [broadcastSignal]
  );

  const ensureSignalChannel = useCallback(async () => {
    if (!user) return null;
    if (signalChannelRef.current) return signalChannelRef.current;

    const channel = supabase
      .channel("pigeon-call-signals", {
        config: {
          broadcast: {
            self: false
          }
        }
      })
      .on("broadcast", { event: "ring" }, ({ payload }: any) => {
        if (!payload || !currentUserRef.current) return;
        if (payload.fromUserId === currentUserRef.current.id) return;
        if (!Array.isArray(payload.recipientIds)) return;
        if (!payload.recipientIds.includes(currentUserRef.current.id)) return;
        if (inCallRef.current) return;

        setIncomingCall({
          chatId: payload.chatId,
          fromUserId: payload.fromUserId,
          fromEmail: payload.fromEmail,
          callType: payload.callType
        });

        showInfo(
          `${payload.fromEmail} is calling (${payload.callType === "video" ? "video" : "voice"}).`
        );
      })
      .on("broadcast", { event: "join-call" }, async ({ payload }: any) => {
        if (!payload || !currentUserRef.current) return;
        if (payload.fromUserId === currentUserRef.current.id) return;
        if (!inCallRef.current) return;
        if (!callChatIdRef.current) return;
        if (payload.chatId !== callChatIdRef.current) return;

        upsertCallMember(payload.fromUserId, payload.fromEmail);

        try {
          await createOfferForUser(payload.fromUserId, payload.fromEmail);
        } catch (error) {
          console.error("join-call createOffer error:", error);
        }
      })
      .on("broadcast", { event: "leave-call" }, ({ payload }: any) => {
        if (!payload || !currentUserRef.current) return;
        if (payload.fromUserId === currentUserRef.current.id) return;
        if (!callChatIdRef.current) return;
        if (payload.chatId !== callChatIdRef.current) return;

        destroyPeerConnection(payload.fromUserId);
      })
      .on("broadcast", { event: "signal" }, async ({ payload }: any) => {
        if (!payload || !currentUserRef.current) return;
        if (payload.toUserId !== currentUserRef.current.id) return;
        if (payload.fromUserId === currentUserRef.current.id) return;
        if (!inCallRef.current) return;
        if (!callChatIdRef.current) return;
        if (payload.chatId !== callChatIdRef.current) return;

        upsertCallMember(payload.fromUserId, payload.fromEmail);

        try {
          if (payload.candidate) {
            const pc = peerConnectionsRef.current.get(payload.fromUserId);

            if (pc?.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } else {
              queueIceCandidate(payload.fromUserId, payload.candidate);
            }

            return;
          }

          if (payload.description) {
            const pc = await getOrCreatePeerConnection(
              payload.fromUserId,
              payload.fromEmail
            );

            if (payload.description.type === "offer") {
              await pc.setRemoteDescription(
                new RTCSessionDescription(payload.description)
              );

              await flushPendingCandidates(payload.fromUserId);

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              await broadcastSignal("signal", {
                chatId: callChatIdRef.current,
                fromUserId: currentUserRef.current.id,
                fromEmail: currentUserRef.current.email,
                toUserId: payload.fromUserId,
                description: pc.localDescription
              });
            } else if (payload.description.type === "answer") {
              await pc.setRemoteDescription(
                new RTCSessionDescription(payload.description)
              );

              await flushPendingCandidates(payload.fromUserId);
            }
          }
        } catch (error) {
          console.error("signal handling error:", error);
        }
      });

    await new Promise<void>((resolve) => {
      channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          resolve();
        }
      });
    });

    signalChannelRef.current = channel;
    return channel;
  }, [broadcastSignal, createOfferForUser, getOrCreatePeerConnection, user]);

  const refreshUsersAndChats = useCallback(async (currentUserId: string) => {
    const allUsers = await getUsers();
    setUsers(allUsers.filter((u) => u.id !== currentUserId));

    const myChats = await getMyChats(currentUserId);
    setChats(myChats as ChatItem[]);
  }, []);

  const loadMessages = useCallback(async (id: string, chatKey: Uint8Array) => {
    const data = await getMessages(id);

    const decrypted = await Promise.all(
      data.map(async (m: any) => {
        try {
          const text = await decryptMessage(
            JSON.parse(m.ciphertext),
            JSON.parse(m.iv),
            chatKey
          );

          return { ...m, text };
        } catch {
          return {
            ...m,
            text: "⚠️ cannot decrypt",
            sender_email: m.sender_email || "Unknown user"
          };
        }
      })
    );

    setMessages(decrypted);
  }, []);

  const sendEncryptedContent = useCallback(
    async (plainText: string) => {
      if (!chatId || !user || !activeKey) return;

      const encrypted = await encryptMessage(plainText, activeKey);

      await sendMessage({
        chat_id: chatId,
        sender_id: user.id,
        ciphertext: JSON.stringify(encrypted.encrypted),
        iv: JSON.stringify(encrypted.iv)
      });

      await loadMessages(chatId, activeKey);
      await refreshUsersAndChats(user.id);
    },
    [activeKey, chatId, loadMessages, refreshUsersAndChats, user]
  );

  const handleSendGif = async (gifId: string) => {
    if (!chatId) {
      showInfo("Open a chat first.");
      return;
    }

    clearBanner();

    try {
      await sendEncryptedContent(`${GIF_MESSAGE_PREFIX}${gifId}`);
      setShowGifPicker(false);
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Could not send GIF.");
    }
  };

  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

  useEffect(() => {
    currentChatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    inCallRef.current = inCall;
  }, [inCall]);

  useEffect(() => {
    callTypeRef.current = callType;
  }, [callType]);

  useEffect(() => {
    callChatIdRef.current = callChatId;
  }, [callChatId]);

  useEffect(() => {
    if (!bannerText) return;

    const timeout = setTimeout(() => {
      setBannerText("");
    }, 4000);

    return () => clearTimeout(timeout);
  }, [bannerText]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);

      const { data, error } = await supabase.auth.getUser();

      if (error || !data?.user) {
        router.replace("/login");
        return;
      }

      setUser(data.user);
      await createProfile(data.user);
      await refreshUsersAndChats(data.user.id);

      setLoading(false);
    };

    init();
  }, [router, refreshUsersAndChats]);

  useEffect(() => {
    if (!user) return;

    ensureSignalChannel();

    return () => {
      if (signalChannelRef.current) {
        supabase.removeChannel(signalChannelRef.current);
        signalChannelRef.current = null;
      }
    };
  }, [ensureSignalChannel, user]);

  useEffect(() => {
    if (!chatId || !activeKey) return;

    const channel = supabase
      .channel(`messages-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`
        },
        async () => {
          await loadMessages(chatId, activeKey);

          if (user?.id) {
            await refreshUsersAndChats(user.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, activeKey, loadMessages, refreshUsersAndChats, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.customElements?.get("emoji-picker")) return;
    if (window.__pigeonEmojiScriptLoaded) return;

    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://cdn.jsdelivr.net/npm/emoji-picker-element@^1/index.js";
    script.onload = () => {
      window.__pigeonEmojiScriptLoaded = true;
    };

    document.head.appendChild(script);
    window.__pigeonEmojiScriptLoaded = true;
  }, []);

  useEffect(() => {
    const picker = emojiPickerRef.current as any;
    if (!picker) return;

    const handleEmojiClick = (event: any) => {
      const emoji = event?.detail?.unicode;
      if (!emoji) return;

      setInput((current) => `${current}${emoji}`);
    };

    picker.addEventListener("emoji-click", handleEmojiClick);

    return () => {
      picker.removeEventListener("emoji-click", handleEmojiClick);
    };
  }, [showEmojiPicker]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!emojiPickerWrapRef.current) return;

      if (!emojiPickerWrapRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
        setShowGifPicker(false);
      }
    };

    if (showEmojiPicker || showGifPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showEmojiPicker, showGifPicker]);

  useEffect(() => {
    return () => {
      destroyAllPeerConnections();
      stopLocalMedia();

      if (signalChannelRef.current) {
        supabase.removeChannel(signalChannelRef.current);
        signalChannelRef.current = null;
      }
    };
  }, []);

  const openChatById = async (nextChatId: string) => {
    const chat = chats.find((item) => String(item.id) === String(nextChatId));
    if (!chat) {
      throw new Error("Chat not found.");
    }

    const chatKey = await generateKeyFromChat(nextChatId);
    setChatId(nextChatId);
    setActiveKey(chatKey);
    await loadMessages(nextChatId, chatKey);

    return chat;
  };

  const joinLocalCall = async (
    targetChatId: string,
    nextCallType: CallType,
    chat: ChatItem
  ) => {
    await ensureSignalChannel();
    await startLocalMedia(nextCallType);

    setIncomingCall(null);
    setInCall(true);
    setCallType(nextCallType);
    setCallChatId(targetChatId);
    setRemoteMedia([]);
    setCallMembers([{ id: user.id, email: user.email }]);

    inCallRef.current = true;
    callTypeRef.current = nextCallType;
    callChatIdRef.current = targetChatId;

    upsertCallMember(user.id, user.email);

    if (String(chatId) !== String(targetChatId)) {
      const chatKey = await generateKeyFromChat(targetChatId);
      setChatId(targetChatId);
      setActiveKey(chatKey);
      await loadMessages(targetChatId, chatKey);
    }
  };

  const startOutgoingCall = async (nextCallType: CallType) => {
    if (!activeChat || !chatId || !user) {
      showInfo("Open a chat first.");
      return;
    }

    if (inCallRef.current) {
      showInfo("You are already in a call.");
      return;
    }

    clearBanner();

    try {
      await joinLocalCall(chatId, nextCallType, activeChat);

      const recipientIds = (activeChat.members || [])
        .map((member) => member.id)
        .filter((id) => id !== user.id);

      if (recipientIds.length === 0) {
        showError("There is nobody else in this chat to call.");
        await leaveCall(false);
        return;
      }

      await broadcastSignal("ring", {
        chatId,
        chatTitle: activeChat.title,
        fromUserId: user.id,
        fromEmail: user.email,
        callType: nextCallType,
        recipientIds
      });

      showInfo(
        `${nextCallType === "video" ? "Video" : "Voice"} call started.`
      );
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Could not start call.");
      await leaveCall(false);
    }
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall || !user) return;

    clearBanner();

    try {
      const chat = chats.find(
        (item) => String(item.id) === String(incomingCall.chatId)
      );

      if (!chat) {
        showError("That chat could not be found.");
        return;
      }

      await openChatById(String(incomingCall.chatId));
      await joinLocalCall(
        String(incomingCall.chatId),
        incomingCall.callType,
        chat
      );

      await broadcastSignal("join-call", {
        chatId: incomingCall.chatId,
        fromUserId: user.id,
        fromEmail: user.email
      });

      showInfo(
        `${incomingCall.callType === "video" ? "Video" : "Voice"} call joined.`
      );
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Could not answer call.");
      await leaveCall(false);
    }
  };

  const declineIncomingCall = () => {
    setIncomingCall(null);
    showInfo("Incoming call dismissed.");
  };

  const openDirectChat = async (otherUser: any) => {
    if (!user) return;

    clearBanner();

    try {
      if (inCallRef.current) {
        await leaveCall(true, "Call ended because you switched chats.");
      }

      const chat = await getOrCreateDirectChat(user.id, otherUser.id);
      const nextChatId = String(chat.id);

      const chatKey = await generateKeyFromChat(nextChatId);

      setChatId(nextChatId);
      setActiveKey(chatKey);

      await loadMessages(nextChatId, chatKey);
      await refreshUsersAndChats(user.id);
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Could not open chat.");
    }
  };

  const openSavedChat = async (chat: ChatItem) => {
    clearBanner();

    try {
      if (
        inCallRef.current &&
        callChatIdRef.current &&
        callChatIdRef.current !== String(chat.id)
      ) {
        await leaveCall(true, "Call ended because you switched chats.");
      }

      const chatKey = await generateKeyFromChat(String(chat.id));

      setChatId(String(chat.id));
      setActiveKey(chatKey);

      await loadMessages(String(chat.id), chatKey);
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Could not open saved chat.");
    }
  };

  const toggleGroupUser = (id: string) => {
    setSelectedGroupUsers((current) => {
      if (current.includes(id)) {
        return current.filter((userId) => userId !== id);
      }

      return [...current, id];
    });
  };

  const handleCreateGroupChat = async () => {
    if (!user) return;

    clearBanner();

    if (selectedGroupUsers.length === 0) {
      showError("Choose at least one person for the group chat.");
      return;
    }

    try {
      if (inCallRef.current) {
        await leaveCall(true, "Call ended because you switched chats.");
      }

      const chat = await createGroupChat(
        user.id,
        selectedGroupUsers,
        groupName || "Group Chat"
      );

      const nextChatId = String(chat.id);
      const chatKey = await generateKeyFromChat(nextChatId);

      setChatId(nextChatId);
      setActiveKey(chatKey);

      setShowGroupForm(false);
      setGroupName("");
      setSelectedGroupUsers([]);

      await loadMessages(nextChatId, chatKey);
      await refreshUsersAndChats(user.id);
      showInfo("Group chat created.");
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Could not create group chat.");
    }
  };

  const handleSend = async () => {
    if (!chatId || !user || !activeKey || !input.trim()) return;

    clearBanner();

    try {
      await sendEncryptedContent(input.trim());
      setInput("");
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Could not send message.");
    }
  };

  const renderGifSticker = (gifId: string, compact = false) => {
    const sizeClass = compact ? "small" : "";

    switch (gifId) {
      case "celebrate":
        return (
          <div className={`gif-sticker gif-celebrate ${sizeClass}`}>
            <span className="gif-spark spark-1">✨</span>
            <span className="gif-spark spark-2">🎉</span>
            <span className="gif-spark spark-3">✨</span>
            <span className="gif-main-text">YAY</span>
          </div>
        );

      case "heart":
        return (
          <div className={`gif-sticker gif-heart ${sizeClass}`}>
            <span className="gif-heart-emoji">💖</span>
            <span className="gif-main-text">LOVE</span>
          </div>
        );

      case "laugh":
        return (
          <div className={`gif-sticker gif-laugh ${sizeClass}`}>
            <span className="gif-face">😂</span>
            <span className="gif-main-text">LOL</span>
          </div>
        );

      case "clap":
        return (
          <div className={`gif-sticker gif-clap ${sizeClass}`}>
            <span className="gif-face">👏</span>
            <span className="gif-main-text">CLAP</span>
          </div>
        );

      case "wow":
        return (
          <div className={`gif-sticker gif-wow ${sizeClass}`}>
            <span className="gif-face">😮</span>
            <span className="gif-main-text">WOW</span>
          </div>
        );

      case "party":
        return (
          <div className={`gif-sticker gif-party ${sizeClass}`}>
            <span className="gif-face">🥳</span>
            <span className="gif-main-text">PARTY</span>
          </div>
        );

      case "fire":
        return (
          <div className={`gif-sticker gif-fire ${sizeClass}`}>
            <span className="gif-face">🔥</span>
            <span className="gif-main-text">FIRE</span>
          </div>
        );

      case "yes":
      default:
        return (
          <div className={`gif-sticker gif-yes ${sizeClass}`}>
            <span className="gif-face">👍</span>
            <span className="gif-main-text">YES</span>
          </div>
        );
    }
  };

  const logout = async () => {
    clearBanner();

    if (inCallRef.current) {
      await leaveCall(true);
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error(error);
      showError("Logout failed. Try again.");
      return;
    }

    setUser(null);
    setMessages([]);
    setChatId(null);
    setActiveKey(null);

    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="chat-shell loading-shell">
        <div className="loading-card">
          <div className="loading-mark">🕊️</div>
          <h2>Loading PigeonProject</h2>
          <p>Opening your chats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="profile-pill">
            <div className="profile-avatar">{currentUserInitial}</div>

            <div className="profile-text">
              <strong>{user?.email}</strong>
              <span>Encrypted messaging</span>
            </div>
          </div>

          <button
            className="new-group-button"
            onClick={() => setShowGroupForm((value) => !value)}
          >
            <span className="new-group-plus">+</span>
            New group
          </button>

          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search chats or users"
            />
          </div>

          <p className="discoverability-note">
            Right now every signed-up user appears in the user list.
          </p>
        </div>

        {showGroupForm && (
          <div className="group-card">
            <div className="group-card-header">
              <h3>Create group</h3>

              <button
                className="close-group-button"
                onClick={() => setShowGroupForm(false)}
              >
                ✕
              </button>
            </div>

            <label className="group-label">Group name</label>

            <input
              className="group-name-input"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Weekend plans"
            />

            <label className="group-label">Add people</label>

            <div className="group-user-list">
              {users.length === 0 ? (
                <p className="empty-side-text">No other users yet.</p>
              ) : (
                users.map((u) => (
                  <label key={u.id} className="group-user-row">
                    <input
                      type="checkbox"
                      checked={selectedGroupUsers.includes(u.id)}
                      onChange={() => toggleGroupUser(u.id)}
                    />

                    <span className="small-avatar">
                      {u.email?.charAt(0)?.toUpperCase() || "U"}
                    </span>

                    <span className="group-user-email">{u.email}</span>
                  </label>
                ))
              )}
            </div>

            <button
              className="create-group-button"
              onClick={handleCreateGroupChat}
            >
              Create group chat
            </button>
          </div>
        )}

        <div className="chat-section-label">Chats</div>

        <div className="chat-list">
          {filteredChats.length === 0 ? (
            <p className="empty-side-text">No chats yet.</p>
          ) : (
            filteredChats.map((chat) => (
              <button
                key={chat.id}
                className={chatId === chat.id ? "chat-row active" : "chat-row"}
                onClick={() => openSavedChat(chat)}
              >
                <div className="chat-row-avatar">{getChatAvatar(chat)}</div>

                <div className="chat-row-main">
                  <div className="chat-row-top">
                    <strong>{chat.title}</strong>
                    <span>{chat.is_group ? "Group" : "Direct"}</span>
                  </div>

                  <div className="chat-row-bottom">
                    <span>
                      {chat.is_group
                        ? `${chat.members?.length || 0} members`
                        : "Tap to open conversation"}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="chat-section-label contacts-label">
          All registered users
        </div>

        <div className="chat-list contacts-list">
          {filteredUsers.length === 0 ? (
            <p className="empty-side-text">No users found.</p>
          ) : (
            filteredUsers.map((u) => (
              <button
                key={u.id}
                className="chat-row"
                onClick={() => openDirectChat(u)}
              >
                <div className="chat-row-avatar">
                  {u.email?.charAt(0)?.toUpperCase() || "U"}
                </div>

                <div className="chat-row-main">
                  <div className="chat-row-top">
                    <strong>{u.email}</strong>
                  </div>

                  <div className="chat-row-bottom">
                    <span>Start direct message</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="chat-main">
        <header className="chat-header">
          <div className="chat-header-left">
            <div className="chat-header-avatar">
              {getChatAvatar(activeChat)}
            </div>

            <div className="chat-header-text">
              <h2>{activeChat ? activeChat.title : "PigeonProject"}</h2>
              <p>
                {activeChat
                  ? activeChat.is_group
                    ? `${activeChat.members?.length || 0} members • encrypted chat`
                    : "Direct message • encrypted chat"
                  : "Select a chat to start messaging"}
              </p>
            </div>
          </div>

          <div className="chat-header-actions">
            <button
              className="header-action-button"
              type="button"
              onClick={() => startOutgoingCall("audio")}
              title="Start voice call"
            >
              Call
            </button>

            <button
              className="header-action-button"
              type="button"
              onClick={() => startOutgoingCall("video")}
              title="Start video call"
            >
              Video
            </button>

            <button className="logout-button" onClick={logout}>
              Logout
            </button>
          </div>
        </header>

        {bannerText && (
          <div
            className={
              bannerType === "error"
                ? "status-banner error"
                : "status-banner info"
            }
          >
            {bannerText}
          </div>
        )}

        {incomingCall && !inCall && (
          <div className="incoming-call-banner">
            <div className="incoming-call-text">
              <strong>{incomingCall.fromEmail}</strong>
              <span>
                Incoming{" "}
                {incomingCall.callType === "video" ? "video" : "voice"} call
              </span>
            </div>

            <div className="incoming-call-actions">
              <button className="answer-call-button" onClick={acceptIncomingCall}>
                Answer
              </button>

              <button className="decline-call-button" onClick={declineIncomingCall}>
                Decline
              </button>
            </div>
          </div>
        )}

        {inCall && (
          <section className="live-call-panel">
            <div className="live-call-header">
              <div>
                <h3>{callType === "video" ? "Video call" : "Voice call"}</h3>
                <p>
                  {callMembers.length} participant
                  {callMembers.length === 1 ? "" : "s"}
                </p>
              </div>

              <button
                className="end-call-button"
                onClick={() => leaveCall(true, "Call ended.")}
              >
                End call
              </button>
            </div>

            {callType === "video" ? (
              <div className="video-grid">
                <div className="video-tile local-tile">
                  <video
                    autoPlay
                    playsInline
                    muted
                    ref={(element) => {
                      if (element && localStream) {
                        if (element.srcObject !== localStream) {
                          element.srcObject = localStream;
                        }
                      }
                    }}
                  />
                  <div className="video-label">You</div>
                </div>

                {remoteMedia.map((remote) => (
                  <div key={remote.userId} className="video-tile">
                    <video
                      autoPlay
                      playsInline
                      ref={(element) => {
                        if (element && remote.stream) {
                          if (element.srcObject !== remote.stream) {
                            element.srcObject = remote.stream;
                          }
                        }
                      }}
                    />
                    <div className="video-label">{remote.email}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="audio-members-grid">
                {callMembers.map((member) => (
                  <div key={member.id} className="audio-member-card">
                    <div className="audio-member-avatar">
                      {member.email?.charAt(0)?.toUpperCase() || "U"}
                    </div>
                    <div className="audio-member-name">
                      {member.id === user?.id ? "You" : member.email}
                    </div>
                  </div>
                ))}

                {remoteMedia.map((remote) => (
                  <audio
                    key={remote.userId}
                    autoPlay
                    ref={(element) => {
                      if (element && remote.stream) {
                        if (element.srcObject !== remote.stream) {
                          element.srcObject = remote.stream;
                        }
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        <section className="messages-area">
          {!chatId ? (
            <div className="empty-chat-state">
              <div className="empty-chat-icon">💬</div>
              <h3>Keep your chats together</h3>
              <p>
                Open an existing conversation, start a direct chat, or create a
                new group.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-chat-state">
              <div className="empty-chat-icon">✉️</div>
              <h3>No messages yet</h3>
              <p>Send the first message to start this conversation.</p>
            </div>
          ) : (
            <>
              {messages.map((m) => {
                const isMine = m.sender_id === user?.id;

                return (
                  <div
                    key={m.id}
                    className={isMine ? "message-row mine" : "message-row"}
                  >
                    <div
                      className={
                        isMine ? "message-bubble mine" : "message-bubble"
                      }
                    >
                      {isGifMessage(m.text) ? (
                        <div className="message-gif-wrap">
                          {renderGifSticker(getGifIdFromMessage(m.text))}
                        </div>
                      ) : (
                        <div className="message-text">{m.text}</div>
                      )}

                      <div className="message-meta">
                        <span className="message-sender">
                          {m.sender_email || "Unknown user"}
                        </span>

                        <span className="message-time">
                          {formatMessageTime(m.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </>
          )}
        </section>

        <footer className="composer">
          <div className="composer-left" ref={emojiPickerWrapRef}>
            <button
              className="composer-icon-button"
              type="button"
              title="Emoji picker"
              onClick={() => {
                setShowGifPicker(false);
                setShowEmojiPicker((value) => !value);
              }}
            >
              😊
            </button>

            <button
              className="composer-gif-button"
              type="button"
              title="GIF picker"
              onClick={() => {
                setShowEmojiPicker(false);
                setShowGifPicker((value) => !value);
              }}
            >
              GIF
            </button>

            {showEmojiPicker && (
              <div className="emoji-picker-popover">
                {createElement("emoji-picker", {
                  ref: (node: Element | null) => {
                    emojiPickerRef.current = node as HTMLElement | null;
                  }
                })}
              </div>
            )}

            {showGifPicker && (
              <div className="gif-picker-popover">
                <div className="gif-picker-header">
                  <strong>Preset GIFs</strong>
                  <span>Animated reactions</span>
                </div>

                <div className="gif-grid">
                  {PRESET_GIFS.map((gif) => (
                    <button
                      key={gif.id}
                      className="gif-option-button"
                      type="button"
                      onClick={() => handleSendGif(gif.id)}
                    >
                      <div className="gif-option-preview">
                        {renderGifSticker(gif.id, true)}
                      </div>

                      <span className="gif-option-label">
                        {gif.emoji} {gif.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="composer-input-wrap">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              placeholder={chatId ? "Type a message" : "Choose a chat first"}
              disabled={!chatId}
            />
          </div>

          <button
            className="send-button"
            onClick={handleSend}
            disabled={!chatId || !input.trim()}
          >
            Send
          </button>
        </footer>
      </main>
    </div>
  );
}