function Footer() {
  const firstYear = 2026;
  const thisYear = new Date().getFullYear();
  const years = firstYear === thisYear ? firstYear : `${firstYear} – ${thisYear}`;

  return (
    <footer className="site_footer">
      <span className="site_footer_copy">&copy; {years} NA3DB Team</span>
      <nav className="site_footer_links" aria-label="About NA3DB">
        <a href="/cite">How to cite</a>
        <a href="/help">Help</a>
        <a href="/contact">Contact</a>
      </nav>
      <span className="site_footer_support">
        <span className="site_footer_support_label">Supported by</span>
        <a className="support_tile" href="https://www.ibt.cas.cz/" target="_blank" rel="noopener"
           title="Institute of Biotechnology of the Czech Academy of Sciences">
          <img src="/assets/logo_ibt.svg" alt="IBT" />
        </a>
      </span>
    </footer>
  );
}

export default Footer;
