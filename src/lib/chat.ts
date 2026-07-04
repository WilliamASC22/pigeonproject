import { supabase } from "./supabase";

/* ================= USERS ================= */

export async function getUsers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email")
    .order("email", { ascending: true });

  if (error) {
    console.error("getUsers error:", error);
    return [];
  }

  return data || [];
}

export async function createProfile(user: any) {
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email
  });

  if (error) {
    console.error("createProfile error:", error);
    throw error;
  }
}

/* ================= MY CHATS ================= */

export async function getMyChats(userId: string) {
  const { data: myRows, error: myRowsError } = await supabase
    .from("chat_members")
    .select("chat_id, chats(id, name, is_group, created_at)")
    .eq("user_id", userId);

  if (myRowsError) {
    console.error("getMyChats membership error:", myRowsError);
    return [];
  }

  const rows = (myRows || []) as any[];
  const chatIds = rows.map((row) => row.chat_id);

  if (chatIds.length === 0) {
    return [];
  }

  const { data: memberRows, error: membersError } = await supabase
    .from("chat_members")
    .select("chat_id, user_id, profiles(id, email)")
    .in("chat_id", chatIds);

  if (membersError) {
    console.error("getMyChats members error:", membersError);
    return [];
  }

  const membersByChat = new Map<string, any[]>();

  ((memberRows || []) as any[]).forEach((row) => {
    const profile = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles;

    if (!membersByChat.has(row.chat_id)) {
      membersByChat.set(row.chat_id, []);
    }

    membersByChat.get(row.chat_id)!.push({
      id: row.user_id,
      email: profile?.email || "Unknown user"
    });
  });

  return rows
    .map((row) => {
      const chat = Array.isArray(row.chats) ? row.chats[0] : row.chats;
      const members = membersByChat.get(row.chat_id) || [];
      const otherUser = members.find((member) => member.id !== userId);

      return {
        id: chat.id,
        name: chat.name,
        is_group: chat.is_group,
        created_at: chat.created_at,
        members,
        title: chat.is_group
          ? chat.name || "Group Chat"
          : otherUser?.email || "Direct Chat"
      };
    })
    .sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

/* ================= DIRECT CHAT ================= */

export async function getOrCreateDirectChat(user1: string, user2: string) {
  const myChats = await getMyChats(user1);

  const existingChat = myChats.find((chat: any) => {
    const memberIds = chat.members.map((member: any) => member.id);

    return (
      chat.is_group === false &&
      memberIds.length === 2 &&
      memberIds.includes(user1) &&
      memberIds.includes(user2)
    );
  });

  if (existingChat) {
    return existingChat;
  }

  const { data: chat, error } = await supabase
    .from("chats")
    .insert({
      is_group: false,
      created_by: user1
    })
    .select()
    .single();

  if (error) {
    console.error("create direct chat error:", error);
    throw error;
  }

  const { error: membersError } = await supabase.from("chat_members").insert([
    { chat_id: chat.id, user_id: user1 },
    { chat_id: chat.id, user_id: user2 }
  ]);

  if (membersError) {
    console.error("create direct members error:", membersError);
    throw membersError;
  }

  return chat;
}

/* ================= GROUP CHAT ================= */

export async function createGroupChat(
  creatorId: string,
  selectedUserIds: string[],
  name: string
) {
  const uniqueUserIds = Array.from(new Set([creatorId, ...selectedUserIds]));

  if (uniqueUserIds.length < 2) {
    throw new Error("Choose at least one other user for the group chat.");
  }

  const cleanName = name.trim() || "Group Chat";

  const { data: chat, error } = await supabase
    .from("chats")
    .insert({
      name: cleanName,
      is_group: true,
      created_by: creatorId
    })
    .select()
    .single();

  if (error) {
    console.error("create group chat error:", error);
    throw error;
  }

  const { error: membersError } = await supabase.from("chat_members").insert(
    uniqueUserIds.map((id) => ({
      chat_id: chat.id,
      user_id: id
    }))
  );

  if (membersError) {
    console.error("create group members error:", membersError);
    throw membersError;
  }

  return chat;
}

/* ================= MESSAGES ================= */

export async function sendMessage(payload: {
  chat_id: string;
  sender_id: string;
  ciphertext: string;
  iv: string;
}) {
  const { error } = await supabase.from("messages").insert(payload);

  if (error) {
    console.error("sendMessage error:", error);
    throw error;
  }
}

export async function getMessages(chatId: string) {
  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  if (messagesError) {
    console.error("getMessages error:", messagesError);
    return [];
  }

  const senderIds = Array.from(
    new Set((messages || []).map((message) => message.sender_id))
  );

  if (senderIds.length === 0) {
    return messages || [];
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email")
    .in("id", senderIds);

  if (profilesError) {
    console.error("getMessages profiles error:", profilesError);

    return (messages || []).map((message) => ({
      ...message,
      sender_email: "Unknown user"
    }));
  }

  const emailByUserId = new Map(
    (profiles || []).map((profile) => [profile.id, profile.email])
  );

  return (messages || []).map((message) => ({
    ...message,
    sender_email: emailByUserId.get(message.sender_id) || "Unknown user"
  }));
}