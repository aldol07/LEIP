import { useEffect, useState } from "react";

import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

export function PredictionBoardScreen() {
  const { token, isAuthenticated } = useAuth();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadBoard = async () => {
    if (!isAuthenticated) {
      return;
    }
    setLoading(true);
    try {
      const response = await api.get("/predictions/board", token);
      setRows(response);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoard();
    const interval = setInterval(loadBoard, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <section className="card">Please login first in Screen 01.</section>;
  }

  return (
    <section className="card">
      <h2>Prediction Board</h2>
      <button type="button" onClick={loadBoard} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh Board"}
      </button>
      {error && <p className="error-text">{error}</p>}
      <table className="data-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Sport</th>
            <th>Match</th>
            <th>Prediction</th>
            <th>Trend</th>
            <th>Confidence</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.event_id}>
              <td>{row.event_id}</td>
              <td>{row.sport}</td>
              <td>
                {row.home_team} vs {row.away_team}
              </td>
              <td>{row.prediction}</td>
              <td>{row.trend}</td>
              <td>{Math.round((row.confidence || 0) * 100)}%</td>
              <td>{row.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
