# Closure Research Initiative

A mathematical research initiative investigating what structure a physical theory may invoke when it is written without external scaffolding.

## Overview

The Closure Research Initiative is founded on one primitive admissibility condition: intrinsicality. A comparison is a relation among states, invariant under the symmetries it constitutes, not an externally imposed label.

Under the theorem hypotheses stated in the monograph, especially local distinguishability, intrinsicality forces rectangular completeness rather than assuming it. The finite-to-global boundary is discharged through the refinement-tower and finite-witness results. From there the program develops quotient semantics, the obstruction to subsystem attribution, and a transport-obstruction hierarchy. The geometric claims are downstream and conditional on the faithful smooth-realization bridge.

## Works

| Code | Title | Status |
|------|-------|--------|
| csm | Closed Systems from Comparison Completeness | monograph, v3 |
| ccw | Closed Comparison Worlds and the Obstruction to Subsystem Attribution | preprint, v1 |
| cfsg | Closure Forces Spherical Geometry: Genuinely Closed Three-Dimensional Systems Are Diffeomorphic to S³ | preprint, v1 |
| scc | Structural Closure and the Cosmological Misnomer: Admissibility, Expansion, and the Geometry of Closed Systems | preprint, v1 |
| rc | Rectangular Completeness Encompasses Standard Physical Closure | preprint, v1 |
| fe | Foundational Closure and Primitive Structural Input: A Four-Axis Taxonomy | preprint, v1 |
| rie | A Factorization Criterion for Route Invariants with Fixed Endpoint Data | preprint, v1 |

## Site

The live site is at [closureresearchinitiative.org](https://closureresearchinitiative.org), deployed through Cloudflare Pages from this repository.

## Repository structure

| Path | Contents |
|------|----------|
| `index.html` | Homepage with monograph, paper list, and contact summary |
| `idea/` | Plain-language introduction |
| `overview/` | Result-by-result overview |
| `map/` | Four-axis structural map |
| `example/` | Worked four-state comparison-world example |
| `objections/` | Strong objections and current answers/open points |
| `notation/` | Core terms and symbols |
| `contact/` | Correspondence and registry information |
| `notes/` | Development notes |
| `guide/` | Reading guide |
| `csm/` | Monograph landing page |
| `{ccw,cfsg,scc,rc,fe,rie}/` | Individual paper landing pages |
| `papers/` | Source of truth for LaTeX source and compiled PDFs |
| `archive/` | Archived versions of superseded preprints |
| `feed.xml` | Atom feed for preprint updates |
| `sitemap.xml` | XML sitemap |
| `update-paper.ps1` | Paper revision/publishing helper |

## Updating papers

Run the publishing script to archive an old version and publish a revision:

```powershell
.\update-paper.ps1 -Paper rie -NewPdf path\to\new-version.pdf
```

Before publishing, verify that the landing page, BibTeX, feed entry, sitemap, and version history all describe the same version.

## License

All works © Chast K. Wolfe. All rights reserved. Public availability is for reading, citation, criticism, and scholarly review; it is not an open-source license grant.

## Contact

Chast K. Wolfe · [chast.wolfe@closureresearchinitiative.org](mailto:chast.wolfe@closureresearchinitiative.org)
