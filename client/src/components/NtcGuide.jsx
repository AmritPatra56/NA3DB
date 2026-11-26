// How the colours work (structure.ejs): what the two halves of a chip mean,
// every colour named, and where classes and colours come from. key: /pairs'
// ntc.key, one swatch per conformer class.
function NtcGuide({ ntcKey }) {
  return (
    <details className="guide">
      <summary>How the colours work</summary>
      <div className="guide_body">
        <p>The colours are DNATCO's. Each NtC is drawn in two halves, its 5′ side and its 3′ side, and each half takes the colour of its conformer class: AB01 is A then B, BB07 is BII on both sides. A low pale grey box (N) is a step DNATCO could not class.</p>
        <div className="cana_key">
          {ntcKey.map((k) => <span key={k.code}><i className="cana_swatch" style={{ background: k.background }}></i><code>{k.code}</code>{k.name}</span>)}
        </div>
        <p className="guide_source">Classes and their meaning: <a target="_blank" rel="noopener" href="https://doi.org/10.1093/nar/gkaa383">DNATCO, Černý et al. 2020, NAR 48:6367</a>. Colours: <a target="_blank" rel="noopener" href="https://dnatco.datmos.org">DNATCO, as on its own site</a>.</p>
      </div>
    </details>
  );
}

export default NtcGuide;
