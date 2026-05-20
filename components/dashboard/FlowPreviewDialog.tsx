"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FlowCanvas } from "@/components/canvas/FlowCanvas";
import type { ExtractedBusinessInfo, FlowLayout } from "@/lib/db/schema";

interface FlowPreviewDialogProps {
  sessionId: string | null;
  onClose: () => void;
}

interface SessionData {
  extractedData: ExtractedBusinessInfo;
  flowLayout: FlowLayout;
}

export function FlowPreviewDialog({ sessionId, onClose }: FlowPreviewDialogProps) {
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setData(null);
      return;
    }
    setLoading(true);
    fetch(`/api/sessions/${sessionId}`)
      .then((res) => res.json())
      .then((json: { session: SessionData }) => {
        setData(json.session);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <Dialog open={!!sessionId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex h-[80vh] max-w-4xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>フロー図プレビュー</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          {loading && (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              読み込み中...
            </div>
          )}
          {!loading && data && (
            <FlowCanvas
              extracted={data.extractedData}
              flowLayout={data.flowLayout}
              readonly
            />
          )}
          {!loading && !data && sessionId && (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              データを取得できませんでした
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
