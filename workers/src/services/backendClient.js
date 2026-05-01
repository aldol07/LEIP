import { config } from "../config.js";

async function request(path, options = {}) {
  const response = await fetch(`${config.backendInternalUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-worker-token": config.workerInternalToken,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`internal_api_error ${response.status} ${text}`);
  }
  return response.json();
}

export async function getEventWindow(eventId) {
  return request(`/events/${eventId}/window`);
}

export async function getEventStatus(eventId) {
  return request(`/events/${eventId}/status`);
}

export async function evaluateAlerts(eventId) {
  return request(`/events/${eventId}/evaluate-alerts`, { method: "POST" });
}

export async function upsertIngestionEvent(rawEvent) {
  return request("/ingestion/upsert", {
    method: "POST",
    body: JSON.stringify({ raw_event: rawEvent }),
  });
}

export async function accumulateStream(eventId, rawEvent) {
  return request("/ingestion/accumulate", {
    method: "POST",
    body: JSON.stringify({ event_id: eventId, raw_event: rawEvent }),
  });
}
