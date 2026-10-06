// db.js - the one place that knows how to reach PostgreSQL. Nothing else in
// the project builds a connection or a connection string.

import pg from "pg";

const { Pool } = pg;

// The database is unreachable or cannot accept work. Not a bug in our SQL, so
// it gets a 503 rather than a 500.
export class DatabaseUnavailable extends Error {
    constructor(cause) {
        super("The database is unavailable");
        this.name = "DatabaseUnavailable";
        this.cause = cause;
    }
}

// Node's own network errors: the machine or the port is not answering.
const UNREACHABLE = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT",
                             "ECONNRESET", "EHOSTUNREACH", "EPIPE"]);

// The first two characters of a PostgreSQL error code are its class: 08
// connection, 28 authorization, 53 resources, 57 shutdown or cancel.
// Anything else (42 undefined table, 22 bad data) is our own mistake.
const UNAVAILABLE_CLASSES = new Set(["08", "28", "53", "57"]);

function is_unavailable(err) {
    if (UNREACHABLE.has(err.code)) return true;
    if (typeof err.code === "string" && UNAVAILABLE_CLASSES.has(err.code.slice(0, 2))) return true;
    return /timeout exceeded when trying to connect/i.test(err.message || "");
}

// A pool, not one connection: a server answers several requests at once and a
// connection runs one query at a time.
const pool = new Pool({
    host:     process.env.DB_HOST,
    port:     Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,

    max: 10,                        // most connections to hold open
    idleTimeoutMillis: 30000,       // close one after 30s unused
    connectionTimeoutMillis: 5000   // give up asking for one after 5s
});

// One query, returning { rows, rowCount }. Values always go in the second
// argument, never in the text, so a value can never be read as SQL.
export async function query(text, values = []) {
    try {
        return await pool.query(text, values);
    } catch (err) {
        if (is_unavailable(err)) throw new DatabaseUnavailable(err);
        throw err;
    }
}

// Runs `work` in one transaction on one held connection, and hands it a query
// function bound to that client. query() borrows a different connection each
// call, so a BEGIN and COMMIT through it could land on different sessions.
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
        // Without this the connection never goes back and the pool drains.
        client.release();
    }
}

// Closes every connection. Tests need this or the process never exits.
export function close() {
    return pool.end();
}
