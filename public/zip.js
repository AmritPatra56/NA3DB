// zip.js - a .zip file built in the browser, so the report's "Download all"
// needs no library and no server round trip for files the page already has.
// The layout is PKWARE's APPNOTE (local headers, data, central directory, end
// record). Deflated where the browser has CompressionStream("deflate-raw"),
// stored as is where it does not: every unzip tool reads both.

const ZIP_CRC_TABLE = Array.from({ length: 256 }, function (_, n) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

function zip_crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = ZIP_CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

async function zip_deflate(bytes) {
    if (typeof CompressionStream === "undefined") return null;
    try {
        let stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (err) {
        return null;
    }
}

// files: [{ name, text }]. Returns a Blob of type application/zip.
async function make_zip(files, when = new Date()) {
    let encoder = new TextEncoder();
    let time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
    let date = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
    let parts = [];
    let central = [];
    let offset = 0;

    for (const file of files) {
        let name = encoder.encode(file.name);
        let raw = encoder.encode(file.text);
        let packed = await zip_deflate(raw);
        let method = packed && packed.length < raw.length ? 8 : 0;
        let data = method ? packed : raw;
        let crc = zip_crc32(raw);

        // Bit 11: the name is UTF-8.
        let local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034B50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true);
        local.setUint16(8, method, true);
        local.setUint16(10, time, true);
        local.setUint16(12, date, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, data.length, true);
        local.setUint32(22, raw.length, true);
        local.setUint16(26, name.length, true);
        local.setUint16(28, 0, true);
        parts.push(local, name, data);

        let entry = new DataView(new ArrayBuffer(46));
        entry.setUint32(0, 0x02014B50, true);
        entry.setUint16(4, 20, true);
        entry.setUint16(6, 20, true);
        entry.setUint16(8, 0x0800, true);
        entry.setUint16(10, method, true);
        entry.setUint16(12, time, true);
        entry.setUint16(14, date, true);
        entry.setUint32(16, crc, true);
        entry.setUint32(20, data.length, true);
        entry.setUint32(24, raw.length, true);
        entry.setUint16(28, name.length, true);
        entry.setUint32(42, offset, true);
        central.push(entry, name);

        offset += 30 + name.length + data.length;
    }

    let size = central.reduce(function (n, part) { return n + part.byteLength; }, 0);
    let end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054B50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);

    return new Blob(parts.concat(central, [end]), { type: "application/zip" });
}
