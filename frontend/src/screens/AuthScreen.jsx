import { useState } from "react";

import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

const initialSignup = {
  email: "",
  password: "",
  role: "viewer",
  notifications: {
    commentary: true,
    predictions: true,
    alerts: true,
  },
};

const initialLogin = {
  email: "",
  password: "",
};

export function AuthScreen() {
  const { login } = useAuth();
  const [signupData, setSignupData] = useState(initialSignup);
  const [loginData, setLoginData] = useState(initialLogin);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const response = await api.post("/auth/signup", {
        email: signupData.email,
        password: signupData.password,
        role: signupData.role,
      });
      login({
        accessToken: response.access_token,
        selectedRole: signupData.role,
        selectedEmail: signupData.email,
      });
      setSuccess("Signup complete. You are now authenticated.");
      setSignupData(initialSignup);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const response = await api.post("/auth/login", loginData);
      login({
        accessToken: response.access_token,
        selectedEmail: loginData.email,
      });
      setSuccess("Login complete.");
      setLoginData(initialLogin);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid two-col">
      <section className="card">
        <h2>Sign Up</h2>
        <p>Create account with role selection and notification preferences.</p>
        <form onSubmit={handleSignup} className="form">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={signupData.email}
              onChange={(event) =>
                setSignupData((prev) => ({ ...prev, email: event.target.value }))
              }
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={signupData.password}
              onChange={(event) =>
                setSignupData((prev) => ({ ...prev, password: event.target.value }))
              }
              required
            />
          </label>
          <label className="field">
            <span>Role</span>
            <select
              value={signupData.role}
              onChange={(event) =>
                setSignupData((prev) => ({ ...prev, role: event.target.value }))
              }
            >
              <option value="viewer">Viewer</option>
              <option value="analyst">Analyst</option>
            </select>
          </label>

          <fieldset className="fieldset">
            <legend>Notification Preferences</legend>
            {Object.entries(signupData.notifications).map(([key, enabled]) => (
              <label key={key} className="checkbox-line">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) =>
                    setSignupData((prev) => ({
                      ...prev,
                      notifications: {
                        ...prev.notifications,
                        [key]: event.target.checked,
                      },
                    }))
                  }
                />
                <span>{key}</span>
              </label>
            ))}
          </fieldset>
          <button type="submit" disabled={loading}>
            {loading ? "Processing..." : "Create Account"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Login</h2>
        <p>Use your registered credentials to continue.</p>
        <form onSubmit={handleLogin} className="form">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={loginData.email}
              onChange={(event) => setLoginData((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={loginData.password}
              onChange={(event) =>
                setLoginData((prev) => ({ ...prev, password: event.target.value }))
              }
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Processing..." : "Sign In"}
          </button>
        </form>
      </section>

      {(error || success) && (
        <section className="card full-width">
          {error && <p className="error-text">{error}</p>}
          {success && <p className="success-text">{success}</p>}
        </section>
      )}
    </div>
  );
}
