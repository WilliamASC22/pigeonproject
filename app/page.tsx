"use client";

import { useEffect } from "react";
import { supabase } from "@/src/lib/supabase";

export default function Home() {
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();

      if (data.user) {
        window.location.href = "/chat";
      } else {
        window.location.href = "/login";
      }
    };

    checkUser();
  }, []);

  return <div>Loading PigeonProject...</div>;
}