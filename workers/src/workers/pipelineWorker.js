import { Worker } from "bullmq";
import IORedis from "ioredis";

import { config } from "../config.js";
import { connection, enqueueStageJob } from "../queues/index.js";
import {
  accumulateStream,
  evaluateAlerts,
  getEventStatus,
  getEventWindow,
  upsertIngestionEvent,
} from "../services/backendClient.js";
import { generateGeminiAnalysis, generateGeminiReport, generateGroqCommentary } from "../services/llm.js";

const publisher = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

const stageMap = {
  ingest_event: { number: 1, name: "Event ingestion" },
  accumulate_stream: { number: 2, name: "Stream accumulation" },
  generate_groq_commentary: { number: 3, name: "Groq commentary" },
  generate_gemini_analysis: { number: 4, name: "Gemini Flash analysis" },
  publish_analysis: { number: 5, name: "Redis pub/sub publish" },
  websocket_push: { number: 6, name: "WebSocket push" },
  evaluate_alerts: { number: 7, name: "Alert rule evaluation" },
  generate_report: { number: 8, name: "Post-event report" },
};

async function emitStageEvent(eventId, stageNumber, stageName, stageStatus) {
  await publisher.publish(
    "pipeline:stage:events",
    JSON.stringify({
      eventId,
      stageNumber,
      stageName,
      stageStatus,
      timestamp: new Date().toISOString(),
    }),
  );
}

async function processJob(job) {
  const stage = stageMap[job.name];
  if (!stage) {
    return { skipped: true };
  }

  if (job.name === "ingest_event") {
    const upserted = await upsertIngestionEvent(job.data.rawEvent || {});
    if (!upserted?.event_id) {
      return { ok: false, reason: "missing_event_id" };
    }

    const normalizedEventId = Number(upserted.event_id);
    await emitStageEvent(normalizedEventId, stage.number, stage.name, "active");
    await emitStageEvent(normalizedEventId, stage.number, stage.name, "done");

    await enqueueStageJob("accumulate_stream", {
      eventId: normalizedEventId,
      rawEvent: job.data.rawEvent || {},
      canCommentary: Boolean(upserted.can_commentary),
    });

    if (upserted.has_subscribers && upserted.is_final && !upserted.report_exists) {
      await enqueueStageJob("generate_report", { eventId: normalizedEventId, source: "final-event" });
    }
    return { ok: true };
  }

  const eventId = job.data.eventId ?? null;
  if (!eventId) {
    return { skipped: true };
  }

  await emitStageEvent(eventId, stage.number, stage.name, "active");

  if (job.name === "accumulate_stream") {
    await accumulateStream(eventId, job.data.rawEvent || {});
    if (job.data.canCommentary) {
      await enqueueStageJob("generate_groq_commentary", { eventId, source: "ingestion" });
    }
    await emitStageEvent(eventId, stage.number, stage.name, "done");
    return { ok: true };
  }

  if (job.name === "generate_groq_commentary") {
    const context = await getEventWindow(eventId);
    const startedAt = Date.now();
    const commentary = await generateGroqCommentary(eventId, context);
    const latencyMs = Date.now() - startedAt;
    const commentaryPayload = {
      type: "groq_commentary",
      eventId,
      commentary,
      model: config.groqModel,
      latencyMs,
      generatedAt: new Date().toISOString(),
    };
    await publisher.publish("pipeline:commentary:events", JSON.stringify(commentaryPayload));
    await publisher.publish(
      `event:${eventId}:updates`,
      JSON.stringify(commentaryPayload),
    );
    await enqueueStageJob("generate_gemini_analysis", { eventId });
  }

  if (job.name === "generate_gemini_analysis") {
    const context = await getEventWindow(eventId);
    const analysis = await generateGeminiAnalysis(eventId, context);
    await publisher.publish(
      "pipeline:analysis:events",
      JSON.stringify({
        eventId,
        analysis,
      }),
    );
    await enqueueStageJob("publish_analysis", { eventId, analysis });
  }

  if (job.name === "publish_analysis") {
    await publisher.publish(
      `event:${eventId}:updates`,
      JSON.stringify({
        type: "analysis_update",
        eventId,
        analysis: job.data.analysis,
        publishedAt: new Date().toISOString(),
      }),
    );
    await enqueueStageJob("websocket_push", { eventId });
  }

  if (job.name === "websocket_push") {
    await enqueueStageJob("evaluate_alerts", { eventId });
  }

  if (job.name === "evaluate_alerts") {
    const alertResponse = await evaluateAlerts(eventId);
    const alerts = alertResponse?.alerts || [];
    for (const alert of alerts) {
      const payload = {
        type: "alert_triggered",
        eventId,
        userId: alert.user_id,
        ruleId: alert.rule_id,
        message: alert.message,
      };
      await publisher.publish(`event:${eventId}:updates`, JSON.stringify(payload));
      await publisher.publish(`user:${alert.user_id}:alerts`, JSON.stringify(payload));
    }
    await publisher.publish(
      `event:${eventId}:updates`,
      JSON.stringify({
        type: "alert_check_complete",
        eventId,
        checkedAt: new Date().toISOString(),
      }),
    );
    const status = await getEventStatus(eventId);
    if (status?.is_final && !status?.report_exists) {
      await enqueueStageJob("generate_report", { eventId });
    }
  }

  if (job.name === "generate_report") {
    const status = await getEventStatus(eventId);
    if (status?.report_exists) {
      await emitStageEvent(eventId, stage.number, stage.name, "done");
      return { ok: true, skipped: "report_exists" };
    }
    const context = await getEventWindow(eventId);
    const report = await generateGeminiReport(eventId, context);
    await publisher.publish(
      "pipeline:report:events",
      JSON.stringify({
        eventId,
        report,
      }),
    );
  }

  await emitStageEvent(eventId, stage.number, stage.name, "done");

  return { ok: true };
}

export const pipelineWorker = new Worker(config.queueName, processJob, {
  connection,
  concurrency: 8,
});

pipelineWorker.on("completed", (job) => {
  console.log(`completed job=${job.id} name=${job.name}`);
});

pipelineWorker.on("failed", (job, err) => {
  console.error(`failed job=${job?.id} name=${job?.name} err=${err.message}`);
});
