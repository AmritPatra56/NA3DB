// The handlers for a link that acts as a button or checkbox (public/pick.js
// on_press), shared by BrowseRow and BrowseOption.
// A click meant to open the link elsewhere (Ctrl, Cmd, Shift, Alt) still does.
// Space presses a button or a checkbox; Enter already arrives as a click.
export const press = (act) => ({
  onClick: (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    act();
  },
  onKeyDown: (e) => {
    if (e.key !== " ") return;
    e.preventDefault();
    act();
  },
});
