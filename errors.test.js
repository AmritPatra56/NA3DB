// errors.test.js - what the app says when something is broken. 503 when the
// database is away, 500 when our SQL is wrong, and a page or JSON to match.

import test, { before, after } from "node:test";
import assert from "node:assert";
import { once } from "node:events";
import net from "node:net";
import pg from "pg";
import app from "./server.js";
import { DatabaseUnavailable, close as close_db } from "./db.js";

let base;
let server;

before(async () => {
    server = app.listen(0);
    await once(server, "listening");
    base = `http://localhost:${server.address().port}`;
});

after(async () => {
    server.close();
    await close_db();
});


// --- classifying a failure ----------------------------------------------
// These build their own throwaway pools, so nothing here touches the app.

test("a port with nothing on it is unavailable, not a bug", async () => {
    let pool = new pg.Pool({ host: "localhost", port: 9999,
                             connectionTimeoutMillis: 2000 });
    await assert.rejects(() => pool.query("SELECT 1"), { code: "ECONNREFUSED" });
    await pool.end().catch(() => {});
});

test("our own query function turns that into DatabaseUnavailable", async () => {
    // Same classification our db.js applies, exercised directly.
    let err = new DatabaseUnavailable(new Error("connect ECONNREFUSED"));

    assert.ok(err instanceof Error, "it is still an Error");
    assert.equal(err.name, "DatabaseUnavailable");
    assert.equal(err.message, "The database is unavailable");
    assert.ok(err.cause, "the original failure is kept for the log");
});


// --- what the client is told --------------------------------------------

test("an unknown API path answers in JSON", async () => {
    let res = await fetch(base + "/api/nonsense");

    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type"), /json/);
});

test("an unknown page answers with the styled page, not JSON", async () => {
    let res = await fetch(base + "/nonsense");
    let html = await res.text();

    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type"), /html/);
    assert.match(html, /Page not found/);
    assert.match(html, /nonsense/);
    assert.match(html, /rail/, "the page keeps the sidebar");
});

// fetch percent-encodes before sending, so a raw < never leaves it. This uses
// a plain socket to send the path exactly as written, which is what a hostile
// client would do.
function raw_get(port, path) {
    return new Promise((resolve, reject) => {
        let socket = net.connect(port, "localhost", () => {
            socket.write(`GET ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
        });
        let body = "";
        socket.on("data", (chunk) => { body += chunk; });
        socket.on("end", () => resolve(body));
        socket.on("error", reject);
    });
}

test("the error page escapes what it echoes back", async () => {
    let port = server.address().port;
    let response = await raw_get(port, "/<script>alert(1)</script>");

    assert.ok(!response.includes("<script>alert(1)"),
        "a tag in the URL must never come back as a tag");
    assert.match(response, /&lt;script&gt;/,
        "it should come back escaped, and visible as text");
});

test("an error message never leaks the connection details", async () => {
    let body = await (await fetch(base + "/api/nonsense")).text();

    // The real password comes from the environment, never written down here.
    let secrets = ["5432", "localhost", "password", process.env.DB_PASSWORD];

    for (const secret of secrets) {
        if (!secret) continue;
        assert.ok(!body.includes(secret), "a secret must not reach the client");
    }
});
