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

/* ================= HELPERS ================= */

async function getAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error("You must be signed in.");
  }

  return data.user;
}

async function requireCurrentUser(userId: string) {
  const user = await getAuthenticatedUser();

  if (user.id !== userId) {
    throw new Error("You can only perform this action from your own account.");
  }

  return user;
}

async function isAcceptedContact(userId: string, contactUserId: string) {
  const { data, error } = await supabase
    .from("contacts")
    .select("id")
    .eq("user_id", userId)
    .eq("contact_user_id", contactUserId)
    .maybeSingle();

  if (error) {
    console.error("isAcceptedContact error:", error);
    throw error;
  }

  return Boolean(data);
}

async function requireAcceptedContact(userId: string, contactUserId: string) {
  if (userId === contactUserId) {
    throw new Error("You cannot start a chat with yourself.");
  }

  const accepted = await isAcceptedContact(userId, contactUserId);

  if (!accepted) {
    throw new Error("You can only start chats with accepted contacts.");
  }
}

async function requireAcceptedContacts(userId: string, contactUserIds: string[]) {
  const uniqueContactIds = Array.from(new Set(contactUserIds));

  for (const contactUserId of uniqueContactIds) {
    await requireAcceptedContact(userId, contactUserId);
  }
}

async function isChatMember(chatId: string, userId: string) {
  const { data, error } = await supabase
    .from("chat_members")
    .select("chat_id")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("isChatMember error:", error);
    throw error;
  }

  return Boolean(data);
}

async function requireChatMember(chatId: string, userId: string) {
  const member = await isChatMember(chatId, userId);

  if (!member) {
    throw new Error("You are not a member of this chat.");
  }
}

async function cleanupBrokenChat(chatId: string) {
  try {
    await supabase.from("chat_keys").delete().eq("chat_id", chatId);
    await supabase.from("messages").delete().eq("chat_id", chatId);
    await supabase.from("chat_members").delete().eq("chat_id", chatId);
    await supabase.from("chats").delete().eq("id", chatId);
  } catch (error) {
    console.error("cleanupBrokenChat error:", error);
  }
}

/* ================= USERS / PROFILES ================= */

export async function createProfile(user: any) {
  if (!user?.id || !user?.email) {
    throw new Error("Missing user account information.");
  }

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
  const currentUser = await getAuthenticatedUser();

  if (currentUser.id === userId) {
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

  await requireAcceptedContact(currentUser.id, userId);

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, e2ee_public_key")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("getProfileWithKeys public profile error:", error);
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    email: "Private user",
    username: data.username || "",
    e2ee_public_key: data.e2ee_public_key || null
  } as ProfileWithKeys;
}

export async function getProfilesForChatKey(userIds: string[]) {
  const user = await getAuthenticatedUser();

  if (userIds.length === 0) {
    return [];
  }

  const uniqueUserIds = Array.from(new Set(userIds));

  for (const userId of uniqueUserIds) {
    if (userId !== user.id) {
      await requireAcceptedContact(user.id, userId);
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, e2ee_public_key")
    .in("id", uniqueUserIds);

  if (error) {
    console.error("getProfilesForChatKey error:", error);
    throw error;
  }

  return ((data || []) as any[]).map((profile) => ({
    id: profile.id,
    email: "Private user",
    username: profile.username || "",
    e2ee_public_key: profile.e2ee_public_key || null
  })) as ProfileWithKeys[];
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
  await requireCurrentUser(userId);

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
  await requireCurrentUser(userId);

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
  await requireCurrentUser(userId);

  const { data, error } = await supabase
    .from("contacts")
    .select(
      "contact_user_id, profiles!contacts_contact_user_id_fkey(id, username, e2ee_public_key)"
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
      email: "Private user",
      username: profile?.username || "",
      e2ee_public_key: profile?.e2ee_public_key || null
    };
  });
}

export async function getUsers(userId?: string) {
  if (!userId) {
    return [];
  }

  return getMyContacts(userId);
}

export async function sendContactRequestByUsername(username: string) {
  const cleanUsername = username.trim().toLowerCase();

  if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
    throw new Error(
      "Username must be 3 to 24 characters and can only use letters, numbers, and underscores."
    );
  }

  const { data, error } = await supabase.rpc(
    "send_contact_request_by_username",
    {
      target_username: cleanUsername
    }
  );

  if (error) {
    console.error("sendContactRequestByUsername error:", error);
    throw new Error(error.message);
  }

  return data;
}

export async function getContactRequests(userId: string) {
  await requireCurrentUser(userId);

  const { data, error } = await supabase
    .from("contact_requests")
    .select(
      "id, requester_id, addressee_id, status, created_at, responded_at, requester:profiles!contact_requests_requester_id_fkey(id, username), addressee:profiles!contact_requests_addressee_id_fkey(id, username)"
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

/* ================= CHAT MEMBERS ================= */

export async function getChatMembers(chatId: string) {
  const user = await getAuthenticatedUser();
  await requireChatMember(chatId, user.id);

  const { data, error } = await supabase
    .from("chat_members")
    .select("chat_id, user_id, profiles(id, username, e2ee_public_key)")
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
      email: "Private user",
      username: profile?.username || "",
      e2ee_public_key: profile?.e2ee_public_key || null
    };
  }) as ChatMember[];
}

/* ================= MY CHATS ================= */

export async function getMyChats(userId: string) {
  await requireCurrentUser(userId);

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
    .select("chat_id, user_id, profiles(id, username, e2ee_public_key)")
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
      email: "Private user",
      username: profile?.username || "",
      e2ee_public_key: profile?.e2ee_public_key || null
    });
  });

  return rows
    .map((row) => {
      const chat = Array.isArray(row.chats) ? row.chats[0] : row.chats;

      if (!chat) {
        return null;
      }

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
            : "Direct Chat"
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

/* ================= DIRECT CHAT ================= */

export async function getOrCreateDirectChat(user1: string, user2: string) {
  await requireCurrentUser(user1);
  await requireAcceptedContact(user1, user2);

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

  try {
    const { error: membersError } = await supabase.from("chat_members").insert([
      { chat_id: chat.id, user_id: user1 },
      { chat_id: chat.id, user_id: user2 }
    ]);

    if (membersError) {
      throw membersError;
    }
  } catch (error) {
    console.error("create direct members error:", error);
    await cleanupBrokenChat(chat.id);
    throw error;
  }

  return chat;
}

/* ================= GROUP CHAT ================= */

export async function createGroupChat(
  creatorId: string,
  selectedUserIds: string[],
  name: string
) {
  await requireCurrentUser(creatorId);

  const uniqueSelectedIds = Array.from(
    new Set(selectedUserIds.filter((id) => id && id !== creatorId))
  );

  if (uniqueSelectedIds.length < 1) {
    throw new Error("Choose at least one other user for the group chat.");
  }

  await requireAcceptedContacts(creatorId, uniqueSelectedIds);

  const cleanName = name.trim().slice(0, 80) || "Group Chat";

  const { data, error } = await supabase.rpc("create_group_chat_checked", {
    group_name: cleanName,
    member_ids: uniqueSelectedIds
  });

  if (error) {
    console.error("createGroupChat error:", error);
    throw new Error(error.message || "Could not create group chat.");
  }

  return {
    id: data,
    name: cleanName,
    is_group: true,
    created_by: creatorId
  };
}

/* ================= CHAT KEYS ================= */

export async function getMyWrappedChatKey(chatId: string, userId: string) {
  await requireCurrentUser(userId);
  await requireChatMember(chatId, userId);

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
  const user = await getAuthenticatedUser();
  await requireChatMember(chatId, user.id);

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
  await requireCurrentUser(payload.wrapped_by_user_id);
  await requireChatMember(payload.chat_id, payload.wrapped_by_user_id);
  await requireChatMember(payload.chat_id, payload.user_id);

  const safePayload = {
    chat_id: payload.chat_id,
    user_id: payload.user_id,
    wrapped_by_user_id: payload.wrapped_by_user_id,
    encrypted_chat_key: payload.encrypted_chat_key,
    iv: payload.iv,
    algorithm: payload.algorithm || "ECDH-P256-HKDF-SHA256-AES256GCM"
  };

  const { error } = await supabase.from("chat_keys").upsert(safePayload, {
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
  await requireCurrentUser(payload.sender_id);
  await requireChatMember(payload.chat_id, payload.sender_id);

  if (!payload.ciphertext || !payload.iv) {
    throw new Error("Encrypted message data is missing.");
  }

  const safePayload = {
    chat_id: payload.chat_id,
    sender_id: payload.sender_id,
    ciphertext: payload.ciphertext,
    iv: payload.iv,
    crypto_version: payload.crypto_version || 2,
    algorithm: payload.algorithm || "AES-256-GCM"
  };

  const { error } = await supabase.from("messages").insert(safePayload);

  if (error) {
    console.error("sendMessage error:", error);
    throw error;
  }
}

export async function getMessages(chatId: string) {
  const user = await getAuthenticatedUser();
  await requireChatMember(chatId, user.id);

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
    .select("id, username")
    .in("id", senderIds);

  if (profilesError) {
    console.error("getMessages profiles error:", profilesError);

    return (messages || []).map((message) => ({
      ...message,
      sender_email: "Private user",
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
      sender_email: "Private user",
      sender_username: profile?.username || ""
    };
  });
}