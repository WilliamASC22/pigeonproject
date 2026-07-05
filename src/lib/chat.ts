import { supabase } from "./supabase";

/* ================= TYPES ================= */

export type ProfileWithKeys = {
  id: string;
  email: string;
  username?: string | null;
  e2ee_public_key?: JsonWebKey | null;
  e2ee_private_key_ciphertext?: string | null;
  e2ee_private_key_iv?: string | null;
  e2ee_private_key_salt?: string | null;
  e2ee_kdf?: string | null;
  e2ee_kdf_iterations?: number | null;
  e2ee_version?: number | null;
};

export type ChatMember = {
  id: string;
  email: string;
  username?: string | null;
  e2ee_public_key?: JsonWebKey | null;
};

/* ================= USERS / PROFILES ================= */

export async function createProfile(user: any) {
  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email
    },
    {
      onConflict: "id"
    }
  );

  if (error) {
    console.error("createProfile error:", error);
    throw error;
  }
}

export async function getProfileWithKeys(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, email, username, e2ee_public_key, e2ee_private_key_ciphertext, e2ee_private_key_iv, e2ee_private_key_salt, e2ee_kdf, e2ee_kdf_iterations, e2ee_version"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("getProfileWithKeys error:", error);
    throw error;
  }

  return data as ProfileWithKeys | null;
}

export async function getProfilesForChatKey(userIds: string[]) {
  if (userIds.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, username, e2ee_public_key")
    .in("id", userIds);

  if (error) {
    console.error("getProfilesForChatKey error:", error);
    throw error;
  }

  return (data || []) as ProfileWithKeys[];
}

export async function saveUserKeyVault(
  userId: string,
  vault: {
    publicKeyJwk: JsonWebKey;
    encryptedPrivateKey: string;
    privateKeyIv: string;
    privateKeySalt: string;
    kdf: string;
    kdfIterations: number;
    version: number;
  }
) {
  const { error } = await supabase
    .from("profiles")
    .update({
      e2ee_public_key: vault.publicKeyJwk,
      e2ee_private_key_ciphertext: vault.encryptedPrivateKey,
      e2ee_private_key_iv: vault.privateKeyIv,
      e2ee_private_key_salt: vault.privateKeySalt,
      e2ee_kdf: vault.kdf,
      e2ee_kdf_iterations: vault.kdfIterations,
      e2ee_version: vault.version
    })
    .eq("id", userId);

  if (error) {
    console.error("saveUserKeyVault error:", error);
    throw error;
  }
}

export async function saveUsername(userId: string, username: string) {
  const cleanUsername = username.trim().toLowerCase();

  if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
    throw new Error(
      "Username must be 3 to 24 characters and can only use letters, numbers, and underscores."
    );
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      username: cleanUsername
    })
    .eq("id", userId);

  if (error) {
    if (error.code === "23505") {
      throw new Error("That username is already taken.");
    }

    console.error("saveUsername error:", error);
    throw error;
  }

  return cleanUsername;
}

/* ================= CONTACTS ================= */

export async function getMyContacts(userId: string) {
  const { data, error } = await supabase
    .from("contacts")
    .select(
      "contact_user_id, profiles!contacts_contact_user_id_fkey(id, email, username, e2ee_public_key)"
    )
    .eq("user_id", userId);

  if (error) {
    console.error("getMyContacts error:", error);
    return [];
  }

  return ((data || []) as any[]).map((row) => {
    const profile = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles;

    return {
      id: row.contact_user_id,
      email: profile?.email || "Unknown user",
      username: profile?.username || "",
      e2ee_public_key: profile?.e2ee_public_key || null
    };
  });
}

export async function getUsers(userId?: string) {
  if (!userId) return [];
  return getMyContacts(userId);
}

export async function sendContactRequestByUsername(username: string) {
  const { data, error } = await supabase.rpc(
    "send_contact_request_by_username",
    {
      target_username: username
    }
  );

  if (error) {
    console.error("sendContactRequestByUsername error:", error);
    throw new Error(error.message);
  }

  return data;
}

export async function getContactRequests(userId: string) {
  const { data, error } = await supabase
    .from("contact_requests")
    .select(
      "id, requester_id, addressee_id, status, created_at, responded_at, requester:profiles!contact_requests_requester_id_fkey(id, email, username), addressee:profiles!contact_requests_addressee_id_fkey(id, email, username)"
    )
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getContactRequests error:", error);
    return [];
  }

  return data || [];
}

export async function acceptContactRequest(requestId: number) {
  const { data, error } = await supabase.rpc("accept_contact_request", {
    request_id: requestId
  });

  if (error) {
    console.error("acceptContactRequest error:", error);
    throw new Error(error.message);
  }

  return data;
}

export async function rejectContactRequest(requestId: number) {
  const { data, error } = await supabase.rpc("reject_contact_request", {
    request_id: requestId
  });

  if (error) {
    console.error("rejectContactRequest error:", error);
    throw new Error(error.message);
  }

  return data;
}

/* ================= MY CHATS ================= */

export async function getChatMembers(chatId: string) {
  const { data, error } = await supabase
    .from("chat_members")
    .select("chat_id, user_id, profiles(id, email, username, e2ee_public_key)")
    .eq("chat_id", chatId);

  if (error) {
    console.error("getChatMembers error:", error);
    throw error;
  }

  return ((data || []) as any[]).map((row) => {
    const profile = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles;

    return {
      id: row.user_id,
      email: profile?.email || "Unknown user",
      username: profile?.username || "",
      e2ee_public_key: profile?.e2ee_public_key || null
    };
  }) as ChatMember[];
}

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
    .select("chat_id, user_id, profiles(id, email, username, e2ee_public_key)")
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
      email: profile?.email || "Unknown user",
      username: profile?.username || "",
      e2ee_public_key: profile?.e2ee_public_key || null
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
          : otherUser?.username
            ? `@${otherUser.username}`
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

/* ================= CHAT KEYS ================= */

export async function getMyWrappedChatKey(chatId: string, userId: string) {
  const { data, error } = await supabase
    .from("chat_keys")
    .select(
      "id, chat_id, user_id, wrapped_by_user_id, encrypted_chat_key, iv, algorithm, created_at"
    )
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("getMyWrappedChatKey error:", error);
    throw error;
  }

  return data;
}

export async function getChatKeyRowsForChat(chatId: string) {
  const { data, error } = await supabase
    .from("chat_keys")
    .select(
      "id, chat_id, user_id, wrapped_by_user_id, encrypted_chat_key, iv, algorithm, created_at"
    )
    .eq("chat_id", chatId);

  if (error) {
    console.error("getChatKeyRowsForChat error:", error);
    throw error;
  }

  return data || [];
}

export async function saveWrappedChatKey(payload: {
  chat_id: string;
  user_id: string;
  wrapped_by_user_id: string;
  encrypted_chat_key: string;
  iv: string;
  algorithm: string;
}) {
  const { error } = await supabase.from("chat_keys").upsert(payload, {
    onConflict: "chat_id,user_id"
  });

  if (error) {
    console.error("saveWrappedChatKey error:", error);
    throw error;
  }
}

/* ================= MESSAGES ================= */

export async function sendMessage(payload: {
  chat_id: string;
  sender_id: string;
  ciphertext: string;
  iv: string;
  crypto_version?: number;
  algorithm?: string;
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
    .select("id, email, username")
    .in("id", senderIds);

  if (profilesError) {
    console.error("getMessages profiles error:", profilesError);

    return (messages || []).map((message) => ({
      ...message,
      sender_email: "Unknown user",
      sender_username: ""
    }));
  }

  const profileByUserId = new Map(
    (profiles || []).map((profile) => [profile.id, profile])
  );

  return (messages || []).map((message) => {
    const profile = profileByUserId.get(message.sender_id);

    return {
      ...message,
      sender_email: profile?.email || "Unknown user",
      sender_username: profile?.username || ""
    };
  });
}