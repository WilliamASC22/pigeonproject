"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";
import {
  createProfile,
  getProfileWithKeys,
  saveUserKeyVault,
  getMyContacts,
  createGroupChat,
  getChatMembers,
  getProfilesForChatKey,
  saveWrappedChatKey,
  type ProfileWithKeys
} from "@/src/lib/chat";
import {
  createUserKeyBundle,
  unlockUserKeyBundle,
  generateChatKey,
  wrapChatKeyForUser,
  type EncryptedPrivateKeyVault,
  type UserKeyBundle
} from "@/src/lib/crypto";

type BannerType = "info" | "error";

function profileHasVault(profile: ProfileWithKeys | null) {
  return Boolean(
    profile?.e2ee_public_key &&
      profile?.e2ee_private_key_ciphertext &&
      profile?.e2ee_private_key_iv &&
      profile?.e2ee_private_key_salt
  );
}

function buildVaultFromProfile(profile: ProfileWithKeys): EncryptedPrivateKeyVault {
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
}

export default function GroupsPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<ProfileWithKeys | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [encryptionMode, setEncryptionMode] = useState<"setup" | "unlock" | null>(
    null
  );
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [userKeyBundle, setUserKeyBundle] = useState<UserKeyBundle | null>(null);
  const [e2eeReady, setE2eeReady] = useState(false);

  const [groupName, setGroupName] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const [bannerText, setBannerText] = useState("");
  const [bannerType, setBannerType] = useState<BannerType>("info");

  const selectedContacts = useMemo(() => {
    return contacts.filter((contact) => selectedUserIds.includes(contact.id));
  }, [contacts, selectedUserIds]);

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

  const loadContacts = useCallback(async (userId: string) => {
    const nextContacts = await getMyContacts(userId);
    setContacts(nextContacts);
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

      const nextProfile = await getProfileWithKeys(data.user.id);
      setProfile(nextProfile);

      if (profileHasVault(nextProfile)) {
        setEncryptionMode("unlock");
      } else {
        setEncryptionMode("setup");
      }

      await loadContacts(data.user.id);
      setLoading(false);
    };

    init();
  }, [loadContacts, router]);

  const handleEncryptionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) return;

    clearBanner();

    if (encryptionPassword.length < 12) {
      showError("Use an encryption password with at least 12 characters.");
      return;
    }

    setBusy(true);

    try {
      if (encryptionMode === "setup") {
        const vault = await createUserKeyBundle(encryptionPassword);
        await saveUserKeyVault(user.id, vault);

        const unlocked = await unlockUserKeyBundle(encryptionPassword, vault);
        setUserKeyBundle(unlocked);

        const updatedProfile = await getProfileWithKeys(user.id);
        setProfile(updatedProfile);

        showInfo("Encryption is set up for this account.");
      } else {
        if (!profile) {
          throw new Error("Could not find your encryption profile.");
        }

        const vault = buildVaultFromProfile(profile);
        const unlocked = await unlockUserKeyBundle(encryptionPassword, vault);
        setUserKeyBundle(unlocked);

        showInfo("Encryption unlocked.");
      }

      setEncryptionPassword("");
      setEncryptionMode(null);
      setE2eeReady(true);
    } catch (error: any) {
      console.error(error);
      showError(
        encryptionMode === "setup"
          ? error.message || "Could not set up encryption."
          : "Could not unlock encryption. Check your encryption password."
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleContact = (contactId: string) => {
    setSelectedUserIds((current) => {
      if (current.includes(contactId)) {
        return current.filter((id) => id !== contactId);
      }

      return [...current, contactId];
    });
  };

  const handleCreateGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user || !userKeyBundle) return;

    clearBanner();

    if (selectedUserIds.length === 0) {
      showError("Choose at least one contact.");
      return;
    }

    const missingEncryption = selectedContacts.find(
      (contact) => !contact.e2ee_public_key
    );

    if (missingEncryption) {
      showError(
        `${missingEncryption.username ? `@${missingEncryption.username}` : missingEncryption.email} must set up encryption before they can join an E2EE group.`
      );
      return;
    }

    setBusy(true);

    try {
      const chat = await createGroupChat(
        user.id,
        selectedUserIds,
        groupName || "Group Chat"
      );

      const chatId = String(chat.id);
      const members = await getChatMembers(chatId);
      const memberIds = Array.from(new Set(members.map((member) => member.id)));

      const profiles = await getProfilesForChatKey(memberIds);
      const profilesById = new Map<string, ProfileWithKeys>();

      profiles.forEach((memberProfile) => {
        profilesById.set(memberProfile.id, memberProfile);
      });

      if (!profilesById.has(user.id)) {
        profilesById.set(user.id, {
          id: user.id,
          email: user.email,
          username: profile?.username || "",
          e2ee_public_key: userKeyBundle.publicKeyJwk
        });
      }

      const profilesToWrap = memberIds.map((id) => profilesById.get(id));
      const missingProfiles = profilesToWrap.filter(
        (memberProfile) => !memberProfile?.e2ee_public_key
      );

      if (missingProfiles.length > 0) {
        throw new Error(
          "Every group member must set up encryption before the group can be created."
        );
      }

      const chatKey = await generateChatKey();

      for (const memberProfile of profilesToWrap) {
        if (!memberProfile?.e2ee_public_key) continue;

        const wrapped = await wrapChatKeyForUser({
          chatKey,
          myPrivateKey: userKeyBundle.privateKey,
          otherUserPublicKeyJwk: memberProfile.e2ee_public_key,
          chatId
        });

        await saveWrappedChatKey({
          chat_id: chatId,
          user_id: memberProfile.id,
          wrapped_by_user_id: user.id,
          encrypted_chat_key: wrapped.encryptedChatKey,
          iv: wrapped.iv,
          algorithm: wrapped.algorithm
        });
      }

      showInfo("Group created.");
      router.push("/chat");
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Could not create group.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0b141a] text-white flex items-center justify-center p-6">
        <div className="rounded-3xl bg-[#202c33] border border-white/10 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#00a884] text-3xl">
            🕊️
          </div>
          <h1 className="text-2xl font-semibold">Loading groups</h1>
          <p className="mt-2 text-white/60">Opening group creation...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b141a] text-[#e9edef]">
      <header className="border-b border-white/10 bg-[#202c33] px-5 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Create group</h1>
            <p className="text-sm text-white/55">
              Choose accepted contacts and create an encrypted group chat.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => router.push("/chat")}
              className="rounded-full bg-[#111b21] px-4 py-2 text-sm font-semibold hover:bg-[#2a3942]"
            >
              Back to chat
            </button>

            <button
              onClick={logout}
              className="rounded-full bg-[#111b21] px-4 py-2 text-sm font-semibold hover:bg-[#2a3942]"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          {!e2eeReady && (
            <section className="rounded-3xl border border-white/10 bg-[#202c33] p-5">
              <h2 className="text-lg font-semibold">
                {encryptionMode === "setup"
                  ? "Set up encryption"
                  : "Unlock encryption"}
              </h2>

              <p className="mt-1 text-sm text-white/55">
                Groups need your encryption key so the group chat key can be protected.
              </p>

              <form onSubmit={handleEncryptionSubmit} className="mt-4 space-y-3">
                <input
                  value={encryptionPassword}
                  onChange={(event) => setEncryptionPassword(event.target.value)}
                  type="password"
                  placeholder="Encryption password"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-[#111b21] px-4 outline-none focus:border-[#00a884]"
                />

                <button
                  type="submit"
                  disabled={busy}
                  className="h-12 w-full rounded-2xl bg-[#00a884] font-semibold disabled:opacity-60"
                >
                  {busy
                    ? "Please wait..."
                    : encryptionMode === "setup"
                      ? "Set up encryption"
                      : "Unlock encryption"}
                </button>
              </form>
            </section>
          )}

          <section className="rounded-3xl border border-white/10 bg-[#202c33] p-5">
            <h2 className="text-lg font-semibold">Group details</h2>

            <form onSubmit={handleCreateGroup} className="mt-4 space-y-3">
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Group name"
                disabled={!e2eeReady}
                className="h-12 w-full rounded-2xl border border-white/10 bg-[#111b21] px-4 outline-none focus:border-[#00a884] disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={!e2eeReady || busy || selectedUserIds.length === 0}
                className="h-12 w-full rounded-2xl bg-[#00a884] font-semibold disabled:opacity-60"
              >
                Create encrypted group
              </button>
            </form>

            <p className="mt-3 text-xs text-white/45">
              Only accepted contacts can be added. Every member must have encryption set up.
            </p>
          </section>

          {bannerText && (
            <div
              className={
                bannerType === "error"
                  ? "rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-100"
                  : "rounded-2xl border border-[#00a884]/30 bg-[#00a884]/10 p-4 text-emerald-100"
              }
            >
              {bannerText}
            </div>
          )}
        </div>

        <section className="rounded-3xl border border-white/10 bg-[#202c33] p-5">
          <h2 className="text-lg font-semibold">Choose contacts</h2>
          <p className="mt-1 text-sm text-white/55">
            Selected: {selectedUserIds.length}
          </p>

          <div className="mt-4 space-y-3">
            {contacts.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#111b21] p-4">
                <p className="font-semibold">No contacts yet</p>
                <p className="mt-1 text-sm text-white/55">
                  Add contacts first before creating a group.
                </p>

                <button
                  onClick={() => router.push("/contacts")}
                  className="mt-4 rounded-2xl bg-[#00a884] px-4 py-3 font-semibold"
                >
                  Go to contacts
                </button>
              </div>
            ) : (
              contacts.map((contact) => {
                const encryptionReady = Boolean(contact.e2ee_public_key);
                const selected = selectedUserIds.includes(contact.id);

                return (
                  <button
                    key={contact.id}
                    type="button"
                    disabled={!e2eeReady || !encryptionReady}
                    onClick={() => toggleContact(contact.id)}
                    className={
                      selected
                        ? "flex w-full items-center justify-between gap-4 rounded-2xl border border-[#00a884] bg-[#00a884]/15 p-4 text-left"
                        : "flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#111b21] p-4 text-left disabled:opacity-50"
                    }
                  >
                    <div>
                      <p className="font-semibold">
                        {contact.username ? `@${contact.username}` : contact.email}
                      </p>

                      <p className="mt-1 text-sm text-white/55">
                        {encryptionReady
                          ? "Encryption ready"
                          : "Needs encryption setup"}
                      </p>
                    </div>

                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#202c33] text-sm">
                      {selected ? "✓" : ""}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </section>
    </main>
  );
}