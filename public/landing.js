// landing.js - the count under the search box, as you type.
//
// An addition, never a dependency: the form above it is a plain GET to
// /search and works whether or not this file loads or runs.

// Below this a search says nothing useful: a single letter appears in almost
// every title, so one character matches nearly the whole database.
const MIN_LENGTH = 2;

// Long enough that a typed word is one request rather than six, short enough
// that the number feels like it is keeping up.
const SETTLE_MS = 250;

let box = document.querySelector(".landing_search input");
let readout = document.querySelector(".landing_count");

let timer = null;

// What the newest request was for. A reply for anything else arrived late and
// is thrown away, or a slow early search would overwrite a fast later one.
let wanted = "";

// Written, never hidden: the line is always in the flow, so the examples below
// it do not jump down the moment a number appears.
function show(text) {
    readout.textContent = text;
}

// Nothing matched: say so, and offer any close searches as links, each with
// the count it gives. Never applied for the user.
function show_none(suggestions) {
    show("no structures match");
    if (suggestions.length === 0) return;

    readout.append(". Did you mean ");
    suggestions.forEach(function (s, i) {
        if (i > 0) readout.append(i === suggestions.length - 1 ? " or " : ", ");
        let link = document.createElement("a");
        link.href = "/search?q=" + encodeURIComponent(s.value);
        link.textContent = s.value;
        readout.append(link, ` (${s.total.toLocaleString("en-GB")})`);
    });
    readout.append("?");
}

async function count(term) {
    try {
        let res = await fetch("/api/count?q=" + encodeURIComponent(term));
        if (!res.ok) throw new Error();

        let data = await res.json();
        if (wanted !== term) return;

        if (data.total === 0)      show_none(data.suggestions || []);
        else if (data.total === 1) show("1 structure");
        else                       show(data.total.toLocaleString("en-GB") + " structures");
    } catch {
        // The box still works; the count is the only thing lost, so it goes
        // quiet rather than putting an error in front of someone typing.
        if (wanted === term) show("");
    }
}

box.addEventListener("input", function () {
    let term = box.value.trim();

    clearTimeout(timer);
    wanted = term;

    if (term.length < MIN_LENGTH) {
        show("");
        return;
    }

    timer = setTimeout(() => count(term), SETTLE_MS);
});
