import { useEffect, useState } from "react";

import { EventPicker } from "../components/EventPicker";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

export function PostEventReportScreen() {
  const { token, isAuthenticated } = useAuth();
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    api
      .get("/events/subscriptions", token)
      .then((response) => {
        setEvents(response);
        if (response.length > 0) {
          const preferred = response.find((event) => event.event_status !== "Final") || response[0];
          setSelectedEventId(preferred.id);
        } else {
          setSelectedEventId("");
          setReport(null);
        }
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const fetchReport = async () => {
    if (!selectedEventId) {
      return;
    }
    try {
      const response = await api.get(`/events/${selectedEventId}/report`, token);
      setReport(response);
      setError("");
    } catch (err) {
      setReport(null);
      setError(err.message);
    }
  };

  if (!isAuthenticated) {
    return <section className="card">Please login first in Screen 01.</section>;
  }

  return (
    <section className="card">
      <h2>Post Event Report</h2>
      <EventPicker events={events} selectedEventId={selectedEventId} setSelectedEventId={setSelectedEventId} />
      {events.length === 0 && (
        <p className="error-text">No subscribed events found. Subscribe from Screen 02, then return here.</p>
      )}
      <button type="button" onClick={fetchReport} disabled={!selectedEventId}>
        Load Report
      </button>
      {error && <p className="error-text">{error}</p>}
      {report && (
        <div className="analysis-panel">
          <h3>Narrative Summary</h3>
          <p>{report.narrative_summary}</p>
          <h3>Top 5 Key Moments</h3>
          <ul>
            {report.top_key_moments.map((moment, idx) => (
              <li key={`${idx}-${moment}`}>{moment}</li>
            ))}
          </ul>
          <h3>Prediction Accuracy</h3>
          <p>{Math.round((report.prediction_accuracy_score || 0) * 100)}%</p>
        </div>
      )}
    </section>
  );
}
