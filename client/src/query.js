// When typed text counts as a search (landing.js MIN_LENGTH, pick_url): a
// single letter is in almost every title, so under two characters nothing is
// searched, counted or quoted.
export const MIN_LENGTH = 2;
export const searchable = (text) => text.length >= MIN_LENGTH;

// When the box asks for names (box_suggest.js): two letters at least, and not
// once a quote is typed, since that is writing the exact phrase yourself.
export const suggestable = (text) => searchable(text) && !text.includes("\"");
