const PATHS = {
  "1d": <><path d="M4 7h40M4 17h40"/><path className="view_pair" d="M10 7v10M20 7v10M30 7v10"/></>,
  "2d": <><path d="M20 24V12M28 24V12"/><circle cx="24" cy="7" r="5"/><path className="view_pair" d="M20 20h8M20 15h8"/></>,
  "3d": <><path d="M12 2c24 4 24 16 0 20"/><path className="view_pair" d="M36 2c-24 4-24 16 0 20"/></>,
};

function ViewGlyph({ view, className }) {
  return <svg className={className} viewBox="0 0 48 24" aria-hidden="true">{PATHS[view]}</svg>;
}

export default ViewGlyph;
