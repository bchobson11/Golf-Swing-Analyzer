import { useEffect, useRef, useState } from "react";
import { googleLogin, devLogin } from "../api.js";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Loads Google Identity Services once.
function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function Login({ onAuthed }) {
  const btnRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGis().then(() => {
      if (cancelled || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async (resp) => {
          try { await googleLogin(resp.credential); await onAuthed(); }
          catch (e) { setError(e.message || "Sign-in failed"); }
        },
      });
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: "filled_blue", size: "large", shape: "pill", text: "signin_with",
      });
    }).catch(() => setError("Could not load Google sign-in"));
    return () => { cancelled = true; };
  }, [onAuthed]);

  const doDevLogin = async () => {
    try { await devLogin(); await onAuthed(); }
    catch (e) { setError(e.message || "Dev login unavailable"); }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand"><span className="dot">⛳</span> Swing Library</div>
        <p className="muted">Sign in to access your swings.</p>

        {CLIENT_ID ? (
          <div ref={btnRef} className="google-btn" />
        ) : (
          <p className="muted small">Google sign-in isn’t configured (set <code>VITE_GOOGLE_CLIENT_ID</code>).</p>
        )}

        {import.meta.env.DEV && (
          <button className="dev-login" onClick={doDevLogin}>Dev sign in</button>
        )}

        {error && <p className="error">⚠ {error}</p>}
      </div>
    </div>
  );
}
