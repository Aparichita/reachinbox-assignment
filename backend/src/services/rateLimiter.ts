import redisConnection from "../config/redis";

interface RateLimitResult {
    allowed: boolean;
    used: number;
    limit: number;
    remaining: number;
    windowResetsAt: Date;
}

function getCurrentUtcHour(): string {
    return new Date().toISOString().slice(0, 13);
}

function getNextUtcHour(): Date {
    const nextHour = new Date();
    nextHour.setUTCMinutes(0, 0, 0);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1);
    return nextHour;
}

function getRateLimitKey(senderEmail: string): string {
    return `ratelimit:${senderEmail}:${getCurrentUtcHour()}`;
}

// Redis runs this script atomically. A rejected attempt never increments the
// counter, so concurrent workers cannot consume a slot that was not granted.
const consumeSlotScript = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local limit = tonumber(ARGV[1])

if current >= limit then
    return {0, current}
end

local used = redis.call("INCR", KEYS[1])
if used == 1 then
    redis.call("EXPIRE", KEYS[1], 7200)
end

return {1, used}
`;

export async function consumeSlot(
    senderEmail: string,
    hourlyLimit: number
): Promise<RateLimitResult> {
    const result = (await redisConnection.eval(
        consumeSlotScript,
        1,
        getRateLimitKey(senderEmail),
        hourlyLimit
    )) as [number, number];

    const allowed = result[0] === 1;
    const used = result[1];

    return {
        allowed,
        used,
        limit: hourlyLimit,
        remaining: Math.max(hourlyLimit - used, 0),
        windowResetsAt: getNextUtcHour(),
    };
}

export async function getCurrentUsage(
    senderEmail: string,
    hourlyLimit: number
): Promise<RateLimitResult> {
    const value = await redisConnection.get(getRateLimitKey(senderEmail));
    const used = value ? Number(value) : 0;

    return {
        allowed: used < hourlyLimit,
        used,
        limit: hourlyLimit,
        remaining: Math.max(hourlyLimit - used, 0),
        windowResetsAt: getNextUtcHour(),
    };
}
