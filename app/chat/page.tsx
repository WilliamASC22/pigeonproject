"use client";

import {
  type FormEvent,
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
  createProfile,
  getMyChats,
  getOrCreateDirectChat,
  getMessages,
  sendMessage,
  getChatMembers,
  getProfileWithKeys,
  getProfilesForChatKey,
  saveUserKeyVault,
  getMyWrappedChatKey,
  getChatKeyRowsForChat,
  saveWrappedChatKey,
  saveUsername,
  getMyContacts,
  type ProfileWithKeys
} from "@/src/lib/chat";

import {
  encryptMessage,
  decryptMessage,
  generateChatKey,
  wrapChatKeyForUser,
  unwrapChatKeyForUser,
  createUserKeyBundle,
  unlockUserKeyBundle,
  type EncryptedPrivateKeyVault,
  type UserKeyBundle
} from "@/src/lib/crypto";

type BannerType = "info" | "error";
type CallType = "audio" | "video";

type ChatMember = {
  id: string;
  email: string;
  username?: string | null;
  e2ee_public_key?: JsonWebKey | null;
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

const EMOJI_PICKER_OPTIONS = [
  "😀",
  "😄",
  "😂",
  "🤣",
  "😊",
  "😍",
  "🥰",
  "😘",
  "😎",
  "🤔",
  "😮",
  "😢",
  "😭",
  "😡",
  "🙏",
  "👏",
  "👍",
  "👎",
  "💪",
  "🙌",
  "🤝",
  "👀",
  "💯",
  "✨",
  "🎉",
  "🥳",
  "🔥",
  "💖",
  "❤️",
  "💙",
  "✅",
  "❌",
  "🕊️",
  "📌",
  "📎",
  "🔒",
  "🔐",
  "🛡️",
  "⭐",
  "🌙"
];

const isGifMessage = (value: string) =>
  typeof value === "string" && value.startsWith(GIF_MESSAGE_PREFIX);

const getGifIdFromMessage = (value: string) =>
  isGifMessage(value) ? value.slice(GIF_MESSAGE_PREFIX.length) : "";

export default function ChatPage() {
  const router = useRouter();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
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
  const [activeKey, setActiveKey] = useState<CryptoKey | null>(null);

  const [userKeyBundle, setUserKeyBundle] = useState<UserKeyBundle | null>(null);
  const [profileVault, setProfileVault] = useState<ProfileWithKeys | null>(null);
  const [encryptionMode, setEncryptionMode] = useState<"setup" | "unlock" | null>(
    null
  );
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [encryptionBusy, setEncryptionBusy] = useState(false);
  const [e2eeReady, setE2eeReady] = useState(false);

  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameMode, setUsernameMode] = useState(false);

  const [input, setInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

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

    return users.filter((u) => {
      const email = (u.email || "").toLowerCase();
      const userName = (u.username || "").toLowerCase();

      return email.includes(cleanSearch) || userName.includes(cleanSearch);
    });
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
    return chat.title?.replace("@", "")?.charAt(0)?.toUpperCase() || "💬";
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

  const buildVaultFromProfile = (
    profile: ProfileWithKeys
  ): EncryptedPrivateKeyVault => {
    if (
      !profile.e2ee_public_key ||
      !profile.e2ee_private_key_ciphertext ||
      !profile.e2ee_private_key_iv ||
      !profile.e2ee_private_key_salt
    ) {
      throw new Error("This account has not finished encryption setup.");
    }

    return {
      version: 2,
      publicKeyJwk: profile.e2ee_public_key,
      encryptedPrivateKey: profile.e2ee_private_key_ciphertext,
      privateKeyIv: profile.e2ee_private_key_iv,
      privateKeySalt: profile.e2ee_private_key_salt,
      kdf: "PBKDF2-SHA-256",
      kdfIterations: profile.e2ee_kdf_iterations || 310000
    };
  };

  const profileHasVault = (profile: ProfileWithKeys | null) => {
    return Boolean(
      profile?.e2ee_public_key &&
        profile?.e2ee_private_key_ciphertext &&
        profile?.e2ee_private_key_iv &&
        profile?.e2ee_private_key_salt
    );
  };

  const upsertCallMember = (userId: string, email: string) => {
    setCallMembers((current) => {
      const existing = current.find((member) => member.id === userId);

      if (existing) {
        return current.map((member) =>
          member.id === userId ? { ...member, id: userId, email } : member
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
    const contacts = await getMyContacts(currentUserId);
    setUsers(contacts.filter((u) => u.id !== currentUserId));

    const myChats = await getMyChats(currentUserId);
    setChats(myChats as ChatItem[]);
  }, []);

  const loadMessages = useCallback(async (id: string, chatKey: CryptoKey) => {
    const data = await getMessages(id);

    const decrypted = await Promise.all(
      data.map(async (m: any) => {
        try {
          const text = await decryptMessage(m.ciphertext, m.iv, chatKey);

          return { ...m, text };
        } catch {
          return {
            ...m,
            text:
              m.crypto_version === 2
                ? "⚠️ cannot decrypt"
                : "⚠️ old message from before the E2EE upgrade",
            sender_email: m.sender_email || "Unknown user",
            sender_username: m.sender_username || ""
          };
        }
      })
    );

    setMessages(decrypted);
  }, []);

  const ensureChatKeyForChat = useCallback(
    async (targetChatId: string, knownMembers?: ChatMember[]) => {
      if (!user || !userKeyBundle) {
        throw new Error("Unlock encryption before opening chats.");
      }

      const existingWrappedKey = await getMyWrappedChatKey(targetChatId, user.id);

      if (existingWrappedKey) {
        const wrappedByProfile = await getProfileWithKeys(
          existingWrappedKey.wrapped_by_user_id || user.id
        );

        if (!wrappedByProfile?.e2ee_public_key) {
          throw new Error("The chat key sender is missing a public key.");
        }

        return unwrapChatKeyForUser({
          encryptedChatKey: existingWrappedKey.encrypted_chat_key,
          iv: existingWrappedKey.iv,
          myPrivateKey: userKeyBundle.privateKey,
          wrappedByPublicKeyJwk: wrappedByProfile.e2ee_public_key,
          chatId: targetChatId
        });
      }

      const existingRows = await getChatKeyRowsForChat(targetChatId);

      if (existingRows.length > 0) {
        throw new Error(
          "This chat has encryption keys, but this account does not have access to one. Create a new secure chat."
        );
      }

      const members =
        knownMembers && knownMembers.length > 0
          ? knownMembers
          : await getChatMembers(targetChatId);

      const memberIds = Array.from(
        new Set([...members.map((member) => member.id), user.id])
      );

      const profiles = await getProfilesForChatKey(memberIds);

      const profilesById = new Map<string, ProfileWithKeys>();
      profiles.forEach((profile) => {
        profilesById.set(profile.id, profile);
      });

      if (!profilesById.has(user.id)) {
        profilesById.set(user.id, {
          id: user.id,
          email: user.email,
          username,
          e2ee_public_key: userKeyBundle.publicKeyJwk
        });
      }

      const profilesToWrap = memberIds.map((id) => profilesById.get(id));
      const missingProfiles = profilesToWrap.filter(
        (profile) => !profile?.e2ee_public_key
      );

      if (missingProfiles.length > 0) {
        throw new Error(
          "Every chat member must open PigeonProject once and set up encryption before this chat can use E2EE."
        );
      }

      const newChatKey = await generateChatKey();

      for (const profile of profilesToWrap) {
        if (!profile?.e2ee_public_key) continue;

        const wrapped = await wrapChatKeyForUser({
          chatKey: newChatKey,
          myPrivateKey: userKeyBundle.privateKey,
          otherUserPublicKeyJwk: profile.e2ee_public_key,
          chatId: targetChatId
        });

        await saveWrappedChatKey({
          chat_id: targetChatId,
          user_id: profile.id,
          wrapped_by_user_id: user.id,
          encrypted_chat_key: wrapped.encryptedChatKey,
          iv: wrapped.iv,
          algorithm: wrapped.algorithm
        });
      }

      return newChatKey;
    },
    [user, userKeyBundle, username]
  );

  const sendEncryptedContent = useCallback(
    async (plainText: string) => {
      if (!chatId || !user || !activeKey) return;

      const encrypted = await encryptMessage(plainText, activeKey);

      await sendMessage({
        chat_id: chatId,
        sender_id: user.id,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        crypto_version: encrypted.version,
        algorithm: encrypted.algorithm
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

  const handleEncryptionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) return;

    clearBanner();

    if (encryptionPassword.length < 12) {
      showError("Use an encryption password with at least 12 characters.");
      return;
    }

    setEncryptionBusy(true);

    try {
      if (encryptionMode === "setup") {
        const vault = await createUserKeyBundle(encryptionPassword);
        await saveUserKeyVault(user.id, vault);

        const unlocked = await unlockUserKeyBundle(encryptionPassword, vault);
        setUserKeyBundle(unlocked);

        const updatedProfile = await getProfileWithKeys(user.id);
        setProfileVault(updatedProfile);

        showInfo("Encryption is set up for this account.");
      } else {
        if (!profileVault) {
          throw new Error("Could not find your encryption profile.");
        }

        const vault = buildVaultFromProfile(profileVault);
        const unlocked = await unlockUserKeyBundle(encryptionPassword, vault);
        setUserKeyBundle(unlocked);

        showInfo("Encryption unlocked.");
      }

      setEncryptionPassword("");
      setEncryptionMode(null);
      setE2eeReady(true);
      await refreshUsersAndChats(user.id);
    } catch (error: any) {
      console.error(error);
      showError(
        encryptionMode === "setup"
          ? error.message || "Could not set up encryption."
          : "Could not unlock encryption. Check your encryption password."
      );
    } finally {
      setEncryptionBusy(false);
    }
  };

  const handleSaveUsername = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) return;

    clearBanner();

    try {
      const cleanUsername = await saveUsername(user.id, usernameInput);

      setUsername(cleanUsername);
      setUsernameInput(cleanUsername);
      setUsernameMode(false);

      const updatedProfile = await getProfileWithKeys(user.id);
      setProfileVault(updatedProfile);

      await refreshUsersAndChats(user.id);

      showInfo("Username saved.");
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Could not save username.");
    }
  };

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

      const profile = await getProfileWithKeys(data.user.id);
      setProfileVault(profile);

      if (profile?.username) {
        setUsername(profile.username);
        setUsernameInput(profile.username);
      } else {
        setUsernameMode(true);
      }

      if (profileHasVault(profile)) {
        setEncryptionMode("unlock");
      } else {
        setEncryptionMode("setup");
      }

      setLoading(false);
    };

    init();
  }, [router]);

  useEffect(() => {
    if (!user || !e2eeReady) return;

    ensureSignalChannel();

    return () => {
      if (signalChannelRef.current) {
        supabase.removeChannel(signalChannelRef.current);
        signalChannelRef.current = null;
      }
    };
  }, [e2eeReady, ensureSignalChannel, user]);

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

    const chatKey = await ensureChatKeyForChat(nextChatId, chat.members);
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
      const chatKey = await ensureChatKeyForChat(targetChatId, chat.members);
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

      showInfo(`${nextCallType === "video" ? "Video" : "Voice"} call started.`);
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
    if (!user || !userKeyBundle) return;

    clearBanner();

    if (!otherUser.e2ee_public_key) {
      showError(
        "This contact must open PigeonProject once and set up encryption before you can message them."
      );
      return;
    }

    try {
      if (inCallRef.current) {
        await leaveCall(true, "Call ended because you switched chats.");
      }

      const chat = await getOrCreateDirectChat(user.id, otherUser.id);
      const nextChatId = String(chat.id);
      const members = await getChatMembers(nextChatId);

      const chatKey = await ensureChatKeyForChat(nextChatId, members);

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

      const chatKey = await ensureChatKeyForChat(String(chat.id), chat.members);

      setChatId(String(chat.id));
      setActiveKey(chatKey);

      await loadMessages(String(chat.id), chatKey);
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Could not open saved chat.");
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
    setUserKeyBundle(null);
    setE2eeReady(false);
    setEncryptionMode(null);
    setEncryptionPassword("");
    setUsername("");
    setUsernameInput("");
    setUsernameMode(false);

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

  if (!e2eeReady) {
    return (
      <div className="chat-shell loading-shell">
        <form className="loading-card" onSubmit={handleEncryptionSubmit}>
          <div className="loading-mark">🔐</div>

          <h2>
            {encryptionMode === "setup"
              ? "Set up encryption"
              : "Unlock encryption"}
          </h2>

          <p>
            {encryptionMode === "setup"
              ? "Create a separate encryption password. Do not forget it."
              : "Enter your encryption password to open your saved chats."}
          </p>

          <input
            className="group-name-input"
            type="password"
            value={encryptionPassword}
            onChange={(event) => setEncryptionPassword(event.target.value)}
            placeholder="Encryption password"
            autoComplete="current-password"
          />

          <button
            className="create-group-button"
            type="submit"
            disabled={encryptionBusy}
          >
            {encryptionBusy
              ? "Please wait..."
              : encryptionMode === "setup"
                ? "Set up encryption"
                : "Unlock messages"}
          </button>

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
        </form>
      </div>
    );
  }

  if (usernameMode) {
    return (
      <div className="chat-shell loading-shell">
        <form className="loading-card" onSubmit={handleSaveUsername}>
          <div className="loading-mark">🕊️</div>

          <h2>Choose a username</h2>

          <p>People will use this username to send you a contact request.</p>

          <input
            className="group-name-input"
            type="text"
            value={usernameInput}
            onChange={(event) => setUsernameInput(event.target.value)}
            placeholder="example: john_123"
            autoComplete="username"
          />

          <button className="create-group-button" type="submit">
            Save username
          </button>

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
        </form>
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
              <span>
                {username ? `@${username} • E2EE unlocked` : "E2EE unlocked"}
              </span>
            </div>
          </div>

          <button
            className="new-group-button"
            type="button"
            onClick={() => router.push("/groups")}
          >
            <span className="new-group-plus">+</span>
            New group
          </button>

          <button
            className="create-group-button"
            type="button"
            onClick={() => router.push("/contacts")}
          >
            Contacts and requests
          </button>

          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search chats or contacts"
            />
          </div>

          <p className="discoverability-note">
            Only accepted contacts appear here. Manage requests on the Contacts
            page.
          </p>
        </div>

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

        <div className="chat-section-label contacts-label">Contacts</div>

        <div className="chat-list contacts-list">
          {filteredUsers.length === 0 ? (
            <p className="empty-side-text">
              No contacts yet. Add someone from the Contacts page.
            </p>
          ) : (
            filteredUsers.map((u) => (
              <button
                key={u.id}
                className="chat-row"
                onClick={() => openDirectChat(u)}
              >
                <div className="chat-row-avatar">
                  {u.username
                    ? u.username.charAt(0).toUpperCase()
                    : u.email?.charAt(0)?.toUpperCase() || "U"}
                </div>

                <div className="chat-row-main">
                  <div className="chat-row-top">
                    <strong>{u.username ? `@${u.username}` : u.email}</strong>
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
            <div className="chat-header-avatar">{getChatAvatar(activeChat)}</div>

            <div className="chat-header-text">
              <h2>{activeChat ? activeChat.title : "PigeonProject"}</h2>
              <p>
                {activeChat
                  ? activeChat.is_group
                    ? `${activeChat.members?.length || 0} members • E2EE chat`
                    : "Direct message • E2EE chat"
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
                Open an existing conversation, start a direct chat with an
                accepted contact, or create a new group.
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
                          {m.sender_username
                            ? `@${m.sender_username}`
                            : m.sender_email || "Unknown user"}
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
              <div className="emoji-picker-popover local-emoji-popover">
                <div className="emoji-picker-header">
                  <strong>Emoji</strong>
                  <span>Local picker. No third-party script is loaded.</span>
                </div>

                <div className="emoji-grid-local">
                  {EMOJI_PICKER_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      className="emoji-option-button"
                      type="button"
                      onClick={() => {
                        setInput((current) => `${current}${emoji}`);
                        setShowEmojiPicker(false);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
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
            disabled={!chatId || !activeKey || !input.trim()}
          >
            Send
          </button>
        </footer>
      </main>
    </div>
  );
}