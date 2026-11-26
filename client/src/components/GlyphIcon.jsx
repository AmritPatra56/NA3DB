import LwGlyph from "./LwGlyph.jsx";

// A family's symbol as a small picture in a line of text.
function GlyphIcon({ fam }) {
  return (
    <svg className="av_glyph" width="26" height="12" viewBox="0 0 26 12" aria-hidden="true">
      <LwGlyph fam={fam} x={13} y={6} r={4.5} />
    </svg>
  );
}

export default GlyphIcon;
