import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

export function EventBrowserScreen() {
  const { token, isAuthenticated } = useAuth();
  const [events, setEvents] = useState([]);
  const [sportFilter, setSportFilter] = useState("all");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchEvents = async () => {
    if (!isAuthenticated) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/events", token);
      setEvents(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const sports = useMemo(
    () => ["all", ...new Set(events.map((event) => event.sport).filter(Boolean))],
    [events],
  );
  const filtered = useMemo(
    () => events.filter((event) => sportFilter === "all" || event.sport === sportFilter),
    [events, sportFilter],
  );

  const subscribe = async (eventId) => {
    setStatus("");
    setError("");
    try {
      await api.post(`/events/${eventId}/subscribe`, {}, token);
      setStatus(`Subscribed to event ${eventId}`);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!isAuthenticated) {
    return <section className="card">Please login first in Screen 01.</section>;
  }

  return (
    <section className="card">
      <h2>Event Browser</h2>
      <div className="toolbar">
        <label className="field">
          <span>Sport Filter</span>
          <select value={sportFilter} onChange={(event) => setSportFilter(event.target.value)}>
            {sports.map((sport) => (
              <option key={sport} value={sport}>
                {sport}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={fetchEvents} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {status && <p className="success-text">{status}</p>}

      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Sport</th>
            <th>Match</th>
            <th>Status</th>
            <th>Score</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((event) => (
            <tr key={event.id}>
              <td>{event.id}</td>
              <td>{event.sport}</td>
              <td>
                {event.home_team} vs {event.away_team}
              </td>
              <td>{event.event_status}</td>
              <td>
                {event.home_score} - {event.away_score}
              </td>
              <td>
                <button type="button" onClick={() => subscribe(event.id)}>
                  Subscribe
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
