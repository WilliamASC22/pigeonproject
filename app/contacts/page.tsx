"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";
import {
  createProfile,
  getProfileWithKeys,
  saveUsername,
  getMyContacts,
  sendContactRequestByUsername,
  getContactRequests
} from "@/src/lib/chat";

type BannerType = "info" | "error";

function getJoinedProfile(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export default function ContactsPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");

  const [contactUsername, setContactUsername] = useState("");
  const [contacts, setContacts] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);

  const [bannerText, setBannerText] = useState("");
  const [bannerType, setBannerType] = useState<BannerType>("info");
  const [busy, setBusy] = useState(false);

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

  const incomingRequests = useMemo(() => {
    return requests.filter(
      (request) => request.addressee_id === user?.id && request.status === "pending"
    );
  }, [requests, user?.id]);

  const outgoingRequests = useMemo(() => {
    return requests.filter(
      (request) => request.requester_id === user?.id && request.status === "pending"
    );
  }, [requests, user?.id]);

  const loadData = useCallback(async (userId: string) => {
    const nextContacts = await getMyContacts(userId);
    setContacts(nextContacts);

    const nextRequests = await getContactRequests(userId);
    setRequests(nextRequests);
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

      const profile = await getProfileWithKeys(data.user.id);

      if (profile?.username) {
        setUsername(profile.username);
        setUsernameInput(profile.username);
      }

      await loadData(data.user.id);
      setLoading(false);
    };

    init();
  }, [loadData, router]);

  const handleSaveUsername = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) return;

    clearBanner();
    setBusy(true);

    try {
      const cleanUsername = await saveUsername(user.id, usernameInput);

      setUsername(cleanUsername);
      setUsernameInput(cleanUsername);

      showInfo("Username saved.");
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Could not save username.");
    } finally {
      setBusy(false);
    }
  };

  const handleSendContactRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) return;

    clearBanner();

    if (!contactUsername.trim()) {
      showError("Enter a username.");
      return;
    }

    setBusy(true);

    try {
      const result = await sendContactRequestByUsername(contactUsername);

      setContactUsername("");
      await loadData(user.id);

      showInfo(result?.message || "Contact request sent.");
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Could not send contact request.");
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async (requestId: number) => {
    if (!user) return;

    clearBanner();
    setBusy(true);

    try {
      const { error } = await supabase.rpc("accept_contact_request", {
        request_id: requestId
      });

      if (error) throw new Error(error.message);

      await loadData(user.id);
      showInfo("Contact request accepted.");
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Could not accept request.");
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (requestId: number) => {
    if (!user) return;

    clearBanner();
    setBusy(true);

    try {
      const { error } = await supabase.rpc("reject_contact_request", {
        request_id: requestId
      });

      if (error) throw new Error(error.message);

      await loadData(user.id);
      showInfo("Contact request rejected. They must wait 1 minute to request again.");
    } catch (error: any) {
      console.error(error);
      showError(error.message || "Could not reject request.");
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
          <h1 className="text-2xl font-semibold">Loading contacts</h1>
          <p className="mt-2 text-white/60">Opening your contact settings...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b141a] text-[#e9edef]">
      <header className="border-b border-white/10 bg-[#202c33] px-5 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Contacts</h1>
            <p className="text-sm text-white/55">
              Add people by username and manage requests.
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
          <section className="rounded-3xl border border-white/10 bg-[#202c33] p-5">
            <h2 className="text-lg font-semibold">Your username</h2>
            <p className="mt-1 text-sm text-white/55">
              People use this to send you a contact request.
            </p>

            <form onSubmit={handleSaveUsername} className="mt-4 space-y-3">
              <input
                value={usernameInput}
                onChange={(event) => setUsernameInput(event.target.value)}
                placeholder="example: john_123"
                className="h-12 w-full rounded-2xl border border-white/10 bg-[#111b21] px-4 outline-none focus:border-[#00a884]"
              />

              <button
                type="submit"
                disabled={busy}
                className="h-12 w-full rounded-2xl bg-[#00a884] font-semibold disabled:opacity-60"
              >
                Save username
              </button>
            </form>

            {username && (
              <p className="mt-3 text-sm text-white/60">
                Current username: <span className="font-semibold text-white">@{username}</span>
              </p>
            )}
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#202c33] p-5">
            <h2 className="text-lg font-semibold">Add contact</h2>
            <p className="mt-1 text-sm text-white/55">
              Type the exact username. The other person must accept.
            </p>

            <form onSubmit={handleSendContactRequest} className="mt-4 space-y-3">
              <input
                value={contactUsername}
                onChange={(event) => setContactUsername(event.target.value)}
                placeholder="Enter exact username"
                className="h-12 w-full rounded-2xl border border-white/10 bg-[#111b21] px-4 outline-none focus:border-[#00a884]"
              />

              <button
                type="submit"
                disabled={busy}
                className="h-12 w-full rounded-2xl bg-[#00a884] font-semibold disabled:opacity-60"
              >
                Send request
              </button>
            </form>

            <p className="mt-3 text-xs text-white/45">
              If a request is rejected, the sender must wait 1 minute before trying again.
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

        <div className="space-y-5">
          <section className="rounded-3xl border border-white/10 bg-[#202c33] p-5">
            <h2 className="text-lg font-semibold">Incoming requests</h2>

            <div className="mt-4 space-y-3">
              {incomingRequests.length === 0 ? (
                <p className="text-sm text-white/55">No incoming requests.</p>
              ) : (
                incomingRequests.map((request) => {
                  const requester = getJoinedProfile(request.requester);

                  return (
                    <div
                      key={request.id}
                      className="rounded-2xl border border-white/10 bg-[#111b21] p-4"
                    >
                      <p className="font-semibold">
                        @{requester?.username || "unknown"}
                      </p>

                      <p className="mt-1 text-sm text-white/55">
                        {requester?.email || "Unknown user"} wants to connect.
                      </p>

                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => handleAccept(request.id)}
                          disabled={busy}
                          className="flex-1 rounded-2xl bg-[#00a884] px-4 py-3 font-semibold disabled:opacity-60"
                        >
                          Accept
                        </button>

                        <button
                          onClick={() => handleReject(request.id)}
                          disabled={busy}
                          className="flex-1 rounded-2xl bg-[#f15c6d] px-4 py-3 font-semibold disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#202c33] p-5">
            <h2 className="text-lg font-semibold">Sent requests</h2>

            <div className="mt-4 space-y-3">
              {outgoingRequests.length === 0 ? (
                <p className="text-sm text-white/55">No pending sent requests.</p>
              ) : (
                outgoingRequests.map((request) => {
                  const addressee = getJoinedProfile(request.addressee);

                  return (
                    <div
                      key={request.id}
                      className="rounded-2xl border border-white/10 bg-[#111b21] p-4"
                    >
                      <p className="font-semibold">
                        @{addressee?.username || "unknown"}
                      </p>
                      <p className="mt-1 text-sm text-white/55">
                        Waiting for acceptance.
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#202c33] p-5">
            <h2 className="text-lg font-semibold">Accepted contacts</h2>

            <div className="mt-4 space-y-3">
              {contacts.length === 0 ? (
                <p className="text-sm text-white/55">
                  No contacts yet. Add someone by username first.
                </p>
              ) : (
                contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#111b21] p-4"
                  >
                    <div>
                      <p className="font-semibold">
                        {contact.username ? `@${contact.username}` : contact.email}
                      </p>

                      <p className="mt-1 text-sm text-white/50">
                        {contact.e2ee_public_key
                          ? "Encryption ready"
                          : "Needs encryption setup"}
                      </p>
                    </div>

                    <button
                      onClick={() => router.push("/chat")}
                      className="rounded-full bg-[#202c33] px-4 py-2 text-sm font-semibold hover:bg-[#2a3942]"
                    >
                      Chat
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}