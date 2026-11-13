// zip.test.js - the browser's ZIP writer (public/zip.js), read back with
// Node's own zlib, so a file it makes is one any unzip tool opens.
import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import zlib from "node:zlib";

// zip.js is a plain browser script: run it in a context with the browser
// globals it uses, which Node has too.
function load_zip(globals = {}) {
    let context = vm.createContext({ TextEncoder, Blob, Response, DataView, ArrayBuffer, Uint8Array,
                                     CompressionStream, Array, Date, ...globals });
    vm.runInContext(readFileSync("public/zip.js", "utf8"), context);
    return context;
}

// Every file in a zip, by the central directory, as { name, method, text }.
function unzip(buffer) {
    let end = buffer.lastIndexOf(Buffer.from([0x50, 0x4B, 0x05, 0x06]));
    let count = buffer.readUInt16LE(end + 10);
    let at = buffer.readUInt32LE(end + 16);
    let files = [];

    for (let n = 0; n < count; n++) {
        assert.equal(buffer.readUInt32LE(at), 0x02014B50);
        let method = buffer.readUInt16LE(at + 10);
        let crc = buffer.readUInt32LE(at + 16);
        let packed = buffer.readUInt32LE(at + 20);
        let size = buffer.readUInt32LE(at + 24);
        let name_length = buffer.readUInt16LE(at + 28);
        let local = buffer.readUInt32LE(at + 42);
        let name = buffer.subarray(at + 46, at + 46 + name_length).toString("utf8");

        assert.equal(buffer.readUInt32LE(local), 0x04034B50);
        assert.equal(buffer.readUInt16LE(local + 6), buffer.readUInt16LE(at + 8), `${name}: local and central flags`);
        let start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
        let data = buffer.subarray(start, start + packed);
        let raw = method === 8 ? zlib.inflateRawSync(data) : data;

        assert.equal(raw.length, size, name);
        assert.equal(zlib.crc32(raw), crc, name);
        files.push({ name, method, text: raw.toString("utf8"), utf8_flag: (buffer.readUInt16LE(at + 8) & 0x0800) !== 0 });
        at += 46 + name_length + buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32);
    }
    return files;
}

const FILES = [
    { name: "structures.csv", text: "﻿Entry ID,Title\r\n1B23,Ferré-D'Amaré\r\n".repeat(50) },
    { name: "README.txt", text: "short" },
    { name: "empty.dbn", text: "" }
];

test("make_zip writes files any unzip reads back exactly, deflated when that is smaller", async () => {
    let zip = load_zip();
    let blob = await zip.make_zip(FILES, new Date(2026, 10, 13, 12, 30, 10));
    let files = unzip(Buffer.from(await blob.arrayBuffer()));

    assert.equal(blob.type, "application/zip");
    assert.deepEqual(files.map((f) => [f.name, f.text]), FILES.map((f) => [f.name, f.text]));
    assert.equal(files[0].method, 8, "a long file is deflated");
    assert.equal(files[1].method, 0, "five bytes are stored: deflate would only grow them");
    assert.ok(files.every((f) => f.utf8_flag));
});

test("make_zip still works where the browser has no CompressionStream", async () => {
    let zip = load_zip({ CompressionStream: undefined });
    let files = unzip(Buffer.from(await (await zip.make_zip(FILES)).arrayBuffer()));

    assert.deepEqual(files.map((f) => [f.name, f.method, f.text]), FILES.map((f) => [f.name, 0, f.text]));
});

test("zip_crc32 agrees with zlib", () => {
    let zip = load_zip();
    for (const text of ["", "a", "NA3DB", "é&()[]{}".repeat(99)]) {
        let bytes = new TextEncoder().encode(text);
        assert.equal(zip.zip_crc32(bytes), zlib.crc32(bytes), text.slice(0, 10));
    }
});

test("the dates in the zip are the local time it was made", async () => {
    let zip = load_zip();
    let buffer = Buffer.from(await (await zip.make_zip(FILES.slice(1), new Date(2026, 10, 13, 12, 30, 10))).arrayBuffer());
    let time = buffer.readUInt16LE(10);
    let date = buffer.readUInt16LE(12);

    assert.deepEqual([time >> 11, (time >> 5) & 63, (time & 31) * 2], [12, 30, 10]);
    assert.deepEqual([(date >> 9) + 1980, (date >> 5) & 15, date & 31], [2026, 11, 13]);
});
