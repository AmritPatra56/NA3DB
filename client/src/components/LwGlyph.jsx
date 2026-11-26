import { glyphOf } from "../arcView.js";

// A family's Leontis–Westhof symbol centred on x, y, in an svg; nothing for
// a family not written that way.
function LwGlyph({ fam, x, y, r }) {
  const g = glyphOf(fam, x, y, r);
  if (!g) return null;
  return (
    <g style={{ fill: g.fill }} stroke="currentColor" strokeWidth="1.4">
      {/* Always two shapes, one per edge: their place is a safe key. */}
      {g.shapes.map(({ tag: Shape, ...at }, i) => <Shape key={i} {...at} />)}
    </g>
  );
}

export default LwGlyph;
