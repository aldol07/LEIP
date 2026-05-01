import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

export function startBullBoardServer(queue) {
  const app = express();
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: [new BullMQAdapter(queue)],
    serverAdapter,
  });

  app.use("/admin/queues", serverAdapter.getRouter());

  const port = Number(process.env.WORKER_ADMIN_PORT || 3001);
  app.listen(port, () => {
    console.log(`Bull Board available at http://localhost:${port}/admin/queues`);
  });
}
