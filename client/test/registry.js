// /api/fields as :4000 sent it on 26 Nov 2026, so the helpers are tested
// against the registry the site really uses, with no server running.
// Refresh: curl -s localhost:4000/api/fields | python3 -m json.tool > test/fields.json
import fields from "./fields.json" with { type: "json" };

export const registry = fields;
