import IORedis from "ioredis";
import { config } from "./env";

const redisConnection = new IORedis({
    host: config.redis.host,
    port: config.redis.port,

    // BullMQ requires this to be null.
    // It prevents ioredis from giving up on commands
    // while BullMQ is waiting for Redis to respond.
    maxRetriesPerRequest: null,
});

redisConnection.on("connect", () => {
    console.log("✅ Redis connected");
});

redisConnection.on("error", (error) => {
    console.error("❌ Redis error:", error);
});

export default redisConnection;
