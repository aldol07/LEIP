const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
const WS_BASE = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8000/api/v1";

async function request(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.detail || `Request failed with status ${response.status}`);
  }
  return payload;
}

export const api = {
  baseUrl: API_BASE,
  wsBaseUrl: WS_BASE,
  get: (path, token) => request(path, { method: "GET", token }),
  post: (path, body, token) => request(path, { method: "POST", body, token }),
};
