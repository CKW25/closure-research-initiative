# Citation Audit for Version 7

This ledger tracks the citation-hardening pass for the monograph. It is not
part of the manuscript text. Its purpose is to keep the v7 citation layer
traceable and restrained.

## Citation Standard

- Internal results are cited with `\cref{...}` only.
- External theorems, named constructions, standard frameworks, and recovery
  targets receive `\cite{...}` at first load-bearing use.
- Repeated routine use after the first citation does not require another
  citation unless a different theorem or source is invoked.
- Chapter-opening background citations are used only when a whole chapter
  rests on a standard external framework.
- No citation is added merely for ordinary algebraic manipulation.

## Pass Status

| Pass | Scope | Status |
|---|---|---|
| 1 | Hard external theorems and named constructions | Completed in first-pass source |
| 2 | Standard physics and recovery-target frameworks | Started in first-pass source |
| 3 | Historical/comparative remarks | Pending |
| 4 | Bibliography metadata, site sources, and release packaging | Completed locally |

## Chapter Ledger

| Unit | External load-bearing material | Action |
|---|---|---|
| Preface | None beyond manuscript orientation | Internal only |
| Chapter 0 | Background-independence/problem-of-time framing; Boolean/Stone/Magnus/Gleason/Lovelock/HKT signposts | Cite selectively at first signpost; avoid overloading introduction |
| Chapter 1 | Boolean algebras, ultrafilters, ideal separation, inverse limits, Stone representation | Add Stone/Boolean reference near the first Boolean/ultrafilter setup |
| Chapter 2 | Universal properties, Boolean algebra tensor/product language, Stone duality remark | Add Mac Lane for universal-property language; Stone for Boolean representation when needed |
| Chapter 3 | Orbit quotient, free path groupoid, free category/groupoid universal properties, holonomy | Add Mac Lane/groupoid reference at first free-groupoid construction |
| Chapter 4 | Quotient semantics, universal property of orbit quotient | Add Mac Lane at first semantic universal-property statement if not already inherited |
| Chapter 5 | Action groupoids, torsors, cocycles, holonomy, gauge modification | Add groupoid/torsor background citation in opening or first definition block |
| Chapter 6 | Representative lifts, cocycles, transport labels | Inherit Chapter 5 references; add only if a new external construction appears |
| Chapter 7 | Multi-point orbit invariants and stabilizer/coset arguments | Mostly internal; cite group actions only if a standard quotient theorem is invoked |
| Chapter 8 | Loop-level obstruction, groupoid completion, holonomy reconstruction | Add groupoid/cohomology-style reference at first loop-reconstruction theorem if needed |
| Chapter 9 | Bridge from finite to loop obstruction | Mostly internal; cite only inherited obstruction/groupoid framework |
| Chapter 10 | Reversible/irreversible dynamics, quotient-level observables | Mostly internal; standard dynamical-systems citation only if external comparison is explicit |
| Chapter 11 | Stone inverse limit, automorphism action on Boolean/Stone tower | Add Stone reference near first Stone inverse-limit proposition |
| Chapter 12 | Differential geometry, connection coefficients, holonomy expansion, curvature | Add Kobayashi-Nomizu at smooth connection/curvature setup |
| Chapter 13 | Magnus-Witt, Labute, Duchamp-Krob, Gleason-Yamabe, van Dantzig, Hilbert-Smith, Malcev, Peetre, Epstein-Thurston, Lovelock, HKT | Add citations at each theorem/remark where named external results are invoked |
| Chapter 14 | Magnus degree-one terms, Lorentzian/quadratic scalar laws, Born rule | Add Magnus citation where invoked; add standard Born/Hilbert reference in Born-rule section |
| Chapter 15 | Hilbert reconstruction, complex Hilbert space, Born rule | Add von Neumann/Hilbert-space reference at chapter opening or Born-rule section |
| Chapter 16 | Einstein boundary, Weyl/Ricci decomposition, Lovelock/HKT/canonical GR | Add Wald/Kobayashi-Nomizu/Lovelock/HKT at first load-bearing uses |
| Chapter 17 | Connection-first geometry, principal/connection conventions | Add Kobayashi-Nomizu or Nakahara at first connection convention |
| Chapter 18 | Gauge phase, Maxwell equation, charge lattice, fractional-charge context | Add standard gauge/electromagnetism references at phase/Maxwell sections; cite experimental context only in prediction-facing text |
| Chapter 19 | Representation-theoretic matter-sector classification, Weyl/Ricci invariant split | Add representation/Riemannian decomposition references only where external classification is used |
| Chapter 20 | Binomial/quartic depth law, numerical closure | Mostly internal combinatorics; cite only if external combinatorial theorem is imported |
| Chapter 21 | Spectral mass law, operator roadmap, shell completeness bookkeeping | Add spectral/operator citation only where external spectral theory is invoked |
| Chapter 22 | Self-adjoint operator realization, Hilbert branch, observer-map factorization | Add functional-analysis/operator reference if operator terminology is load-bearing |
| Chapter 23 | Stone-Weierstrass, Singer-Wermer, Hadamard lemma, derivations/vector fields, Connes reconstruction | Add citations at each named theorem or open-problem reference |
| Appendix A | Status bookkeeping | Internal only unless external status taxonomy is added |
| Appendix B | Hall-Witt identity, exterior square, Kruskal/adiabatic invariant, confinement interpretation | Add Hall-Witt/group-theory citation and Kruskal/Wilson references where the interpretation is introduced |

## Required New or Promoted References

These references entered the monograph bibliography during v7.

| Key | Use |
|---|---|
| `Stone1936` | Stone representation/Stone spaces for Boolean algebras |
| `Isham1993`, `Kuchar1992`, `Anderson2017` | Problem-of-time and background-independence context for the no-external-frame stance |
| `MacLane1998` | Categories, universal properties, free constructions, limits |
| `Rudin1987` | Stone-Weierstrass theorem reference |
| `Lee2013` | Hadamard lemma and smooth-manifold local function arguments |
| `KobayashiNomizu1963` | Differential geometry, connections, curvature, frame bundles |
| `Wald1984` | Standard GR, Einstein equation, curvature decomposition background |
| `VonNeumann1955` | Hilbert-space quantum mechanics/Born-rule background |
| `Kato1995` | Closed positive form representation theorem and self-adjoint operator/spectral-theorem background |
| `Wilson1974` | Standard confinement context |
| `Hall1959` | Hall-Witt identity / group-theoretic commutator background |

Additional references may be added only when a local proof line or remark
requires them.

## Release Criteria

- Every new citation key is defined in the monograph bibliography.
- LaTeX compiles without undefined citations or references.
- The source bundle, PDF, Ask corpus, `external-sources.bib`, `/sources/`, and
  current-site metadata are updated before any v7 publication.
- v6 remains archived unchanged.

## First Compiled Checkpoint

- Added inline citations for the Boolean/Stone layer, universal-property
  language, free groupoid construction, Stone inverse limit, smooth
  connection-curvature conventions, the chapter 13 theorem stack,
  Hilbert/Born recovery target, Einstein tensor conventions, gauge-bundle
  conventions, Stone-Weierstrass, Singer-Wermer, Hadamard lemma, Connes
  reconstruction, Hall-Witt, adiabatic invariants, confinement context,
  problem-of-time context, spectral decomposition, BCH, and positive-form
  operator representation.
- Added bibliography entries for Stone, Mac Lane, Rudin, Lee,
  Kobayashi-Nomizu, Wald, von Neumann, Kato, Hall, Nakahara, Wilson, and
  Northrop.
- Added matching entries to `external-sources.bib` and `/sources/` for the new
  public source layer introduced by the citation pass.
- `pdflatex` was run after each citation batch on
  `closed-systems-from-comparison-completeness.tex`;
  the resulting log has no undefined citations, undefined references, or LaTeX
  errors.

## Local Release Packaging Checkpoint

- Updated the manuscript title page to Version 7, June 12, 2026.
- Rebuilt the monograph PDF from source.
- Archived the prior public PDF and source bundle as `archive/csm/csm-v6.pdf`
  and `archive/csm/csm-v6-latex.zip`.
- Replaced the current public `csm.pdf` and `csm-latex.zip` with the v7 build.
- Regenerated `csm/thumb.jpg`, `all-papers.zip`, and the Ask corpus.
- Updated `csm/`, `preprints/`, `sources/`, `llms.txt`, `feed.xml`,
  `README.md`, and `CITATION.cff` to identify v7 as the current monograph.
