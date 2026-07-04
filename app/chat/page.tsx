"use client";

import { useEffect, useState } from "react";
import "./chat.css";

import { supabase } from "@/src/lib/supabase";
import {
  getUsers,
  createProfile,
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
  const [user, setUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const [key, setKey] = useState<Uint8Array | null>(null);

  /* ================= INIT ================= */

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();

      if (!data?.user) {
        window.location.href = "/login";
        return;
      }

      setUser(data.user);
      await createProfile(data.user);

      const allUsers = await getUsers();
      setUsers(allUsers.filter((u) => u.id !== data.user.id));
    };

    init();
  }, []);

  /* ================= LOAD MESSAGES ================= */

  const loadMessages = async (id: string, chatKey: Uint8Array) => {
    const data = await getMessages(id);

    const decrypted = await Promise.all(
      data.map(async (m) => {
        try {
          const text = await decryptMessage(
            JSON.parse(m.ciphertext),
            JSON.parse(m.iv),
            chatKey
          );

          return { ...m, text };
        } catch {
          return { ...m, text: "⚠️ cannot decrypt" };
        }
      })
    );

    setMessages(decrypted);
  };

  /* ================= OPEN CHAT ================= */

  const openChat = async (otherUserId: string) => {
    if (!user) return;

    const chat = await getOrCreateDirectChat(user.id, otherUserId);

    const chatKey = await generateKeyFromChat(chat.id);

    setChatId(chat.id);
    setKey(chatKey);

    loadMessages(chat.id, chatKey);
  };

  /* ================= GROUP CHAT ================= */

  const startGroupChat = async () => {
    if (!user) return;

    const chat = await createGroupChat(
      users.map((u) => u.id),
      "Group Chat"
    );

    const chatKey = await generateKeyFromChat(chat.id);

    setChatId(chat.id);
    setKey(chatKey);

    loadMessages(chat.id, chatKey);
  };

  /* ================= SEND ================= */

  const handleSend = async () => {
    if (!chatId || !user || !key || !input.trim()) return;

    const encrypted = await encryptMessage(input, key);

    await sendMessage({
      chat_id: chatId,
      sender_id: user.id,
      ciphertext: JSON.stringify(encrypted.encrypted),
      iv: JSON.stringify(encrypted.iv)
    });

    setInput("");
    loadMessages(chatId, key);
  };

  /* ================= LOGOUT ================= */

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="chat-container">

      {/* SIDEBAR */}
      <div className="sidebar">
        <h3>Users</h3>

        <button className="user-btn" onClick={startGroupChat}>
          + Create Group Chat
        </button>

        {users.map((u) => (
          <button
            key={u.id}
            className="user-btn"
            onClick={() => openChat(u.id)}
          >
            {u.email}
          </button>
        ))}
      </div>

      {/* CHAT */}
      <div className="chat-main">

        <div className="header">
          <h3>PigeonProject 🕊️</h3>
          <button onClick={logout}>Logout</button>
        </div>

        <div className="messages">
          {!chatId ? (
            <p>Select a chat</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="message">
                {m.text}
              </div>
            ))
          )}
        </div>

        <div className="input-bar">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message..."
          />
          <button onClick={handleSend}>Send</button>
        </div>

      </div>
    </div>
  );
}