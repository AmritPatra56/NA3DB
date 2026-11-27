// Under two characters nothing is searched: one letter is in almost every title.
export const MIN_LENGTH = 2;
export const searchable = (text) => text.length >= MIN_LENGTH;

export const suggestable = (text) => searchable(text) && !text.includes("\"");
