function Hero() {
  return (
    <>
      <h1 className="landing_title">NA3DB</h1>
      <p className="landing_tagline">Nucleic Acid 3D Database</p>

      <form className="landing_search" action="/search" method="get">
        <input type="text" name="q" autoFocus autoComplete="off"
               placeholder="Search an id, molecule, author or organism" />
        <button type="submit">Search</button>
      </form>

      {/* Filled with a live count as you type in Phase 6. Empty but always
          in the flow, so the cards below never jump when a number appears. */}
      <p className="landing_count"></p>
    </>
  );
}

export default Hero;