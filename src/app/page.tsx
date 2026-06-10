"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUserSession } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const user = getUserSession();
    if (user) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [router]);
  return null;
}
