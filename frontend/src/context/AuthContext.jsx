import { createContext, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);

const TOKEN_KEY = "leip_token";
const ROLE_KEY = "leip_role";
const EMAIL_KEY = "leip_email";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || "");
  const [role, setRole] = useState(localStorage.getItem(ROLE_KEY) || "");
  const [email, setEmail] = useState(localStorage.getItem(EMAIL_KEY) || "");

  const login = ({ accessToken, selectedRole, selectedEmail }) => {
    setToken(accessToken);
    localStorage.setItem(TOKEN_KEY, accessToken);
    if (selectedRole) {
      setRole(selectedRole);
      localStorage.setItem(ROLE_KEY, selectedRole);
    }
    if (selectedEmail) {
      setEmail(selectedEmail);
      localStorage.setItem(EMAIL_KEY, selectedEmail);
    }
  };

  const logout = () => {
    setToken("");
    setRole("");
    setEmail("");
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(EMAIL_KEY);
  };

  const value = useMemo(
    () => ({
      token,
      role,
      email,
      isAuthenticated: Boolean(token),
      login,
      logout,
    }),
    [token, role, email],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
