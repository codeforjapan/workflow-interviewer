"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function NewSessionButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSession = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      if (!res.ok) throw new Error(`failed: ${res.status}`);
      const data = (await res.json()) as { session: { id: string } };
      router.push(`/sessions/${data.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={startSession} disabled={creating}>
        {creating ? "作成中..." : "新しいセッションを開始"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
