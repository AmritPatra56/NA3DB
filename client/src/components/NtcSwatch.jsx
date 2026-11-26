import { barRects } from "../seqMap.js";

// One NtC bar's rects (seqMap.js barRects): a fixed list, so the place is a safe key.
export function NtcRects({ rects }) {
  return rects.map(({ style, ...at }, n) => <rect key={n} {...at} style={style} />);
}

// A step's colours as a small bar, beside its name in the words.
function NtcSwatch({ ntc }) {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
      <NtcRects rects={barRects(6, 10, 13, 14, ntc)} />
    </svg>
  );
}

export default NtcSwatch;
