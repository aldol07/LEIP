import IORedis from "ioredis";

import { config } from "./config.js";
import { enqueueStageJob, pipelineQueue } from "./queues/index.js";
import { startBullBoardServer } from "./services/bullBoard.js";
import { pipelineWorker } from "./workers/pipelineWorker.js";

const subscriber = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

async function wireRedisTicks() {
  await subscriber.subscribe("pipeline:ingest:raw", "pipeline:analysis:tick", "pipeline:final:event");

  subscriber.on("message", async (channel, message) => {
    try {
      if (channel === "pipeline:ingest:raw") {
        const rawEvent = JSON.parse(message);
        if (rawEvent && typeof rawEvent === "object") {
          await enqueueStageJob("ingest_event", { rawEvent, source: "scheduler" });
        }
        return;
      }

      if (channel === "pipeline:analysis:tick") {
        const eventId = Number(message);
        if (!Number.isNaN(eventId)) {
          await enqueueStageJob("generate_gemini_analysis", { eventId, source: "scheduler" });
        }
        return;
      }

      if (channel === "pipeline:final:event") {
        const eventId = Number(message);
        if (!Number.isNaN(eventId)) {
          await enqueueStageJob("generate_report", { eventId, source: "final-event" });
        }
      }
    } catch (error) {
      console.error("Failed to enqueue stage job", error);
    }
  });
}

async function main() {
  await wireRedisTicks();
  startBullBoardServer(pipelineQueue);
  console.log("BullMQ worker online");
}

main().catch((error) => {
  console.error("Worker bootstrap failed", error);
  process.exit(1);
});

async function shutdown() {
  await subscriber.quit();
  await pipelineWorker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
