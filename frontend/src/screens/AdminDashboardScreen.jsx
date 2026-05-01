import { useEffect, useState } from "react";

import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

export function AdminDashboardScreen() {
  const { token, isAuthenticated } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const loadDashboard = async () => {
    try {
      const response = await api.get("/admin/dashboard", token);
      setDashboard(response);
      setError("");
    } catch (err) {
      setDashboard(null);
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    loadDashboard();
    const interval = setInterval(loadDashboard, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const runTick = async (path) => {
    setStatus("");
    setError("");
    try {
      const response = await api.post(path, {}, token);
      setStatus(response.message || "Triggered.");
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!isAuthenticated) {
    return <section className="card">Please login first in Screen 01.</section>;
  }

  return (
    <section className="card">
      <h2>Admin Dashboard</h2>
      <div className="toolbar">
        <button type="button" onClick={() => runTick("/admin/trigger-ingestion")}>
          Trigger Ingestion
        </button>
        <button type="button" onClick={() => runTick("/admin/trigger-analysis")}>
          Trigger Analysis
        </button>
        <button type="button" onClick={loadDashboard}>
          Refresh
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {status && <p className="success-text">{status}</p>}

      {dashboard && (
        <div className="metrics-grid">
          <div className="metric">Events: {dashboard.events_total}</div>
          <div className="metric">Analysis calls: {dashboard.analysis_updates_total}</div>
          <div className="metric">Commentary calls: {dashboard.commentary_updates_total}</div>
          <div className="metric">Alerts: {dashboard.alerts_total}</div>
          <div className="metric">Reports: {dashboard.reports_total}</div>
          <div className="metric">Active WS connections: {dashboard.active_ws_connections}</div>
        </div>
      )}

      <h3>Bull Board</h3>
      <p>
        Open queue dashboard:{" "}
        <a href="http://localhost:3001/admin/queues" target="_blank" rel="noreferrer">
          http://localhost:3001/admin/queues
        </a>
      </p>
      <iframe
        title="Bull Board"
        src="http://localhost:3001/admin/queues"
        className="bullboard-frame"
      />
    </section>
  );
}
