"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>業務インタビュー</CardTitle>
          <CardDescription>
            AI が業務についてヒアリングし、その場でフロー図を生成します。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            「新しいセッションを開始」を押すとインタビューが始まります。チャット形式で 5
            つの質問に答えていくと、右側のキャンバスにフロー図が描かれます。
          </p>
          <Button onClick={startSession} disabled={creating} className="w-full">
            {creating ? "作成中..." : "新しいセッションを開始"}
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
