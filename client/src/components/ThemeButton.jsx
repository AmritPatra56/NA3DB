import { useTheme } from "../hooks/useTheme.js";

function ThemeButton() {
  const { choice, label, onNext } = useTheme();
  return (
    <button type="button" className="rail-item rail-theme" data-choice={choice}
            title={label} aria-label={label} onClick={onNext}>
      <svg className="theme_auto" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>
      <svg className="theme_light" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
      <svg className="theme_dark" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
    </button>
  );
}

export default ThemeButton;
