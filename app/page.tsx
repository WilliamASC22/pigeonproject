"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";
import {
  encryptMessage,
  decryptMessage,
  generateKey,
} from "@/src/lib/crypto";

export default function Home() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [key, setKey] = useState<CryptoKey | null>(null);

  // ---------------- INIT ----------------
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/login");
        return;
      }

      setUser(data.user);

      const k = await generateKey();
      setKey(k);

      loadChats(data.user.id);
    };

    init();
  }, []);

  // ---------------- LOAD CHATS ----------------
  async function loadChats(userId: string) {
    const { data } = await supabase
      .from("chat_members")
      .select("chat_id")
      .eq("user_id", userId);

    if (!data) return;

    const chatIds = data.map((c) => c.chat_id);

    const res = await supabase
      .from("chats")
      .select("*")
      .in("id", chatIds);

    setChats(res.data || []);
  }

  // ---------------- LOAD MESSAGES ----------------
  async function loadMessages(chatId: string) {
    if (!key) return;

    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    if (!data) return;

    const decrypted = await Promise.all(
      data.map(async (m) => {
        const text = await decryptMessage(
          JSON.parse(m.ciphertext),
          JSON.parse(m.iv),
          key
        );

        return { ...m, text };
      })
    );

    setMessages(decrypted);
  }

  // ---------------- REALTIME ----------------
  useEffect(() => {
    if (!activeChat) return;

    const channel = supabase
      .channel("chat-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${activeChat.id}`,
        },
        () => {
          loadMessages(activeChat.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChat, key]);

  // ---------------- SEND ----------------
  async function sendMessage() {
    if (!text.trim() || !activeChat || !key || !user) return;

    const { ciphertext, iv } = await encryptMessage(text, key);

    await supabase.from("messages").insert([
      {
        sender: user.id,
        chat_id: activeChat.id,
        ciphertext: JSON.stringify(ciphertext),
        iv: JSON.stringify(iv),
      },
    ]);

    setText("");
    loadMessages(activeChat.id);
  }

  // ---------------- CREATE GROUP ----------------
  async function createGroup() {
    const name = prompt("Group name?");
    if (!name) return;

    const { data: chat } = await supabase
      .from("chats")
      .insert([{ name, is_group: true }])
      .select()
      .single();

    await supabase.from("chat_members").insert([
      {
        chat_id: chat.id,
        user_id: user.id,
      },
    ]);

    loadChats(user.id);
  }

  // ---------------- UI ----------------
  return (
    <div style={styles.page}>
      {/* SIDEBAR */}
      <div style={styles.sidebar}>
        <div style={styles.header}>Chats</div>

        <button onClick={createGroup} style={styles.groupBtn}>
          + New Group
        </button>

        {chats.map((c) => (
          <div
            key={c.id}
            onClick={() => {
              setActiveChat(c);
              loadMessages(c.id);
            }}
            style={styles.chatItem}
          >
            {c.name || "Chat"}
          </div>
        ))}
      </div>

      {/* CHAT */}
      <div style={styles.chat}>
        <div style={styles.topbar}>
          {activeChat?.name || "Select a chat"}
        </div>

        <div style={styles.messages}>
          {messages.map((m) => (
            <div key={m.id} style={styles.msg}>
              {m.text}
            </div>
          ))}
        </div>

        <div style={styles.inputBar}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={styles.input}
            placeholder="Message..."
          />

          <button onClick={sendMessage} style={styles.send}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- STYLES ----------------
const styles: any = {
  page: {
    display: "flex",
    height: "100vh",
    background: "#0b0b0b",
    color: "white",
  },

  sidebar: {
    width: 280,
    borderRight: "1px solid #222",
    padding: 10,
  },

  header: {
    fontSize: 18,
    marginBottom: 10,
  },

  groupBtn: {
    width: "100%",
    padding: 10,
    marginBottom: 10,
    background: "#4f46e5",
    border: "none",
    color: "white",
    borderRadius: 6,
  },

  chatItem: {
    padding: 10,
    background: "#1a1a1a",
    marginBottom: 5,
    borderRadius: 6,
    cursor: "pointer",
  },

  chat: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },

  topbar: {
    padding: 15,
    borderBottom: "1px solid #222",
  },

  messages: {
    flex: 1,
    padding: 15,
    overflowY: "auto",
  },

  msg: {
    padding: 10,
    background: "#1a1a1a",
    marginBottom: 8,
    borderRadius: 6,
  },

  inputBar: {
    display: "flex",
    padding: 10,
    borderTop: "1px solid #222",
  },

  input: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    border: "none",
  },

  send: {
    marginLeft: 10,
    padding: "10px 15px",
    background: "#4f46e5",
    color: "white",
    border: "none",
    borderRadius: 6,
  },
};