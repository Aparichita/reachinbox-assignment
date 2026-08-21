import IORedis from "ioredis";
import { config } from "./env";

const redisConnection = process.env.REDIS_URL
    ? new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
    })
    : new IORedis({
        host: config.redis.host,
        port: config.redis.port,
        maxRetriesPerRequest: null,
    });

redisConnection.on("connect", () => {
    console.log("✅ Redis connected");
});

redisConnection.on("error", (error) => {
    console.error("❌ Redis error:", error);
});

export default redisConnection;