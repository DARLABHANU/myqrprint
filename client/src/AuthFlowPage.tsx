import { useState, useEffect, type FormEvent } from "react";
import { ArrowLeft, Check, LoaderCircle, QrCode } from "lucide-react";

type Flow = "login" | "register" | "otp" | "email" | "forgot" | "reset";

export function AuthFlowPage({ flow }: { flow: Flow }) {
  const params = new URLSearchParams(window.location.search);
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [token, setToken] = useState(params.get("token") ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const titles = {
    login: "Shop owner login",
    register: "Register your shop",
    otp: "Verify your registration",
    email: "Verify your email",
    forgot: "Reset your password",
    reset: "Choose a new password"
  };

  const introText = {
    login: "Use your Shop ID and password. We never ask for your Google password.",
    register: "Your Shop ID and customer QR are created after registration.",
    otp: "Enter the verification code sent to your email to activate your shop account.",
    email: "Enter your email and the verification token to activate your account.",
    forgot: "We'll email a time-limited password reset link if this address has an account.",
    reset: "Reset links expire after 30 minutes. Choose a new password below."
  };

  useEffect(() => {
    const urlToken = params.get("token");
    if (urlToken) setToken(urlToken);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);

    const endpoint = flow === "register"
      ? "/api/auth/register"
      : flow === "otp"
      ? "/api/auth/register/verify-code"
      : flow === "email"
      ? "/api/auth/verify-email"
      : flow === "forgot"
      ? "/api/auth/forgot-password"
      : flow === "reset"
      ? "/api/auth/reset-password"
      : "/api/auth/login";

    const payload = flow === "register"
      ? { email, password, shopName, ownerName, mobile, termsAccepted: true }
      : flow === "otp"
      ? { email, code: verificationCode }
      : flow === "email"
      ? { email, token }
      : flow === "forgot" || flow === "login"
      ? { email }
      : flow === "reset"
      ? { email, password, token }
      : { email, password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not complete this request.");

      if (flow === "register") {
        setMessage("Account created. Check your email to verify and log in.");
      } else if (flow === "otp") {
        setMessage("Registration verified successfully. Redirecting to login...");
        setTimeout(() => (window.location.href = "/login"), 1500);
      } else if (flow === "email") {
        setMessage("Email verified successfully. You can now sign in.");
      } else if (flow === "forgot") {
        setMessage("If an account exists, a reset link has been sent to " + email + ".");
      } else if (flow === "reset") {
        setMessage("Password updated. You can sign in now.");
      } else {
        setMessage("Welcome back. Redirecting to your dashboard...");
        setTimeout(() => (window.location.href = "/dashboard"), 1500);
      }
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "Could not complete this request.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const showPassword = flow !== "register" && flow !== "forgot" && flow !== "otp" && flow !== "email";

  return (
    <div className="legal-page">
      <a className="brand account-brand" href="/">
        <span className="brand-mark"><QrCode size={20} /></span>
        <span>printly<span className="brand-period">.</span></span>
      </a>
      <main className="legal-card">
        <a className="back-link" href="/login"><ArrowLeft size={15} /> Back to sign in</a>
        <div className="eyebrow"><span className="eyebrow-dot" /> ACCOUNT SECURITY</div>
        <h1>{titles[flow]}</h1>
        <p className="legal-intro">{introText[flow]}</p>

        <form className="account-form" onSubmit={(event) => void submit(event)}>
          <label>Email address
            <input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>

          {flow === "register" && (
            <>
              <label>Owner name
                <input required type="text" minLength={2} maxLength={100} value={ownerName} onChange={(event) => setOwnerName(event.target.value)} />
              </label>
              <label>Shop name
                <input required type="text" minLength={2} maxLength={100} value={shopName} onChange={(event) => setShopName(event.target.value)} />
              </label>
              <label>Mobile number
                <input required type="tel" minLength={7} maxLength={20} value={mobile} onChange={(event) => setMobile(event.target.value)} />
              </label>
              <label className="terms-acceptance">
                <input type="checkbox" required checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                <span>I agree to the <a href="/terms">Terms</a> and <a href="/privacy-policy">Privacy Notice</a>.</span>
              </label>
            </>
          )}

          {showPassword && (
            <label>Password
              <input required type="password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
              <small>Use at least 12 characters.</small>
            </label>
          )}

          {flow === "reset" && (
            <label>New password
              <input required type="password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
              <small>Use at least 12 characters.</small>
            </label>
          )}

          {flow === "otp" && (
            <label>Verification code
              <input required type="text" maxLength={8} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} />
              <small>Enter the 6-digit code sent to your email.</small>
            </label>
          )}

          {flow === "email" && (
            <label>Verification token
              <input required type="text" maxLength={64} value={token} onChange={(event) => setToken(event.target.value)} />
              <small>Enter the verification token from your email.</small>
            </label>
          )}

          {error && <div className="form-alert" role="alert">{error}</div>}
          {message && <div className="success-alert" role="status"><Check size={15} />{message}</div>}

          <button className="button button-dark account-submit" type="submit" disabled={busy}>
            {busy && <LoaderCircle className="spin" size={15} />}
            {flow === "register"
              ? "Create account"
              : flow === "otp"
              ? "Verify registration"
              : flow === "email"
              ? "Verify email"
              : flow === "forgot"
              ? "Send reset link"
              : flow === "reset"
              ? "Update password"
              : "Log in"}
          </button>
        </form>

        {flow === "login" && (
          <button className="text-link" type="button" onClick={async () => {
            const emailPrompt = prompt("Enter your email address:");
            if (!emailPrompt) return;
            setError("");
            setMessage("");
            try {
              const response = await fetch("/api/auth/resend-verification", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: emailPrompt })
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error);
              setMessage("If verification is needed, a new link has been sent to " + emailPrompt + ".");
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Could not resend the link.");
            }
          }}>
            Forgot password
          </button>
        )}

        <p><a href="/login">Return to sign in</a></p>
      </main>
    </div>
  );
}