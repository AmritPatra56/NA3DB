// pick.js - answer several rows on the landing page, then search them at once.
//
// An addition, never a dependency: without it each row's name and Yes are a
// plain link to its own search, and No another. With it Yes and No are
// buttons, a bar at the bottom says what is asked and how many structures
// match, and Search (the bar's or the box's) runs the box and the answers
// together.
//
// Yes on a row opens its options, if it has any (a kingdom's organisms, a
// method's resolution bands, the most frequent ligands): ticked, they stand
// in for the row's Yes, so Bacteria narrows to E. coli. Pressing Yes or No
// once more turns it off, and Yes off clears its options.
//
// Each button's link already holds its filter (/search?polymer_type=DNA, or
// not_polymer_type=DNA for No), so the link is read rather than a second copy
// written into the page. Answers of one filter mean either (DNA or RNA); of
// one not_ filter, none of them; different filters must all match. That is
// how /search reads them, so the count is what Search finds.

const PICK_NOT = "not_";

// What a set of picks asks, as one query: values of one key merged in the
// order picked, each value once. A pick is { key, values, label }.
function pick_query(picked) {
    let by_key = new Map();
    for (const row of picked) {
        let values = by_key.get(row.key) ?? [];
        for (const v of row.values) if (!values.includes(v)) values.push(v);
        by_key.set(row.key, values);
    }
    return by_key;
}

// The picks in words, the way the search reads them: (DNA or RNA) and X-ray
// and not (Bacteria or Archaea). What is typed in the box comes first, in
// quotes, when it counts.
function pick_summary(picked, text = "") {
    let groups = new Map();
    for (const row of picked) groups.set(row.key, [...(groups.get(row.key) ?? []), row.label]);
    let parts = [...groups].map(([key, labels]) => {
        let said = labels.length > 1 ? `(${labels.join(" or ")})` : labels[0];
        return key.startsWith(PICK_NOT) ? "not " + said : said;
    });
    if (text.length >= 2) parts.unshift(`“${text}”`);
    return parts.join(" and ");
}

// The address that runs the box and the ticks together. A box under two
// characters is left out, as the count leaves it out.
function pick_url(base, text, ticked, extra = {}) {
    let params = new URLSearchParams(base);
    if (text.length >= 2) params.set("q", text);
    let query = pick_query(ticked);
    for (const [key, value] of Object.entries(extra)) {
        query.set(key, [...new Set([...(query.get(key) ?? []), value])]);
    }
    for (const [key, values] of query) params.set(key, values.join(","));
    return params.toString();
}

const pick_words = (n) => n === 0 ? "No structures match"
                        : n === 1 ? "1 structure"
                        : `${n.toLocaleString("en-GB")} structures`;

if (typeof document !== "undefined" && document.querySelector(".browse")) {
    let browse = document.querySelector(".browse");
    let box = document.querySelector(".landing_search input");
    let bar = document.querySelector(".pick_bar");
    let what = bar.querySelector(".pick_what");
    let count = bar.querySelector(".pick_count");
    let go = bar.querySelector(".pick_search");
    let full = document.querySelector(".landing_advanced");
    let full_base = full.getAttribute("href");

    // A link's filter, as a pick: its first and only parameter.
    let read = (a) => {
        let [[key, value]] = new URL(a.href).searchParams;
        return { key, values: value.split(","),
                 label: a.dataset.say || a.querySelector(".browse_name").firstChild.textContent.trim() };
    };

    let rows = [...browse.querySelectorAll(".browse_row")].map((li) => {
        let yes = li.querySelector(".browse_yes");
        let no = li.querySelector(".browse_no");
        let link = li.querySelector(".browse_link");
        let shelf = li.querySelector(".browse_options");
        for (const a of [yes, no]) {
            a.setAttribute("role", "button");
            a.setAttribute("aria-pressed", "false");
        }
        // The name presses Yes for a mouse; the keyboard has Yes itself.
        link.tabIndex = -1;
        if (shelf) yes.setAttribute("aria-expanded", "false");
        let options = [...li.querySelectorAll(".browse_options a")].map((a) => {
            a.setAttribute("role", "checkbox");
            a.setAttribute("aria-checked", "false");
            return { a, on: false, ...read(a) };
        });
        return { yes, no, link, shelf, options, state: "off", asks: { yes: read(yes), no: read(no) } };
    });
    browse.classList.add("picking");

    // Every row answered, as picks: a Yes with ticked options asks those.
    let picked = () => rows.flatMap((r) => {
        if (r.state === "no") return [r.asks.no];
        if (r.state !== "yes") return [];
        let ticked = r.options.filter((o) => o.on);
        return ticked.length ? ticked : [r.asks.yes];
    });
    let text = () => box.value.trim();

    // The newest query asked; a reply to any other arrived late.
    let wanted = "";
    let timer = null;

    async function recount() {
        let query = pick_url("", text(), picked());
        wanted = query;
        try {
            let res = await fetch("/api/count?" + query);
            if (!res.ok) throw new Error();
            let { total } = await res.json();
            if (wanted !== query) return;
            count.textContent = pick_words(total);
            go.disabled = total === 0;
        } catch {
            if (wanted === query) { count.textContent = ""; go.disabled = false; }
        }
    }

    function update() {
        let now = picked();
        bar.hidden = now.length === 0;
        document.body.classList.toggle("picked", now.length > 0);
        full.href = now.length ? full_base + "&" + pick_url("", "", now) : full_base;
        if (now.length === 0) { wanted = ""; return; }
        what.textContent = pick_summary(now, text());
        recount();
    }

    function tick(option, on) {
        option.on = on;
        option.a.setAttribute("aria-checked", String(on));
    }

    // Off, Yes or No. Leaving Yes closes its options and clears them.
    function answer(row, state) {
        row.state = state;
        row.yes.setAttribute("aria-pressed", String(state === "yes"));
        row.no.setAttribute("aria-pressed", String(state === "no"));
        if (row.shelf) {
            row.shelf.hidden = state !== "yes";
            row.yes.setAttribute("aria-expanded", String(state === "yes"));
        }
        if (state !== "yes") for (const o of row.options) tick(o, false);
        update();
    }

    // A click meant to open the link elsewhere still does. Space presses a
    // button or a checkbox; Enter already arrives as a click.
    let on_press = (a, act) => {
        a.addEventListener("click", (e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            act();
        });
        a.addEventListener("keydown", (e) => {
            if (e.key !== " ") return;
            e.preventDefault();
            act();
        });
    };

    for (const row of rows) {
        let toggle = (state) => () => answer(row, row.state === state ? "off" : state);
        on_press(row.yes, toggle("yes"));
        on_press(row.link, toggle("yes"));
        on_press(row.no, toggle("no"));
        for (const o of row.options) on_press(o.a, () => { tick(o, !o.on); update(); });
    }

    // A suggestion picked from the box is that search, so the half-typed
    // text it came from is left out, as it is without answers.
    let search = (extra) => {
        location.href = "/search?" + pick_url("", extra ? "" : text(), picked(), extra);
    };

    go.addEventListener("click", () => search());
    bar.querySelector(".pick_clear").addEventListener("click", () => {
        for (const row of rows) answer(row, "off");
    });

    // The box's own Search runs the answers too. With none the form goes on
    // as the plain GET it is.
    box.form.addEventListener("submit", (e) => {
        if (picked().length === 0) return;
        e.preventDefault();
        search();
    });

    // Typing changes what the bar counts, once the typing settles.
    box.addEventListener("input", () => {
        if (picked().length === 0) return;
        clearTimeout(timer);
        timer = setTimeout(update, 250);
    });

    // A picked suggestion that lands in its own filter keeps the answers.
    // Says whether it took over, so landing.js goes on as before when not.
    window.pick_with = (key, value) => {
        if (picked().length === 0) return false;
        search({ [key]: value });
        return true;
    };
}
