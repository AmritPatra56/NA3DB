// Values more than one component shares, so they change in one place.

// How long typing must pause before a count is asked (landing.js, app.js count_soon).
export const COUNT_SETTLE_MS = 250;
// How long before the box's names are asked (box_suggest.js): short enough to
// keep up, long enough that a typed word is one request.
export const SUGGEST_MS = 150;
// The invitation in both search boxes (landing.ejs, search.ejs).
export const BOX_PLACEHOLDER = "Search an id, molecule, author or organism";
// The polymer types links used before DNA and RNA were told apart, each with
// the values it stands for now (filters.js POLYMER_TYPE_ALIASES). Frozen: they
// are old links' spellings, so no new ones come.
export const POLYMER_TYPE_ALIASES = {
  "Nucleic acid": ["DNA", "RNA", "DNA/RNA"],
  "Protein/NA": ["Protein/DNA", "Protein/RNA", "Protein/DNA/RNA"],
};
// The parameters that set how a page looks, not what it searches (server.js
// DISPLAY): a /report link with only these has no search.
export const DISPLAY_PARAMS = ["page", "sort", "view", "per_page", "match", "fields", "panel", "table", "proteins", "water"];
// The footer's pages, linked before they are written (server.js UNWRITTEN):
// each answers with its heading and this line until 8.10 writes it.
export const UNWRITTEN = { cite: "How to cite", help: "Help", contact: "Contact" };
export const UNWRITTEN_MESSAGE = "This page is being written.";
// What an empty section of the structure page says (structure.ejs).
export const NONE_RECORDED = "None recorded for this entry.";
export const NO_SAME_SEQUENCE = "No other entry has a chain with exactly this sequence.";

// A phone, where the report's field list sits above the table (style.css).
export const PHONE = "(max-width: 640px)";
