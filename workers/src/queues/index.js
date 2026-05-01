import { Queue } from "bullmq";
import IORedis from "ioredis";

import { config } from "../config.js";

export const connection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export const pipelineQueue = new Queue(config.queueName, {
  connection,
});

export async function enqueueStageJob(name, data) {
  return pipelineQueue.add(name, data, {
    attempts: 2,
    removeOnComplete: 200,
    removeOnFail: 200,
  });
}
