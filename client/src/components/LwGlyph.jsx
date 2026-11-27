import { glyphOf } from "../arcView.js";

function LwGlyph({ fam, x, y, r }) {
  const g = glyphOf(fam, x, y, r);
  if (!g) return null;
  return (
    <g style={{ fill: g.fill }} stroke="currentColor" strokeWidth="1.4">
      {g.shapes.map(({ tag: Shape, ...at }, i) => <Shape key={i} {...at} />)}
    </g>
  );
}

export default LwGlyph;
