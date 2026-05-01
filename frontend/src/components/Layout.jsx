import { NavLink } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/auth", label: "01 Auth" },
  { to: "/events", label: "02 Browser" },
  { to: "/live", label: "03 Live Event" },
  { to: "/analysis", label: "04 Analysis" },
  { to: "/predictions", label: "05 Predictions" },
  { to: "/alerts", label: "06 Alerts" },
  { to: "/reports", label: "07 Report" },
  { to: "/admin", label: "08 Admin" },
];

export function Layout({ children }) {
  const { isAuthenticated, email, role, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Live Event Intelligence Platform</h1>
          <p>Assignment 5 - FastAPI + BullMQ + WebSockets</p>
        </div>
        <div className="auth-badge">
          <div>{isAuthenticated ? `Signed in as ${email || "user"}` : "Not signed in"}</div>
          <div>{role ? `Role: ${role}` : ""}</div>
          {isAuthenticated && (
            <button type="button" onClick={logout}>
              Logout
            </button>
          )}
        </div>
      </header>

      <nav className="nav-tabs">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => (isActive ? "tab active" : "tab")}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <main className="content">{children}</main>
    </div>
  );
}
