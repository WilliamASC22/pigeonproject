"use client";

import { useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return alert(error.message);

    router.push("/");
  }

  async function signUp() {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) return alert(error.message);

    alert("Check email or try login");
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>PigeonProject 🕊️</h1>
        <p style={{ opacity: 0.6 }}>Secure encrypted messaging</p>

        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
        />

        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
        />

        <button onClick={signIn} style={styles.button}>
          Sign In
        </button>

        <button onClick={signUp} style={styles.button2}>
          Sign Up
        </button>
      </div>
    </div>
  );
}

const styles: any = {
  page: {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#0b0b0b",
    color: "white",
  },
  card: {
    width: 320,
    padding: 20,
    background: "#151515",
    borderRadius: 10,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  input: {
    padding: 10,
    borderRadius: 6,
    border: "none",
  },
  button: {
    padding: 10,
    background: "#4f46e5",
    color: "white",
    border: "none",
    borderRadius: 6,
  },
  button2: {
    padding: 10,
    background: "#333",
    color: "white",
    border: "none",
    borderRadius: 6,
  },
};