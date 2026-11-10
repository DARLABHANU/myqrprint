import { useState, type FormEvent } from "react";
import { ArrowLeft, Check, LoaderCircle, QrCode } from "lucide-react";

type Flow = "verify" | "forgot" | "reset";

export function AuthFlowPage({ flow }: { flow: Flow }) {
  const params = new URLSearchParams(window.location.search);
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const titles = { verify: "Verify your email", forgot: "Reset your password", reset: "Choose a new password" };

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage(""); setBusy(true);
    const endpoint = flow === "verify" ? "/api/auth/verify-email" : flow === "forgot" ? "/api/auth/forgot-password" : "/api/auth/reset-password";
    const payload = flow === "verify" || flow === "reset" ? { email, token, ...(flow === "reset" ? { password } : {}) } : { email };
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not complete this request.");
      setMessage(body.message ?? (flow === "verify" ? "Email verified. You can sign in now." : "Password updated. You can sign in now."));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not complete this request."); }
    finally { setBusy(false); }
  }

  return <div className="legal-page"><a className="brand account-brand" href="/"><span className="brand-mark"><QrCode size={20} /></span><span>printly<span className="brand-period">.</span></span></a><main className="legal-card"><a className="back-link" href="/login"><ArrowLeft size={15} /> Back to sign in</a><div className="eyebrow"><span className="eyebrow-dot" /> ACCOUNT SECURITY</div><h1>{titles[flow]}</h1><p className="legal-intro">{flow === "verify" ? "Enter the verification token from your email link." : flow === "forgot" ? "We’ll email a time-limited password reset link if this address has an account." : "Reset links expire after 30 minutes."}</p><form className="account-form" onSubmit={(event) => void submit(event)}><label>Email address<input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>{flow !== "forgot" && <label>{flow === "verify" ? "Verification token" : "Reset token"}<input required minLength={64} maxLength={64} value={token} onChange={(event) => setToken(event.target.value)} /></label>}{flow === "reset" && <label>New password<input required type="password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /><small>Use at least 12 characters.</small></label>}{error && <div className="form-alert" role="alert">{error}</div>}{message && <div className="success-alert" role="status"><Check size={15} />{message}</div>}<button className="button button-dark account-submit" type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={15} />}{flow === "verify" ? "Verify email" : flow === "forgot" ? "Send reset link" : "Update password"}</button></form>{flow === "verify" && <button className="text-link" type="button" onClick={async () => { setError(""); setMessage(""); try { const response = await fetch("/api/auth/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }); const result = await response.json() as { message?: string; error?: string }; if (!response.ok) throw new Error(result.error); setMessage(result.message ?? "If verification is needed, a new link has been sent."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not resend the link."); } }}>Resend verification email</button>}<p><a href="/login">Return to sign in</a></p></main></div>;
}
