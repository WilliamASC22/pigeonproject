"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();

      if (data.user) {
        router.replace("/chat");
      } else {
        router.replace("/login");
      }
    };

    void checkUser();
  }, [router]);

  return <div>Loading PigeonProject...</div>;
}