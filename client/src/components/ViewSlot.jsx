import ViewGlyph from "./ViewGlyph.jsx";

// A view's place while it has nothing to draw: its glyph and a line saying why.
function ViewSlot({ view, children }) {
  return (
    <div className="view_slot">
      <ViewGlyph view={view} className="view_slot_glyph" />
      {children}
    </div>
  );
}

export default ViewSlot;
