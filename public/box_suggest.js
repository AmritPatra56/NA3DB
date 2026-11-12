// box_suggest.js - names under the main search box as you type.
//
// The authors, organisms, molecules and ids the database holds, grouped,
// each with the count picking it returns (server: suggest.js
// box_suggestions). Picking fills the box with the name in quotes, an exact
// phrase, and searches. Nothing is ever pre-selected, so Enter without
// picking still searches exactly what was typed.
//
// An addition: without it the box and its form work as before.

const BOX_SUGGEST_MIN = 3;
// Short enough to keep up, long enough that a typed word is one request.
const BOX_SUGGEST_SETTLE_MS = 150;
const BOX_GROUP_LABELS = { entries: "Entries", authors: "Authors", organisms: "Organisms", molecules: "Molecules" };

// input: the box. params(): the other filters, as URLSearchParams, so counts
// are what the search will show. picked(): runs the search once the box holds
// the pick.
function box_suggest(input, { params = () => new URLSearchParams(), picked }) {
    let list = document.createElement("ul");
    list.id = `${input.id || input.name}_box_options`;
    list.className = "box_suggest";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Suggestions");
    list.hidden = true;
    input.parentElement.append(list);

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id);
    input.setAttribute("aria-expanded", "false");

    let items = [];
    let active = -1;
    let timer = null;
    let request = null;
    let wanted = "";

    function close() {
        clearTimeout(timer);
        request?.abort();
        list.hidden = true;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
        active = -1;
    }

    // The typed text in bold where it starts a word of the name.
    function marked(label, text) {
        let lower = label.toLowerCase(), at = lower.indexOf(text);
        while (at > 0 && /[a-z0-9]/i.test(lower[at - 1])) at = lower.indexOf(text, at + 1);
        if (at < 0) return [label];
        let mark = document.createElement("mark");
        mark.textContent = label.slice(at, at + text.length);
        return [label.slice(0, at), mark, label.slice(at + text.length)];
    }

    function paint_active() {
        [...list.querySelectorAll("[role=option]")].forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
        if (active >= 0) {
            let li = document.getElementById(`${list.id}_${active}`);
            input.setAttribute("aria-activedescendant", li.id);
            li.scrollIntoView({ block: "nearest" });
        } else input.removeAttribute("aria-activedescendant");
    }

    function draw(reply) {
        items = [];
        let text = reply.text.toLowerCase();
        let rows = [];
        for (const group of reply.groups) {
            let head = document.createElement("li");
            head.setAttribute("role", "presentation");
            head.className = "box_suggest_group";
            head.textContent = BOX_GROUP_LABELS[group.kind] ?? group.kind;
            rows.push(head);
            for (const item of group.items) {
                let i = items.push(item) - 1;
                let li = document.createElement("li");
                li.setAttribute("role", "option");
                li.id = `${list.id}_${i}`;
                let name = document.createElement("span");
                name.className = "box_suggest_name";
                name.append(...marked(item.label, text));
                li.append(name);
                if (item.also) {
                    let also = document.createElement("span");
                    also.className = "box_suggest_also";
                    also.textContent = item.also;
                    li.append(also);
                }
                let count = document.createElement("small");
                count.textContent = item.href ? "Open" : item.total.toLocaleString("en-GB");
                li.append(count);
                // mousedown, not click: click comes after the box's blur closes the list.
                li.addEventListener("mousedown", (event) => { event.preventDefault(); pick(i); });
                rows.push(li);
            }
        }
        if (items.length) {
            let foot = document.createElement("li");
            foot.setAttribute("role", "presentation");
            foot.className = "box_suggest_foot";
            foot.textContent = "Picking a name searches it exactly. Enter searches what you typed.";
            rows.push(foot);
        }
        list.replaceChildren(...rows);
        // Exactly under the box, as wide as it, whatever sits beside it.
        list.style.left = `${input.offsetLeft}px`;
        list.style.top = `${input.offsetTop + input.offsetHeight + 4}px`;
        list.style.width = `${input.offsetWidth}px`;
        active = -1;
        list.hidden = items.length === 0;
        input.setAttribute("aria-expanded", String(!list.hidden));
        input.removeAttribute("aria-activedescendant");
    }

    async function ask(text) {
        request?.abort();
        request = new AbortController();
        let query = params();
        query.set("q", text);
        try {
            let res = await fetch("/api/box_suggestions?" + query.toString(), { signal: request.signal });
            if (!res.ok) throw new Error();
            let reply = await res.json();
            if (wanted !== text || document.activeElement !== input) return;
            draw(reply);
        } catch {
            // Suggestions are a convenience: the box still searches.
            if (wanted === text) close();
        }
    }

    function pick(i) {
        let item = items[i];
        close();
        if (item.href) {
            location.href = item.href;
            return;
        }
        input.value = item.value;
        wanted = item.value;
        picked();
    }

    function soon() {
        let text = input.value.trim();
        wanted = text;
        clearTimeout(timer);
        // Typing a quote is writing the exact phrase yourself.
        if (text.length < BOX_SUGGEST_MIN || text.includes("\"")) {
            close();
            return;
        }
        timer = setTimeout(() => ask(text), BOX_SUGGEST_SETTLE_MS);
    }

    input.addEventListener("input", soon);
    input.addEventListener("focus", () => { if (input.value.trim() !== wanted || list.hidden) soon(); });
    input.addEventListener("blur", close);
    input.form?.addEventListener("submit", close);
    input.addEventListener("keydown", (event) => {
        if (list.hidden) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            let step = event.key === "ArrowDown" ? 1 : -1;
            // Past either end is back in the box, as typed.
            active = active === -1 ? (step === 1 ? 0 : items.length - 1) : active + step;
            if (active >= items.length || active < 0) active = -1;
            paint_active();
        } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            pick(active);
        } else if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    });
}
