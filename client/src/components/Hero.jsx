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
    </>
  );
}

export default Hero;