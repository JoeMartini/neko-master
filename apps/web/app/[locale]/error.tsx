"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Route-level error boundary. Deliberately avoids next-intl / app providers:
// if those are what crashed, this must still render.
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-500/15 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red-500 dark:text-red-400" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            页面渲染出错了，请重试。如果问题持续，请刷新页面或查看控制台日志。
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground/70 font-mono">digest: {error.digest}</p>
          )}
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={reset}>
          <RotateCcw className="w-3.5 h-3.5" />
          Retry / 重试
        </Button>
      </div>
    </div>
  );
}
