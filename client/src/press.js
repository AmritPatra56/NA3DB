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
