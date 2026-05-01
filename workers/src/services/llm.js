import { config } from "../config.js";

const ALLOWED_TRENDS = new Set(["momentum", "stable", "reversal"]);
const RETRYABLE_GEMINI_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_GEMINI_ERROR_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "ENETUNREACH", "ECONNREFUSED"]);

let geminiQueueTail = Promise.resolve();
let geminiNextAllowedAt = 0;

function withTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildGeminiError(message, meta = {}) {
  const error = new Error(message);
  Object.assign(error, meta);
  return error;
}

function parseRetryAfterMs(headers) {
  const raw = headers?.get?.("retry-after");
  if (!raw) {
    return null;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1000);
  }
  const dateMs = Date.parse(raw);
  if (Number.isNaN(dateMs)) {
    return null;
  }
  return Math.max(0, dateMs - Date.now());
}

function isRetryableTransportError(error) {
  if (!error) {
    return false;
  }
  if (error.name === "AbortError") {
    return true;
  }
  const code = String(error.code || "");
  return RETRYABLE_GEMINI_ERROR_CODES.has(code);
}

function computeGeminiBackoffMs(attempt, retryAfterMs = null) {
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return retryAfterMs;
  }
  const exponential = Math.min(
    config.geminiMaxBackoffMs,
    config.geminiInitialBackoffMs * 2 ** Math.max(0, attempt - 1),
  );
  const jitter = Math.floor(Math.random() * 300);
  return exponential + jitter;
}

function enqueueGeminiRequest(task) {
  const run = async () => {
    const waitMs = Math.max(0, geminiNextAllowedAt - Date.now());
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    try {
      return await task();
    } finally {
      geminiNextAllowedAt = Date.now() + config.geminiMinIntervalMs;
    }
  };
  const scheduled = geminiQueueTail.then(run, run);
  geminiQueueTail = scheduled.catch(() => {});
  return scheduled;
}

async function callGeminiGenerateContent(prompt, maxOutputTokens, purpose) {
  const maxAttempts = Math.max(1, config.geminiMaxRetries + 1);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const data = await enqueueGeminiRequest(async () => {
        const { signal, clear } = withTimeoutSignal(config.geminiRequestTimeoutMs);
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`,
            {
              method: "POST",
              signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.2,
                  maxOutputTokens,
                  responseMimeType: "application/json",
                },
              }),
            },
          );

          if (!response.ok) {
            const body = await response.text();
            throw buildGeminiError(`gemini_${purpose}_status_${response.status}:${body.slice(0, 280)}`, {
              status: response.status,
              retryable: RETRYABLE_GEMINI_STATUSES.has(response.status),
              retryAfterMs: parseRetryAfterMs(response.headers),
            });
          }

          return await response.json();
        } finally {
          clear();
        }
      });

      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!rawText) {
        throw buildGeminiError(`gemini_${purpose}_empty_response`, { retryable: true });
      }
      return rawText;
    } catch (error) {
      const retryable = Boolean(error?.retryable) || isRetryableTransportError(error);
      const shouldRetry = retryable && attempt < maxAttempts;
      if (!shouldRetry) {
        throw error;
      }
      const delayMs = computeGeminiBackoffMs(attempt, error?.retryAfterMs);
      const reason = error?.status ? `status=${error.status}` : error?.message || "unknown_error";
      console.warn(
        `gemini_${purpose} retry attempt=${attempt + 1}/${maxAttempts} delay_ms=${delayMs} reason=${reason}`,
      );
      await sleep(delayMs);
    }
  }
  throw new Error(`gemini_${purpose}_failed_after_retries`);
}

function dummyCommentary(eventId, event) {
  const home = event.home_team || "Home";
  const away = event.away_team || "Away";
  const homeScore = Number(event.home_score ?? 0);
  const awayScore = Number(event.away_score ?? 0);
  const seq = Number(event.sequence ?? 0);
  const variants = [
    `${home} lead ${homeScore}-${awayScore} over ${away}. Pressure is building and the next phase could swing momentum quickly.`,
    `${home} and ${away} stay locked at ${homeScore}-${awayScore}. Tactical shape and tempo are now deciding control.`,
    `Event ${eventId} sits at ${homeScore}-${awayScore}. ${seq % 2 === 0 ? home : away} appears to own the current rhythm.`,
    `${home} are ${homeScore}-${awayScore} against ${away}. This passage feels decisive with both sides trading momentum.`,
  ];
  return variants[Math.abs(seq) % variants.length];
}

function dummyAnalysis(eventId) {
  return {
    updated_summary: `Event ${eventId}: structured momentum swings with sustained pressure in recent phases.`,
    key_moments: [
      "Early pressure phase changed field position.",
      "Mid-sequence tactical adjustment shifted momentum.",
      "Late scoring exchange tightened the outlook.",
    ],
    trend: "momentum",
    prediction: "Home side remains slight favorite if current rhythm continues.",
    confidence: 0.66,
    source: "fallback",
  };
}

function contextualFallbackAnalysis(eventId, context, reason) {
  const normalizedReason = (() => {
    const text = String(reason || "unknown_error");
    const statusMatch = text.match(/gemini_status_\d+/);
    if (statusMatch) {
      return statusMatch[0];
    }
    return text.slice(0, 80);
  })();

  const event = context?.event || {};
  const latest = context?.stream_window?.slice(-1)[0] || {};
  const seq = Number(latest.sequence_number || 0);
  const home = event.home_team || "Home";
  const away = event.away_team || "Away";
  const homeScore = Number(event.home_score ?? 0);
  const awayScore = Number(event.away_score ?? 0);
  const diff = homeScore - awayScore;

  const trend = diff === 0 ? "stable" : Math.abs(diff) >= 2 ? "momentum" : seq % 3 === 0 ? "reversal" : "momentum";
  const leader = diff >= 0 ? home : away;
  const trailer = diff >= 0 ? away : home;
  const confidence = Math.min(0.78, 0.55 + Math.min(0.2, Math.abs(diff) * 0.05));

  return {
    updated_summary: `Event ${eventId}: ${home} ${homeScore}-${awayScore} ${away}. Sequence ${seq || 1} indicates ${leader} controlling phases, while ${trailer} is forcing transitions to recover momentum.`,
    key_moments: [
      `${leader} controls territory through the latest phase.`,
      `${trailer} looks for counters after recent sequence changes.`,
      `Score pressure remains high at ${homeScore}-${awayScore}.`,
    ],
    trend,
    prediction: `${leader} is marginally favored if current tempo and structure continue.`,
    confidence,
    source: `fallback:${normalizedReason}`,
  };
}

function extractJsonObject(rawText) {
  if (!rawText) {
    throw new Error("missing_text");
  }
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("json_not_found");
  }
  return JSON.parse(rawText.slice(start, end + 1));
}

function validateGeminiAnalysis(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("invalid_payload");
  }
  if (typeof payload.updated_summary !== "string" || !payload.updated_summary.trim()) {
    throw new Error("invalid_summary");
  }
  if (!Array.isArray(payload.key_moments)) {
    throw new Error("invalid_key_moments");
  }
  if (!ALLOWED_TRENDS.has(payload.trend)) {
    throw new Error("invalid_trend");
  }
  if (typeof payload.prediction !== "string" || !payload.prediction.trim()) {
    throw new Error("invalid_prediction");
  }
  const confidence = Number(payload.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("invalid_confidence");
  }
  return {
    updated_summary: payload.updated_summary.trim(),
    key_moments: payload.key_moments.map((item) => String(item)).slice(0, 10),
    trend: payload.trend,
    prediction: payload.prediction.trim(),
    confidence,
  };
}

export async function generateGroqCommentary(eventId, context) {
  const event = context?.event || {};
  const latestStream = context?.stream_window?.slice(-1)[0] || {};
  const previousCommentary = Array.isArray(context?.recent_commentary) ? context.recent_commentary.slice(0, 3) : [];
  if (!config.groqApiKey) {
    return dummyCommentary(eventId, { ...event, sequence: latestStream?.sequence_number || 0 });
  }

  const prompt = `
Generate one dynamic live commentary update for this sports event.
Rules:
- Write exactly 2 short sentences (total 30 to 55 words).
- Mention score and one tactical or momentum insight.
- Avoid repeating phrasing from prior lines.
- Keep it energetic, specific, and match-like.

Event:
${JSON.stringify(event)}

Latest stream update:
${JSON.stringify(latestStream)}

Previous commentary lines to avoid repeating:
${JSON.stringify(previousCommentary)}
  `.trim();

  const { signal, clear } = withTimeoutSignal(1800);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.groqApiKey}`,
      },
      body: JSON.stringify({
        model: config.groqModel,
        temperature: 0.7,
        max_tokens: 120,
        messages: [
          { role: "system", content: "You are a real-time sports commentator." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`groq_status_${response.status}`);
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("groq_empty_response");
    }
    return String(content).replace(/\s+/g, " ").trim();
  } catch {
    return dummyCommentary(eventId, { ...event, sequence: latestStream?.sequence_number || 0 });
  } finally {
    clear();
  }
}

async function callGeminiForAnalysis(context) {
  const prompt = `
You are a sports analysis engine.
Return ONLY strict JSON with keys:
updated_summary (string),
key_moments (array of strings),
trend (momentum|stable|reversal),
prediction (string),
confidence (number 0.0 to 1.0).

Context:
${JSON.stringify(context)}
  `.trim();

  const rawText = await callGeminiGenerateContent(prompt, 512, "analysis");
  const validated = validateGeminiAnalysis(extractJsonObject(rawText));
  return {
    ...validated,
    source: "gemini",
  };
}

export async function generateGeminiAnalysis(eventId, context) {
  if (!config.geminiApiKey) {
    return contextualFallbackAnalysis(eventId, context, "missing_key");
  }
  try {
    return await callGeminiForAnalysis(context);
  } catch (error) {
    console.warn(`gemini_analysis event=${eventId} error=${error?.message || "unknown_error"}`);
    return contextualFallbackAnalysis(eventId, context, error?.message || "unknown_error");
  }
}

export async function generateGeminiReport(eventId, context) {
  if (!config.geminiApiKey) {
    return {
      narrative_summary: `Final report for event ${eventId}: momentum shifts, tactical adjustments, and closing-phase execution determined the outcome.`,
      top_key_moments: [
        "Opening tactical setup shaped early control.",
        "First key scoring sequence changed pressure profile.",
        "Mid-game adjustment triggered a trend shift.",
        "Late defensive sequence protected the lead.",
        "Final phase execution sealed the result.",
      ],
      prediction_accuracy_score: 0.7,
    };
  }

  const prompt = `
Generate a final post-event report in strict JSON with keys:
narrative_summary (string),
top_key_moments (array of 5 strings),
prediction_accuracy_score (number 0.0 to 1.0).

Context:
${JSON.stringify(context)}
  `.trim();

  try {
    const rawText = await callGeminiGenerateContent(prompt, 700, "report");
    const parsed = extractJsonObject(rawText);
    const moments = Array.isArray(parsed.top_key_moments) ? parsed.top_key_moments.map((item) => String(item)).slice(0, 5) : [];
    return {
      narrative_summary: String(parsed.narrative_summary || "").trim(),
      top_key_moments: moments,
      prediction_accuracy_score: Math.min(1, Math.max(0, Number(parsed.prediction_accuracy_score || 0))),
    };
  } catch (error) {
    console.warn(`gemini_report event=${eventId} error=${error?.message || "unknown_error"}`);
    return {
      narrative_summary: `Final report for event ${eventId}: summary generated with fallback due upstream model response format issue.`,
      top_key_moments: [
        "Early control phase.",
        "Momentum transition.",
        "Critical scoring moment.",
        "Late defensive execution.",
        "Final outcome moment.",
      ],
      prediction_accuracy_score: 0.5,
    };
  }
}
