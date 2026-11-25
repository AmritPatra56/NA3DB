// The filters in use, one chip per value (app.js paint_chips): a turned-round
// filter gives one per value it lists; the prominent box gives none. The chip
// text and the chips themselves come in 7.11; the handle counts them now.
const NOT = "not_";

export function chipsOf(filters, registry) {
  const byKey = Object.fromEntries(registry.filters.map((f) => [f.key, f]));
  return Object.entries(filters).flatMap(([key, value]) => {
    if (key.startsWith(NOT)) return value.split(",").map((v) => ({ key, value: v }));
    const f = byKey[key];
    if (!f || f.prominent) return [];
    const values = Array.isArray(value) ? value : value === "" ? [] : [value];
    return values.map((v) => ({ key, value: v }));
  });
}
