import { Queue } from "bullmq";
import redisConnection from "../config/redis";
import { config } from "../config/env";

const SPAWNER_SCHEDULER_ID = "spawner-tick";

const spawnerQueue = new Queue("spawner-queue", {
    connection: redisConnection,
});

async function createSpawnerScheduler(): Promise<void> {
    // BullMQ stores this scheduler in Redis. It creates the first delayed
    // job and one uniquely identified successor for each execution.
    await spawnerQueue.upsertJobScheduler(
        SPAWNER_SCHEDULER_ID,
        { every: config.spawner.intervalSeconds * 1000 },
        {
            name: "spawn-due-emails",
            data: {},
            opts: { removeOnComplete: true },
        }
    );
}

export async function ensureSpawnerRunning(): Promise<void> {
    const existingScheduler = await spawnerQueue.getJobScheduler(
        SPAWNER_SCHEDULER_ID
    );

    if (existingScheduler) {
        console.log("⏱️ Spawner job already exists");
        return;
    }

    console.log("⏱️ No spawner job found. Starting spawner...");

    await createSpawnerScheduler();

    console.log(
        `⏱️ Spawner scheduled to run in ${config.spawner.intervalSeconds}s`
    );
}

export default spawnerQueue;
