const X = Array.from({ length: 14 }, (_, k) => 123 + k * 26);
const at = (...ks) => ks.map((k) => X[k - 1]).join(" ");
const ARCS = [
  ["M123 104 Q292 -72 461 104", "wc"], ["M149 104 Q292 -56 435 104", "wc"], ["M175 104 Q292 -32 409 104", "wc"],
  ["M201 104 Q253 28 305 104", "gu"], ["M227 104 Q292 16 357 104", "nc"], ["M279 104 Q344 16 409 104", "nc"],
];
const pair = (kind) => ({ fill: `var(--pair-${kind})` });

function MapGuide() {
  return (
    <details className="guide" id="sequence-map-guide">
      <summary>How to read the map</summary>
      <div className="guide_body">
        <svg className="map_guide" viewBox="0 0 680 262" role="img" aria-labelledby="map-guide-title">
          <title id="map-guide-title">A made-up 14-nucleotide RNA: its pairs as arcs above the sequence, and the same pairs as bracket rows below it, one row per kind of pair</title>
          <g fill="none" strokeWidth="1.6">
            {ARCS.map(([d, kind]) => <path key={d} d={d} style={{ stroke: `var(--pair-${kind})` }} />)}
            <path d="M357 104 Q409 28 461 104" style={{ stroke: "var(--pair-nc)" }} strokeDasharray="4 3" />
          </g>
          <text className="mg_label" x="40" y="128">seq</text>
          <text className="mg_mono" x={at(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14)} y="128">GCUGAcGUAACAGC</text>
          {[1, 5, 10, 14].map((k) => <text key={k} className="mg_ruler" x={X[k - 1]} y="146">{k}</text>)}
          <text className="mg_label" x="40" y="170" style={pair("wc")}>WC</text>
          <text className="mg_label" x="40" y="194" style={pair("gu")}>cWW</text>
          <text className="mg_label" x="40" y="218" style={pair("nc")}>tHS</text>
          <text className="mg_label mg_over" x="40" y="242" style={pair("nc")}>tHS</text>
          <text className="mg_mono mg_dot" x={at(4, 5, 6, 7, 8, 9, 10, 11)} y="170">........</text>
          <text className="mg_mono" x={at(1, 2, 3, 12, 13, 14)} y="170" style={pair("wc")}>((()))</text>
          <text className="mg_mono mg_dot" x={at(1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 13, 14)} y="194">............</text>
          <text className="mg_mono" x={at(4, 8)} y="194" style={pair("gu")}>()</text>
          <text className="mg_mono mg_dot" x={at(1, 2, 3, 4, 6, 8, 9, 11, 13, 14)} y="218">..........</text>
          <text className="mg_mono" x={at(5, 7, 10, 12)} y="218" style={pair("nc")}>([)]</text>
          <text className="mg_mono mg_dot" x={at(1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13)} y="242">............</text>
          <text className="mg_mono" x={at(10, 14)} y="242" style={pair("nc")}>()</text>
          <text className="mg_note" x="490" y="170">G–C and A–U</text>
          <text className="mg_note" x="490" y="194">here a G·U wobble</text>
          <text className="mg_note" x="490" y="218">[ ] crosses ( )</text>
          <text className="mg_note" x="490" y="242">A10's second tHS pair</text>
        </svg>
        <p className="mg_caption">One row per Leontis–Westhof family found in the entry.</p>
        <ol className="guide_rules">
          <li><b>Each row is one Leontis–Westhof family of base pairs</b>, named on the left. The name has three letters: c or t (cis or trans), then the edge the left nucleotide pairs with, then the edge of the right one (W Watson–Crick, H Hoogsteen, S sugar). So tHS is a trans pair, Hoogsteen edge on the left, sugar edge on the right. WC comes first (the canonical cWW G–C and A–U pairs, A–T in DNA), then cWW (other cis Watson–Crick pairs, such as G–U), then the other families in a fixed order. A family with no pairs in the entry gets no row.</li>
          <li><b>A ( and its matching )</b> are the two nucleotides of one pair, as brackets in arithmetic.</li>
          <li><b>A pair that crosses another</b> in its row, as in a pseudoknot, takes [ ], then {"{ }"}, then &lt; &gt;.</li>
          <li><b>A nucleotide pairs once per row.</b> A second pair in the same family goes to an extra row of that name at the bottom, its name in italics.</li>
          <li><b>A dot</b> is no pair of that kind. Lower case is a modified nucleotide (here c6). In the downloaded text, &amp; separates strands.</li>
          <li><b>The bars above the sequence</b> are the NtC steps, in DNATCO's colours: a bar in two colours is the step's 5′ half and 3′ half, a low pale grey box a step DNATCO could not class. The key under the map names each colour, and <a href="#conformation">Conformation</a> lists every NtC. Height is the confal score.</li>
        </ol>
      </div>
    </details>
  );
}

export default MapGuide;
