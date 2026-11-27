import test from "node:test";
import assert from "node:assert";
import { once } from "node:events";
import express from "express";
import { gate } from "./gate.js";

// A route that answers only when the test lets it, so the test controls how
// long each request holds its slot.
async function slow_app(options) {
    let held = [];
    let most = 0;
    let inside = 0;
    let door = gate({ message: "busy", ...options });
    let app = express();

    app.get("/x", door, (req, res) => {
        inside++;
        most = Math.max(most, inside);
        held.push(() => {
            inside--;
            res.json({ n: Number(req.query.n) });
        });
    });

    let server = app.listen(0);
    await once(server, "listening");
    let url = `http://localhost:${server.address().port}/x`;

    return {
        door, url, held,
        most: () => most,
        free: () => held.shift()(),
        close: () => { server.closeAllConnections(); server.close(); }
    };
}

const tick = () => new Promise((r) => setTimeout(r, 30));

// Waits up to 3 s for the gate to reach a state; fetch takes a moment to connect.
async function until(door, want) {
    for (let i = 0; i < 100; i++) {
        if (JSON.stringify(door.state()) === JSON.stringify(want)) return;
        await tick();
    }
    assert.deepStrictEqual(door.state(), want);
}

test("lets only `slots` through and the rest in arrival order", async () => {
    let s = await slow_app({ slots: 2, queue_max: 10, wait_ms: 5000 });
    let replies = [1, 2, 3, 4, 5].map((n) => fetch(`${s.url}?n=${n}`).then((r) => r.json()));
    await until(s.door, { busy: 2, waiting: 3 });

    let order = [];
    replies.forEach((p) => p.then((j) => order.push(j.n)));
    while (order.length < 5) {
        if (s.held.length) s.free();
        await tick();
    }
    assert.deepStrictEqual(order, [1, 2, 3, 4, 5]);
    assert.strictEqual(s.most(), 2);
    assert.deepStrictEqual(s.door.state(), { busy: 0, waiting: 0 });
    s.close();
});

test("a full queue turns the newcomer away with 503 and Retry-After", async () => {
    let s = await slow_app({ slots: 1, queue_max: 1, wait_ms: 5000 });
    let first = fetch(s.url);
    await until(s.door, { busy: 1, waiting: 0 });
    let second = fetch(s.url);
    await until(s.door, { busy: 1, waiting: 1 });

    let third = await fetch(s.url);
    assert.strictEqual(third.status, 503);
    assert.strictEqual(third.headers.get("retry-after"), "5");
    assert.deepStrictEqual(await third.json(), { error: "busy" });

    s.free();
    assert.strictEqual((await first).status, 200);
    await until(s.door, { busy: 1, waiting: 0 });
    s.free();
    assert.strictEqual((await second).status, 200);
    s.close();
});

test("waiting too long gives 503 and frees the place", async () => {
    let s = await slow_app({ slots: 1, queue_max: 5, wait_ms: 100 });
    let first = fetch(s.url);
    await until(s.door, { busy: 1, waiting: 0 });
    let late = await fetch(s.url);
    assert.strictEqual(late.status, 503);
    assert.deepStrictEqual(s.door.state(), { busy: 1, waiting: 0 });
    s.free();
    await first;
    s.close();
});

test("a visitor who gives up leaves the queue; one inside gives back the slot", async () => {
    let s = await slow_app({ slots: 1, queue_max: 5, wait_ms: 5000 });
    let inside = new AbortController();
    let queued = new AbortController();
    fetch(s.url, { signal: inside.signal }).catch(() => {});
    await until(s.door, { busy: 1, waiting: 0 });
    fetch(s.url, { signal: queued.signal }).catch(() => {});
    await until(s.door, { busy: 1, waiting: 1 });

    queued.abort();
    await until(s.door, { busy: 1, waiting: 0 });

    inside.abort();
    await until(s.door, { busy: 0, waiting: 0 });

    let after = fetch(s.url);
    await until(s.door, { busy: 1, waiting: 0 });
    s.held.pop()();
    assert.strictEqual((await after).status, 200);
    s.close();
});
