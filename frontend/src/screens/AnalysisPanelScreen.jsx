import { useEffect, useState } from "react";

import { EventPicker } from "../components/EventPicker";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

export function AnalysisPanelScreen() {
  const { token, isAuthenticated } = useAuth();
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

  const loadEvents = async () => {
    const response = await api.get("/events/subscriptions", token);
    setEvents(response);
    if (response.length === 0) {
      setSelectedEventId("");
      return;
    }
    if (!selectedEventId || !response.some((event) => event.id === Number(selectedEventId))) {
      const preferred = response.find((event) => event.event_status !== "Final") || response[0];
      setSelectedEventId(preferred.id);
    }
  };

  const loadAnalysis = async (eventId) => {
    try {
      const response = await api.get(`/events/${eventId}/analysis`, token);
      setAnalysis(response);
      setError("");
    } catch (err) {
      setAnalysis(null);
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    loadEvents().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (!selectedEventId) {
      return;
    }
    loadAnalysis(selectedEventId);
    const interval = setInterval(() => loadAnalysis(selectedEventId), 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  if (!isAuthenticated) {
    return <section className="card">Please login first in Screen 01.</section>;
  }

  return (
    <section className="card">
      <h2>AI Analysis Panel</h2>
      <p>Gemini running summary with trend and confidence.</p>
      <EventPicker events={events} selectedEventId={selectedEventId} setSelectedEventId={setSelectedEventId} />
      {events.length === 0 && (
        <p className="error-text">No subscribed events found. Subscribe from Screen 02, then return here.</p>
      )}
      {error && <p className="error-text">{error}</p>}
      {analysis && (
        <div className="analysis-panel">
          <h3>Updated Summary</h3>
          <p>{analysis.updated_summary}</p>
          <h3>Trend</h3>
          <p className={`trend ${analysis.trend}`}>{analysis.trend}</p>
          <h3>Prediction</h3>
          <p>
            {analysis.prediction} ({Math.round(analysis.confidence * 100)}%)
          </p>
          <h3>Source</h3>
          <p>{analysis.source || "gemini"}</p>
          <h3>Key Moments</h3>
          <ul>
            {analysis.key_moments.map((moment, idx) => (
              <li key={`${idx}-${moment}`}>{moment}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
