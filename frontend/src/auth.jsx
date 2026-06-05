import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getMe, logout as apiLogout } from "./api.js";
import Login from "./components/Login.jsx";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// Gates the app: shows the login screen until signed in.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try { setUser(await getMe()); } catch { setUser(null); }
  }, []);

  useEffect(() => { (async () => { await refreshUser(); setLoading(false); })(); }, [refreshUser]);

  // A 401 from any data call (e.g. session expired) bounces back to login.
  useEffect(() => {
    const on401 = () => setUser(null);
    window.addEventListener("auth:401", on401);
    return () => window.removeEventListener("auth:401", on401);
  }, []);

  const signOut = async () => { try { await apiLogout(); } catch { /* ignore */ } setUser(null); };

  if (loading) return <div className="auth-loading">Loading…</div>;
  if (!user) return <Login onAuthed={refreshUser} />;

  return (
    <AuthCtx.Provider value={{ user, setUser, refreshUser, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
