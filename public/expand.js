// expand.js - "full screen" that stays in the page. The panel opens in the
// page's flow, right under the part that asked for it, wide and tall, and the
// rest of the page stays above and below it. It gets its own history entry,
// so the browser's Back button closes it, as Esc does; there is no close
// button, and the button that opened it reads Collapse while it is open.

const STATE = "na3db_expanded";
let current = null;

function set_label(trigger, open) {
    if (!trigger || !trigger.dataset.expandLabel) return;
    trigger.textContent = open ? "⤡ Collapse" : trigger.dataset.expandLabel;
}

function shut() {
    let c = current;
    current = null;
    if (c.dialog.open) c.dialog.close();
    c.dialog.classList.remove("in_place");
    set_label(c.trigger, false);
    c.trigger?.setAttribute("aria-expanded", "false");
    c.on_close?.();
}

// Opens dialog under anchor, or collapses it when it is the open one.
export function expand(dialog, anchor, trigger, on_close) {
    if (current?.dialog === dialog) { collapse(); return false; }
    if (current) { shut(); history.replaceState(null, ""); }

    anchor.after(dialog);
    dialog.classList.add("in_place");
    dialog.show();
    if (trigger) {
        // Text buttons swap their words; an icon button keeps its picture.
        if (!trigger.dataset.expandLabel && !trigger.querySelector("svg")) {
            trigger.dataset.expandLabel = trigger.textContent;
        }
        set_label(trigger, true);
        trigger.setAttribute("aria-expanded", "true");
    }
    current = { dialog, trigger, on_close };
    history.pushState({ [STATE]: true }, "");
    dialog.scrollIntoView({ block: "start", behavior: "smooth" });
    return true;
}

export function collapse() {
    if (current) history.back();
}

// Back lands on an entry without our mark: close. An anchor link followed
// while open adds its own entry, and Back from it lands on ours: stay open.
window.addEventListener("popstate", (event) => {
    if (current && !event.state?.[STATE]) shut();
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && current) {
        event.preventDefault();
        collapse();
    }
});
