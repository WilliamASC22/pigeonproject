"use client";

import { useCallback, useEffect, useState } from "react";
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

export default function ChatPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);

  const [chatId, setChatId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState("PigeonProject 🕊️");
  const [activeKey, setActiveKey] = useState<Uint8Array | null>(null);

  const [input, setInput] = useState("");
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedGroupUsers, setSelectedGroupUsers] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  /* ================= LOAD APP ================= */

  const refreshUsersAndChats = useCallback(async (currentUserId: string) => {
    const allUsers = await getUsers();
    setUsers(allUsers.filter((u) => u.id !== currentUserId));

    const myChats = await getMyChats(currentUserId);
    setChats(myChats);
  }, []);

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

  /* ================= LOAD MESSAGES ================= */

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

  /* ================= REALTIME MESSAGE UPDATES ================= */

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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, activeKey, loadMessages]);

  /* ================= OPEN DIRECT CHAT ================= */

  const openDirectChat = async (otherUser: any) => {
    if (!user) return;

    setErrorMessage("");

    try {
      const chat = await getOrCreateDirectChat(user.id, otherUser.id);
      const chatKey = await generateKeyFromChat(String(chat.id));

      setChatId(String(chat.id));
      setChatTitle(otherUser.email);
      setActiveKey(chatKey);

      await loadMessages(String(chat.id), chatKey);
      await refreshUsersAndChats(user.id);
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error.message || "Could not open chat.");
    }
  };

  /* ================= OPEN SAVED CHAT ================= */

  const openSavedChat = async (chat: any) => {
    setErrorMessage("");

    try {
      const chatKey = await generateKeyFromChat(String(chat.id));

      setChatId(String(chat.id));
      setChatTitle(chat.title || "Chat");
      setActiveKey(chatKey);

      await loadMessages(String(chat.id), chatKey);
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error.message || "Could not open saved chat.");
    }
  };

  /* ================= GROUP CHAT ================= */

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

    setErrorMessage("");

    if (selectedGroupUsers.length === 0) {
      setErrorMessage("Choose at least one person for the group chat.");
      return;
    }

    try {
      const chat = await createGroupChat(
        user.id,
        selectedGroupUsers,
        groupName || "Group Chat"
      );

      const chatKey = await generateKeyFromChat(String(chat.id));

      setChatId(String(chat.id));
      setChatTitle(chat.name || "Group Chat");
      setActiveKey(chatKey);

      setShowGroupForm(false);
      setGroupName("");
      setSelectedGroupUsers([]);

      await loadMessages(String(chat.id), chatKey);
      await refreshUsersAndChats(user.id);
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error.message || "Could not create group chat.");
    }
  };

  /* ================= SEND MESSAGE ================= */

  const handleSend = async () => {
    if (!chatId || !user || !activeKey || !input.trim()) return;

    setErrorMessage("");

    try {
      const encrypted = await encryptMessage(input.trim(), activeKey);

      await sendMessage({
        chat_id: chatId,
        sender_id: user.id,
        ciphertext: JSON.stringify(encrypted.encrypted),
        iv: JSON.stringify(encrypted.iv)
      });

      setInput("");
      await loadMessages(chatId, activeKey);
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error.message || "Could not send message.");
    }
  };

  /* ================= LOGOUT ================= */

  const logout = async () => {
    setErrorMessage("");

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error(error);
      setErrorMessage("Logout failed. Try again.");
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
      <div className="chat-container center-screen">
        <p>Loading PigeonProject...</p>
      </div>
    );
  }

  return (
    <div className="chat-container">
      {/* SIDEBAR */}
      <div className="sidebar">
        <h3>Users</h3>

        <button
          className="group-btn"
          onClick={() => setShowGroupForm((value) => !value)}
        >
          + Create Group Chat
        </button>

        {showGroupForm && (
          <div className="group-box">
            <input
              className="group-name-input"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
            />

            <p className="small-label">Choose people:</p>

            <div className="group-user-list">
              {users.map((u) => (
                <label key={u.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selectedGroupUsers.includes(u.id)}
                    onChange={() => toggleGroupUser(u.id)}
                  />
                  <span>{u.email}</span>
                </label>
              ))}
            </div>

            <button className="create-group-confirm" onClick={handleCreateGroupChat}>
              Create Group
            </button>
          </div>
        )}

        <h3 className="sidebar-section-title">My Chats</h3>

        {chats.length === 0 ? (
          <p className="empty-text">No chats yet.</p>
        ) : (
          chats.map((chat) => (
            <button
              key={chat.id}
              className={chatId === chat.id ? "user-btn selected" : "user-btn"}
              onClick={() => openSavedChat(chat)}
            >
              {chat.is_group ? "👥 " : "💬 "}
              {chat.title}
            </button>
          ))
        )}

        <h3 className="sidebar-section-title">Start Direct Chat</h3>

        {users.map((u) => (
          <button
            key={u.id}
            className="user-btn"
            onClick={() => openDirectChat(u)}
          >
            {u.email}
          </button>
        ))}
      </div>

      {/* CHAT */}
      <div className="chat-main">
        <div className="header">
          <h3>{chatTitle}</h3>
          <button className="logout-btn" onClick={logout}>
            Logout
          </button>
        </div>

        {errorMessage && <div className="error-box">{errorMessage}</div>}

        <div className="messages">
          {!chatId ? (
            <p className="empty-chat">Select a chat or create a group chat.</p>
          ) : messages.length === 0 ? (
            <p className="empty-chat">No messages yet. Send the first one.</p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={m.sender_id === user?.id ? "message mine" : "message"}
              >
                <div className="message-text">{m.text}</div>
                <div className="message-sender">
                  {m.sender_email || "Unknown user"}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="input-bar">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder={chatId ? "Message..." : "Choose a chat first"}
            disabled={!chatId}
          />
          <button onClick={handleSend} disabled={!chatId || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}