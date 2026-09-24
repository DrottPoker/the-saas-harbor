"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onMessage } from "./live";

/** Re-renders the current page from the server when a new message arrives. */
export function RefreshOnMessage({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => onMessage(userId, () => router.refresh()), [userId, router]);
  return null;
}
