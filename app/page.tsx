"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"

export default function Home() {
  const router = useRouter()

  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)

  // -----------------------------
  // CHECK LOGIN
  // -----------------------------
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser()

      if (!data.user) {
        router.push("/login")
        return
      }

      loadMessages()
    }

    checkUser()
  }, [])

  // -----------------------------
  // LOAD MESSAGES
  // -----------------------------
  async function loadMessages() {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Load error:", error.message)
      return
    }

    if (data) setMessages(data)
  }

  // -----------------------------
  // SEND MESSAGE
  // -----------------------------
  async function sendMessage() {
    if (!text.trim()) return

    setLoading(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error("Not logged in")
      setLoading(false)
      router.push("/login")
      return
    }

    const { error } = await supabase.from("messages").insert([
      {
        sender: user.id,
        receiver: user.id, // temporary (we'll upgrade later)
        ciphertext: text,
      },
    ])

    if (error) {
      console.error("Insert error:", error.message)
    }

    setText("")
    setLoading(false)
    loadMessages()
  }

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <main style={{ padding: 20, maxWidth: 600 }}>
      <h1>PigeonProject 💬</h1>

      {/* Messages */}
      <div style={{ marginTop: 20 }}>
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 10 }}>
            <b>{m.sender}:</b> {m.ciphertext}
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ marginTop: 20 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type message..."
          style={{ padding: 8, width: 250 }}
        />

        <button
          onClick={sendMessage}
          disabled={loading}
          style={{ marginLeft: 10, padding: 8 }}
        >
          {loading ? "Sending..." : "Send"}
        </button>
      </div>
    </main>
  )
}