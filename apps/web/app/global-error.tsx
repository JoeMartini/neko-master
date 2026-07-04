"use client";

// Root-level error boundary — replaces the entire document when the locale
// layout itself throws, so it must render its own <html>/<body> and use no
// app providers or theme context.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#0b0f19",
          color: "#e2e8f0",
        }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 4 }}>
            应用出现了未处理的错误，请重试。
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>
              digest: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 20px",
              borderRadius: 9999,
              border: "1px solid #334155",
              background: "transparent",
              color: "#e2e8f0",
              fontSize: 13,
              cursor: "pointer",
            }}>
            Retry / 重试
          </button>
        </div>
      </body>
    </html>
  );
}
