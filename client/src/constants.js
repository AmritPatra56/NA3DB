// Values more than one component shares, so they change in one place.

// How long typing must pause before a count is asked (landing.js, app.js count_soon).
export const COUNT_SETTLE_MS = 250;
// How long before the box's names are asked (box_suggest.js): short enough to
// keep up, long enough that a typed word is one request.
export const SUGGEST_MS = 150;
// The invitation in both search boxes (landing.ejs, search.ejs).
export const BOX_PLACEHOLDER = "Search an id, molecule, author or organism";
