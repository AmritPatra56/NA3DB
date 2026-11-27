import pg from "pg";

const { Pool } = pg;

// Database unreachable: 503, not 500.
export class DatabaseUnavailable extends Error {
    constructor(cause) {
        super("The database is unavailable");
        this.name = "DatabaseUnavailable";
        this.cause = cause;
    }
}

const UNREACHABLE = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT",
                             "ECONNRESET", "EHOSTUNREACH", "EPIPE"]);

// PG error classes: 08 connection, 28 auth, 53 resources, 57 shutdown. Anything else is our bug.
const UNAVAILABLE_CLASSES = new Set(["08", "28", "53", "57"]);

function is_unavailable(err) {
    if (UNREACHABLE.has(err.code)) return true;
    if (typeof err.code === "string" && UNAVAILABLE_CLASSES.has(err.code.slice(0, 2))) return true;
    return /timeout exceeded when trying to connect/i.test(err.message || "");
}

const pool = new Pool({
    host:     process.env.DB_HOST,
    port:     Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,

    max: 10,                        // most connections to hold open
    idleTimeoutMillis: 30000,       // close one after 30s unused
    connectionTimeoutMillis: 5000,  // give up asking for one after 5s

    statement_timeout: 15000,

    // JIT spent 2.9 s compiling a query that ran in 0.6 s.
    options: "-c jit=off"
});

export async function query(text, values = []) {
    try {
        return await pool.query(text, values);
    } catch (err) {
        if (is_unavailable(err)) throw new DatabaseUnavailable(err);
        throw err;
    }
}

// One held connection: query() may send BEGIN and COMMIT to different sessions.
export async function transaction(work) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        let result = await work((text, values) => client.query(text, values));
        await client.query("COMMIT");
        return result;
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

export function close() {
    return pool.end();
}
