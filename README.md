# Closure Research Initiative

A mathematical research initiative investigating what structure a physical theory must have if it is written without external scaffolding.

## Overview

The Closure Research Initiative is founded on a single primitive premise: intrinsicality&mdash;a comparison is a relation among states, invariant under the symmetries it constitutes, not an externally imposed labeling. Under intrinsicality, closure (rectangular completeness) and the finite-to-global compactness boundary are derived rather than assumed. From intrinsic comparison data, the admissible architecture is rigid: quotient semantics, the obstruction to subsystem attribution, and a transport-obstruction curvature hierarchy follow at the relational level; at the manifold stage, a genuinely closed three-dimensional system is diffeomorphic to S&sup3;.

## Preprints

| Code | Title | Status |
|------|-------|--------|
| csm | Closed Systems from Comparison Completeness | v3 |
| ccw | Closed Comparison Worlds and the Obstruction to Subsystem Attribution | v1 |
| cfsg | Closure Forces Spherical Geometry: Genuinely Closed Three-Dimensional Systems Are Diffeomorphic to S&sup3; | v1 |
| scc | Structural Closure and the Cosmological Misnomer: Admissibility, Expansion, and the Geometry of Closed Systems | v1 |
| rc | Rectangular Completeness Encompasses Standard Physical Closure | v1 |
| fe | Foundational Closure and Primitive Structural Input: A Four-Axis Taxonomy | v1 |
| rie | A Factorization Criterion for Route Invariants with Fixed Endpoint Data | v1 |

## Site

The live site is at [closureresearchinitiative.org](https://closureresearchinitiative.org), deployed via Cloudflare and automatically updated from this repository.

## Repository Structure

| Path | Contents |
|------|----------|
| `index.html` | Homepage with monograph listing, all 7 papers, contact info |
| `{ccw,cfsg,scc,rc,fe,rie}/` | Individual paper landing pages with BibTeX, downloads, version history |
| `csm/` | Monograph landing page |
| `idea/` | Plain-language introduction |
| `overview/` | Result-by-result technical overview |
| `notes/` | Research notes |
| `guide/` | Reading guide with recommended sequences |
| `papers/` | Source of truth for LaTeX source and compiled PDFs |
| `archive/` | Archived versions of superseded preprints |
| `update-paper.ps1` | Script for publishing paper revisions |
| `feed.xml` | Atom feed for preprint updates |
| `sitemap.xml` | XML sitemap for search engines

## Updating Papers

Run the `update-paper.ps1` script to archive old versions and publish revisions:

```powershell
.\update-paper.ps1 -Paper rie -NewPdf path\to\new-version.pdf
```

## License

All works © Chast K. Wolfe. All rights reserved.

## Contact

Chast K. Wolfe · chast.wolfe@closureresearchinitiative.org
