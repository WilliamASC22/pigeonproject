import { supabase } from "./supabase";

/* ================= USERS ================= */

export async function getUsers() {
  const { data } = await supabase.from("profiles").select("*");
  return data || [];
}

export async function createProfile(user: any) {
  await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email
  });
}

/* ================= CHAT ================= */

export async function getOrCreateDirectChat(user1: string, user2: string) {
  const { data: members } = await supabase
    .from("chat_members")
    .select("*");

  const map = new Map<string, Set<string>>();

  (members || []).forEach((m) => {
    if (!map.has(m.chat_id)) map.set(m.chat_id, new Set());
    map.get(m.chat_id)!.add(m.user_id);
  });

  for (const [chatId, users] of map.entries()) {
    if (users.has(user1) && users.has(user2) && users.size === 2) {
      return { id: chatId };
    }
  }

  const { data: chat, error } = await supabase
    .from("chats")
    .insert({ is_group: false })
    .select()
    .single();

  if (error) throw error;

  await supabase.from("chat_members").insert([
    { chat_id: chat.id, user_id: user1 },
    { chat_id: chat.id, user_id: user2 }
  ]);

  return chat;
}

/* ================= GROUP CHAT ================= */

export async function createGroupChat(userIds: string[], name: string) {
  const { data: chat, error } = await supabase
    .from("chats")
    .insert({
      name,
      is_group: true
    })
    .select()
    .single();

  if (error) throw error;

  await supabase.from("chat_members").insert(
    userIds.map((id) => ({
      chat_id: chat.id,
      user_id: id
    }))
  );

  return chat;
}

/* ================= MESSAGES ================= */

export async function sendMessage(payload: any) {
  const { error } = await supabase.from("messages").insert(payload);

  if (error) {
    console.error(error);
    throw error;
  }
}

export async function getMessages(chatId: string) {
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  return data || [];
}