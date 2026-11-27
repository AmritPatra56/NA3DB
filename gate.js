// Lets only `slots` requests through at once; the rest wait their turn in
// arrival order. A request that waits longer than `wait_ms`, or arrives when
// `queue_max` are already waiting, is turned away with 503 so a flood cannot
// pile up behind the gate.
export function gate({ slots, queue_max, wait_ms, message }) {
    let busy = 0;
    let waiting = [];

    function release() {
        let next = waiting.shift();
        if (next) next.enter();
        else busy--;
    }

    function middleware(req, res, next) {
        let place = { inside: false };

        place.enter = () => {
            clearTimeout(place.timer);
            place.inside = true;
            next();
        };

        // Fires once the answer is sent, or when the visitor gives up.
        res.on("close", () => {
            if (place.inside) {
                release();
                return;
            }
            clearTimeout(place.timer);
            let at = waiting.indexOf(place);
            if (at !== -1) waiting.splice(at, 1);
        });

        let turn_away = () => res.set("Retry-After", "5").status(503).json({ error: message });

        if (busy < slots) {
            busy++;
            place.enter();
            return;
        }
        if (waiting.length >= queue_max) {
            turn_away();
            return;
        }

        place.timer = setTimeout(() => {
            waiting.splice(waiting.indexOf(place), 1);
            turn_away();
        }, wait_ms);
        waiting.push(place);
    }

    middleware.state = () => ({ busy, waiting: waiting.length });
    return middleware;
}
