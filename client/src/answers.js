// How the landing rows' answers change, as plain functions (public/pick.js
// answer, tick and picked). Landing keeps the answers in state and calls these;
// no component writes the rules itself.
//
// answers: { [row label]: { answer: "yes" | "no", ticked: [option labels] } }.
// A row that is off is simply not in it.

// Off, Yes or No for one row. Pressing the answer already on turns it off,
// and leaving Yes drops its ticks.
export function answerRow(answers, label, target) {
  const { [label]: was, ...rest } = answers;
  if (was?.answer === target) return rest;
  return { ...rest, [label]: { answer: target, ticked: [] } };
}

// Tick or untick one option under a row's Yes.
export function toggleTick(answers, label, option) {
  const ticked = answers[label]?.ticked ?? [];
  const next = ticked.includes(option) ? ticked.filter((o) => o !== option) : [...ticked, option];
  return { ...answers, [label]: { answer: "yes", ticked: next } };
}

// A link's filter, as a pick: its first and only parameter.
function read(url, label) {
  const [[key, value]] = new URL(url, window.location.origin).searchParams;
  return { key, values: value.split(","), label };
}

// Every answered row as picks, in page order. A Yes with ticked options asks
// those instead, in the order they stand under the row.
export function picksOf(browse, answers) {
  return browse.flatMap((card) => card.rows.flatMap((row) => {
    const a = answers[row.label];
    if (!a) return [];
    if (a.answer === "no") return [read(row.no_url, row.say_no || row.label)];
    const ticked = row.options.filter((o) => a.ticked.includes(o.label));
    return ticked.length ? ticked.map((o) => read(o.url, o.say || o.label))
                         : [read(row.url, row.say_yes || row.label)];
  }));
}
