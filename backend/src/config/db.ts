import mysql, { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { ExecuteValues } from "mysql2";
import { config } from "./env";


// ------------------------------------------------------------
// MYSQL CONNECTION POOL
// ------------------------------------------------------------

const pool = mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,

    // Allow multiple database operations at the same time.
    connectionLimit: 10,

    // If all connections are currently being used,
    // wait for one to become available.
    waitForConnections: true,

    // 0 means do not allow an unlimited waiting queue.
    // Requests wait for an available connection instead of
    // creating an ever-growing queue.
    queueLimit: 0,

    // We store all application times as UTC.
    timezone: "Z",

    // Return DATETIME values as strings instead of JavaScript
    // Date objects that could be interpreted in local timezone.
    dateStrings: true,
});


// ------------------------------------------------------------
// TYPED QUERY HELPER
// ------------------------------------------------------------

export async function query<T extends RowDataPacket[] | ResultSetHeader>(
    sql: string,
    params: ExecuteValues[] = []
): Promise<T> {
    const [rows] = await pool.execute<T>(sql, params);

    return rows;
}


// ------------------------------------------------------------
// DATABASE CONNECTION TEST
// ------------------------------------------------------------

export async function testConnection(): Promise<void> {
    await pool.query("SELECT 1");

    console.log("✅ MySQL connection successful");
}


// ------------------------------------------------------------
// EXPORT THE POOL
// ------------------------------------------------------------

export default pool;
