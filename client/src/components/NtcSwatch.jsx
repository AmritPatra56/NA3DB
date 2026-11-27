import { barRects } from "../seqMap.js";

export function NtcRects({ rects }) {
  return rects.map(({ style, ...at }, n) => <rect key={n} {...at} style={style} />);
}

function NtcSwatch({ ntc }) {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
      <NtcRects rects={barRects(6, 10, 13, 14, ntc)} />
    </svg>
  );
}

export default NtcSwatch;
