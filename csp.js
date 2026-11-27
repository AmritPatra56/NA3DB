import { createHash } from "node:crypto";

// The scripts written inside the page itself (not loaded with src=). Only
// these exact texts may run inline; anything slipped into a page does not.
export function inline_scripts(html) {
    return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

const sha256 = (text) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

// Everything a page uses comes from na3db.org itself; RCSB, DOI and the rest
// are only links, which this does not restrict. The 3D viewer is a separate
// page under /viewer and does not get this policy.
export function page_policy(html) {
    return [
        "default-src 'self'",
        ["script-src 'self'", ...inline_scripts(html).map(sha256)].join(" "),
        "style-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'"
    ].join("; ");
}
