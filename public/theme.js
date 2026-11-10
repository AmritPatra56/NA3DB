// The theme button in the rail: Auto (follow the device), Light, Dark, in
// turn. The choice lives in this browser only; views/includes/theme.ejs reads
// it back before the page paints.

const KEY = "na3db-theme";
const NEXT = { auto: "light", light: "dark", dark: "auto" };
const SAYS = {
    auto: "Theme: auto, follows your device",
    light: "Theme: light",
    dark: "Theme: dark"
};

function stored() {
    try {
        let t = localStorage.getItem(KEY);
        return t === "light" || t === "dark" ? t : "auto";
    } catch {
        return "auto";
    }
}

function apply(choice) {
    let root = document.documentElement;
    if (choice === "auto") delete root.dataset.theme;
    else root.dataset.theme = choice;

    for (const button of document.querySelectorAll(".rail-theme")) {
        button.dataset.choice = choice;
        button.title = `${SAYS[choice]}. Switch to ${NEXT[choice]}.`;
        button.setAttribute("aria-label", button.title);
    }
}

function choose(choice) {
    try {
        if (choice === "auto") localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, choice);
    } catch {
        // Storage blocked: the choice still holds for this page.
    }
    apply(choice);
}

for (const button of document.querySelectorAll(".rail-theme")) {
    button.hidden = false;
    button.addEventListener("click", () => choose(NEXT[button.dataset.choice] ?? "auto"));
}
apply(stored());

// Another tab changed it: follow.
window.addEventListener("storage", (e) => { if (e.key === KEY) apply(stored()); });
