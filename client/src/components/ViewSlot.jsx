import ViewGlyph from "./ViewGlyph.jsx";

function ViewSlot({ view, children }) {
  return (
    <div className="view_slot">
      <ViewGlyph view={view} className="view_slot_glyph" />
      {children}
    </div>
  );
}

export default ViewSlot;
