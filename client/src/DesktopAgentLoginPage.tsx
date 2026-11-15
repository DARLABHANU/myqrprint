import { useEffect, useState } from "react";
import { QrCode, ShieldCheck } from "lucide-react";

export function DesktopAgentLoginPage() {
  const [message, setMessage] = useState("Checking your UrQrPrint sign-in…");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const state = new URLSearchParams(window.location.search).get("state") ?? "";
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(state)) {
      setError("This desktop sign-in link is invalid. Start again from the agent.");
      return;
    }
    void (async () => {
      try {
        const accountResponse = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (accountResponse.status === 401) {
          window.location.replace(`/login?desktopLogin=${encodeURIComponent(state)}`);
          return;
        }
        if (!accountResponse.ok) throw new Error("Could not check your account session. Please try again.");
        setMessage("Connecting this computer to your shop…");
        const response = await fetch("/api/agent/login/complete", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
        });
        const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not connect this desktop to your shop.");
        if (!cancelled) setMessage(body.message ?? "Sign-in complete. Return to the UrQrPrint desktop app.");
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Desktop sign-in did not finish.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f5f7f5", color: "#1d2a23", fontFamily: "'DM Sans', sans-serif" }}>
    <section style={{ width: "min(100%, 440px)", padding: 32, border: "1px solid #e2e9e4", borderRadius: 20, background: "#fff", textAlign: "center", boxShadow: "0 18px 45px #172b2010" }}>
      <div className="brand-mark" style={{ width: 44, height: 44, margin: "0 auto 18px", borderRadius: 13 }}><QrCode size={24} /></div>
      <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Connect UrQrPrint Agent</h1>
      <p role={error ? "alert" : "status"} style={{ margin: 0, color: error ? "#a33333" : "#66756c", lineHeight: 1.6 }}>{error || message}</p>
      {!error && <p style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, margin: "18px 0 0", color: "#718078", fontSize: 12 }}><ShieldCheck size={14} /> You can return to the desktop app after this step.</p>}
      {error && <a className="button button-primary" href="/login" style={{ marginTop: 18 }}>Go to sign in</a>}
    </section>
  </main>;
}
