export function answerRow(answers, label, target) {
  const { [label]: was, ...rest } = answers;
  if (was?.answer === target) return rest;
  return { ...rest, [label]: { answer: target, ticked: [] } };
}

export function toggleTick(answers, label, option) {
  const ticked = answers[label]?.ticked ?? [];
  const next = ticked.includes(option) ? ticked.filter((o) => o !== option) : [...ticked, option];
  return { ...answers, [label]: { answer: "yes", ticked: next } };
}

function read(url, label) {
  const [[key, value]] = new URL(url, "http://na3db").searchParams;
  return { key, values: value.split(","), label };
}

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
