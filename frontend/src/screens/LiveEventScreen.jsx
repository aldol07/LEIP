import { useEffect, useMemo, useRef, useState } from "react";

import { EventPicker } from "../components/EventPicker";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

function upsertStage(existingStages, incoming) {
  const index = existingStages.findIndex((stage) => stage.stage_number === incoming.stage_number);
  if (index === -1) {
    return [...existingStages, incoming].sort((a, b) => a.stage_number - b.stage_number);
  }
  const copy = [...existingStages];
  copy[index] = { ...copy[index], ...incoming };
  return copy.sort((a, b) => a.stage_number - b.stage_number);
}

function dedupeAnalysisRows(rows) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = `${row.updated_summary || ""}|${row.trend || ""}|${row.source || "gemini"}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(row);
    if (result.length >= 20) {
      break;
    }
  }
  return result;
}

export function LiveEventScreen() {
  const { token, isAuthenticated } = useAuth();
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [stages, setStages] = useState([]);
  const [commentaryFeed, setCommentaryFeed] = useState([]);
  const [analysisFeed, setAnalysisFeed] = useState([]);
  const [alertFeed, setAlertFeed] = useState([]);
  const [rawFeed, setRawFeed] = useState([]);
  const [error, setError] = useState("");
  const socketRef = useRef(null);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === Number(selectedEventId)),
    [events, selectedEventId],
  );

  const loadEvents = async () => {
    try {
      const response = await api.get("/events/subscriptions", token);
      setEvents(response);
      if (response.length === 0) {
        setSelectedEventId("");
        setStages([]);
        setCommentaryFeed([]);
        setAnalysisFeed([]);
        setAlertFeed([]);
        setRawFeed([]);
        return;
      }
      if (!selectedEventId || !response.some((event) => event.id === Number(selectedEventId))) {
        const preferred = response.find((event) => event.event_status !== "Final") || response[0];
        setSelectedEventId(preferred.id);
      }
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  const loadStages = async (eventId) => {
    try {
      const response = await api.get(`/events/${eventId}/stages`, token);
      setStages(response.stages || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadRecentUpdates = async (eventId) => {
    try {
      const response = await api.get(`/events/${eventId}/updates`, token);
      setCommentaryFeed(response.commentary || []);
      setAnalysisFeed(dedupeAnalysisRows(response.analysis || []));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (!selectedEventId || !isAuthenticated) {
      return;
    }

    setRawFeed([]);
    setAlertFeed([]);
    loadStages(selectedEventId);
    loadRecentUpdates(selectedEventId);

    const polling = setInterval(() => loadStages(selectedEventId), 10000);
    const wsUrl = `${api.wsBaseUrl.replace(/^http/, "ws")}/ws/events/${selectedEventId}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setRawFeed((prev) => [payload, ...prev].slice(0, 40));

        if (payload.type === "groq_commentary") {
          setCommentaryFeed((prev) =>
            [
              {
                id: Date.now(),
                commentary: payload.commentary,
                model: payload.model,
                latency_ms: payload.latencyMs,
                created_at: payload.generatedAt,
              },
              ...prev,
            ].slice(0, 20),
          );
          return;
        }

        if (payload.type === "analysis_update" || payload.type === "analysis_catchup") {
          const analysisPayload = payload.analysis || payload;
          setAnalysisFeed((prev) =>
            {
              const incoming = {
                id: Date.now(),
                updated_summary: analysisPayload.updated_summary,
                key_moments: analysisPayload.key_moments || [],
                trend: analysisPayload.trend,
                prediction: analysisPayload.prediction,
                confidence: analysisPayload.confidence,
                source: analysisPayload.source || "gemini",
                created_at: analysisPayload.created_at || payload.publishedAt,
              };
              if (
                prev[0] &&
                prev[0].updated_summary === incoming.updated_summary &&
                prev[0].source === incoming.source
              ) {
                return prev;
              }
              return [incoming, ...prev].slice(0, 20);
            },
          );
          return;
        }

        if (payload.type === "alert_triggered") {
          setAlertFeed((prev) => [payload, ...prev].slice(0, 20));
          return;
        }

        if (payload.stageNumber && payload.stageStatus) {
          const normalized = {
            stage_number: Number(payload.stageNumber),
            stage_name: payload.stageName,
            status: payload.stageStatus,
            started_at: payload.stageStatus === "active" ? payload.timestamp : undefined,
            completed_at: payload.stageStatus === "done" ? payload.timestamp : undefined,
          };
          setStages((prev) => upsertStage(prev, normalized));
        }
      } catch (err) {
        setError(`WS parse error: ${err.message}`);
      }
    };

    ws.onerror = () => setError("WebSocket error. Check backend logs.");

    return () => {
      clearInterval(polling);
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, isAuthenticated]);

  if (!isAuthenticated) {
    return <section className="card">Please login first in Screen 01.</section>;
  }

  return (
    <div className="grid two-col">
      <section className="card">
        <h2>Live Event View</h2>
        <EventPicker
          events={events}
          selectedEventId={selectedEventId}
          setSelectedEventId={setSelectedEventId}
          label="Subscribed Event"
        />
        {events.length === 0 && (
          <p className="error-text">No subscribed events found. Subscribe from Screen 02, then return here.</p>
        )}
        {selectedEvent && (
          <p>
            {selectedEvent.sport} | {selectedEvent.home_team} vs {selectedEvent.away_team} |{" "}
            {selectedEvent.home_score}-{selectedEvent.away_score} | {selectedEvent.event_status}
          </p>
        )}
        {error && <p className="error-text">{error}</p>}

        <h3>Pipeline Stepper (Live)</h3>
        <ol className="stepper">
          {stages.map((stage) => (
            <li key={stage.stage_number} className={`stage ${stage.status}`}>
              <div>
                <strong>
                  {stage.stage_number}. {stage.stage_name}
                </strong>
              </div>
              <div>Status: {stage.status}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h3>Groq Commentary Feed</h3>
        <ul className="feed">
          {commentaryFeed.map((item) => (
            <li key={`${item.id}-${item.created_at}`}>
              <div>{item.commentary}</div>
              <small>
                {item.model} | {item.created_at}
                {item.latency_ms ? ` | ${item.latency_ms} ms` : ""}
              </small>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Gemini Analysis Stream</h3>
        <ul className="feed">
          {analysisFeed.map((item) => (
            <li key={`${item.id}-${item.created_at}`}>
              <div>{item.updated_summary}</div>
              <small>
                Trend: {item.trend} | Confidence: {Math.round((item.confidence || 0) * 100)}% | Source:{" "}
                {item.source || "gemini"}
              </small>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Alert Pushes</h3>
        <ul className="feed">
          {alertFeed.map((alert, idx) => (
            <li key={`${alert.ruleId}-${idx}`}>{alert.message}</li>
          ))}
        </ul>
        <h4>Raw WS Messages</h4>
        <pre className="raw-feed">{JSON.stringify(rawFeed.slice(0, 8), null, 2)}</pre>
      </section>
    </div>
  );
}
