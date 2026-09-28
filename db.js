// db.js - the one place that knows how to reach PostgreSQL.
// Nothing else in the project builds a connection or a connection string.

import pg from "pg";

const { Pool } = pg;

// Raised when the database cannot be reached or cannot accept work. It is not
// a bug in our SQL, so it deserves a different answer than a 500.
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

// PostgreSQL error codes are five characters and the first two are the class.
//   08 connection exception    28 invalid authorization
//   53 insufficient resources  57 operator intervention (shutdown, cancel)
// Anything else — 42 undefined table, 22 bad data — is our own mistake.
const UNAVAILABLE_CLASSES = new Set(["08", "28", "53", "57"]);

function is_unavailable(err) {
    if (UNREACHABLE.has(err.code)) return true;
    if (typeof err.code === "string" && UNAVAILABLE_CLASSES.has(err.code.slice(0, 2))) return true;
    return /timeout exceeded when trying to connect/i.test(err.message || "");
}

// A pool, not a single connection. A web server answers several requests at
// once, and one connection can only run one query at a time.
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

// Runs one query and returns { rows, rowCount }.
// Values ALWAYS go in the second argument, never inside the text — that is
// what makes it impossible for a value to be read as SQL.
export async function query(text, values = []) {
    try {
        return await pool.query(text, values);
    } catch (err) {
        if (is_unavailable(err)) throw new DatabaseUnavailable(err);
        throw err;
    }
}

// Closes every connection. Tests need this or the process never exits.
export function close() {
    return pool.end();
}
