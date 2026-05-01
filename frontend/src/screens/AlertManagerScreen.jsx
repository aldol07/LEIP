import { useEffect, useState } from "react";

import { EventPicker } from "../components/EventPicker";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

function buildRuleConfig(ruleType, formState) {
  if (ruleType === "keyword_detected") {
    return { keyword: formState.keyword };
  }
  if (ruleType === "score_threshold") {
    return { operator: formState.operator, threshold: Number(formState.threshold) };
  }
  return { from: formState.fromTrend, to: formState.toTrend };
}

export function AlertManagerScreen() {
  const { token, isAuthenticated, role } = useAuth();
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [ruleType, setRuleType] = useState("keyword_detected");
  const [formState, setFormState] = useState({
    keyword: "injury",
    operator: ">=",
    threshold: 3,
    fromTrend: "stable",
    toTrend: "momentum",
  });
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const loadEvents = async () => {
    const response = await api.get("/events/subscriptions", token);
    setEvents(response);
    if (response.length === 0) {
      setSelectedEventId("");
      setRules([]);
      setHistory([]);
      return;
    }
    if (!selectedEventId || !response.some((event) => event.id === Number(selectedEventId))) {
      const preferred = response.find((event) => event.event_status !== "Final") || response[0];
      setSelectedEventId(preferred.id);
    }
  };

  const loadRulesAndHistory = async (eventId = selectedEventId) => {
    if (!eventId) {
      return;
    }
    const [ruleRows, historyRows] = await Promise.all([
      api.get(`/alerts/rules?event_id=${eventId}`, token),
      api.get(`/alerts/history?event_id=${eventId}`, token),
    ]);
    setRules(ruleRows);
    setHistory(historyRows);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    loadEvents()
      .then(() => loadRulesAndHistory())
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    loadRulesAndHistory().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  const createRule = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("");
    try {
      await api.post(
        "/alerts/rules",
        {
          event_id: Number(selectedEventId),
          rule_type: ruleType,
          rule_config: buildRuleConfig(ruleType, formState),
        },
        token,
      );
      setStatus("Rule created.");
      await loadRulesAndHistory();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!isAuthenticated) {
    return <section className="card">Please login first in Screen 01.</section>;
  }

  return (
    <div className="grid two-col">
      <section className="card">
        <h2>Alert Manager</h2>
        <p>Define up to 5 rules per event. Analyst role required for creation.</p>
        <EventPicker events={events} selectedEventId={selectedEventId} setSelectedEventId={setSelectedEventId} />
        {events.length === 0 && (
          <p className="error-text">No subscribed events found. Subscribe from Screen 02, then return here.</p>
        )}

        <form className="form" onSubmit={createRule}>
          <label className="field">
            <span>Rule Type</span>
            <select value={ruleType} onChange={(event) => setRuleType(event.target.value)}>
              <option value="keyword_detected">keyword_detected</option>
              <option value="score_threshold">score_threshold</option>
              <option value="trend_change">trend_change</option>
            </select>
          </label>

          {ruleType === "keyword_detected" && (
            <label className="field">
              <span>Keyword</span>
              <input
                value={formState.keyword}
                onChange={(event) => setFormState((prev) => ({ ...prev, keyword: event.target.value }))}
              />
            </label>
          )}

          {ruleType === "score_threshold" && (
            <div className="inline-fields">
              <label className="field">
                <span>Operator</span>
                <select
                  value={formState.operator}
                  onChange={(event) => setFormState((prev) => ({ ...prev, operator: event.target.value }))}
                >
                  <option value=">=">{" >="}</option>
                  <option value=">">{">"}</option>
                  <option value="<=">{"<="}</option>
                  <option value="<">{"<"}</option>
                </select>
              </label>
              <label className="field">
                <span>Threshold</span>
                <input
                  type="number"
                  value={formState.threshold}
                  onChange={(event) => setFormState((prev) => ({ ...prev, threshold: event.target.value }))}
                />
              </label>
            </div>
          )}

          {ruleType === "trend_change" && (
            <div className="inline-fields">
              <label className="field">
                <span>From trend</span>
                <select
                  value={formState.fromTrend}
                  onChange={(event) => setFormState((prev) => ({ ...prev, fromTrend: event.target.value }))}
                >
                  <option value="momentum">momentum</option>
                  <option value="stable">stable</option>
                  <option value="reversal">reversal</option>
                </select>
              </label>
              <label className="field">
                <span>To trend</span>
                <select
                  value={formState.toTrend}
                  onChange={(event) => setFormState((prev) => ({ ...prev, toTrend: event.target.value }))}
                >
                  <option value="momentum">momentum</option>
                  <option value="stable">stable</option>
                  <option value="reversal">reversal</option>
                </select>
              </label>
            </div>
          )}

          <button type="submit" disabled={role === "viewer" || !selectedEventId}>
            Create Rule
          </button>
        </form>
        {role === "viewer" && (
          <p className="error-text">Viewer role is read-only and cannot create alert rules.</p>
        )}
        {status && <p className="success-text">{status}</p>}
        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="card">
        <h3>Rules</h3>
        <ul className="feed">
          {rules.map((rule) => (
            <li key={rule.id}>
              <div>
                #{rule.id} {rule.rule_type}
              </div>
              <small>{JSON.stringify(rule.rule_config)}</small>
            </li>
          ))}
        </ul>

        <h3>Recent Alert History</h3>
        <ul className="feed">
          {history.map((item) => (
            <li key={item.id}>
              <div>{item.message}</div>
              <small>{item.triggered_at}</small>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
