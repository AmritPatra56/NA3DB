import { useState } from "react";

// One folding section of the panel (search.ejs category). Its header folds it
// by click, Enter or Space; aria-expanded turns the arrow.
function Category({ group, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = () => setCollapsed(!collapsed);

  return (
    <div className={`category ${group.slug}${collapsed ? " collapsed" : ""}`}>
      <div className="category_header" role="button" tabIndex={0} aria-expanded={!collapsed}
           onClick={toggle}
           onKeyDown={(e) => {
             if (e.key !== "Enter" && e.key !== " ") return;
             e.preventDefault();
             toggle();
           }}>
        <div className="category_title">
          <span className="category_dot"></span>
          <h2>{group.name}</h2>
        </div>
        <i className="arrow" aria-hidden="true"></i>
      </div>
      <div className="category_body">
        {children}
        {group.note && <p className="field_note">{group.note}</p>}
      </div>
    </div>
  );
}

export default Category;
