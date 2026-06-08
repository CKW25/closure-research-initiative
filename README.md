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
| `index.html` | Homepage with research-program summary, navigation paths, and contact summary |
| `site.js` | Shared theme toggle and download-count display script |
| `_headers` | Cloudflare Pages response headers for clean UTF-8 HTML delivery |
| `_redirects` | Legacy URL redirects, including `/license.html` and `/about.html` |
| `llms.txt` | Markdown site summary for AI and retrieval tools |
| `idea/` | Plain-language introduction |
| `overview/` | Result-by-result overview |
| `map/` | Four-axis structural map |
| `example/` | Worked four-state comparison-world example |
| `objections/` | Strong objections and current answers/open points |
| `notation/` | Core terms and symbols |
| `contact/` | Correspondence and registry information |
| `license/` | Copyright and permissions page |
| `notes/` | Development notes |
| `guide/` | Reading guide |
| `csm/` | Monograph landing page |
| `{ccw,cfsg,scc,rc,fe,rie}/` | Individual paper landing pages |
| `papers/` | Source of truth for LaTeX source and compiled PDFs |
| `archive/` | Archived versions of superseded preprints |
| `all-papers.zip` | Download bundle served through `/dl/all-papers.zip` |
| `feed.xml` | Atom feed for preprint updates |
| `sitemap.xml` | XML sitemap |
| `update-paper.ps1` | Paper revision/publishing helper |

## Deployment

The live site is deployed by Cloudflare Pages from the `main` branch of this GitHub repository. Pushes to `main` publish automatically after Cloudflare finishes its build.

Download links intentionally use `/dl/...` URLs. A Cloudflare Worker handles those routes, increments the download counter, and redirects to the static file at the site root. The shared `site.js` file reads `/dl/stats` and appends the visible down-arrow count beside each download link.

The homepage and paper landing pages include Schema.org JSON-LD metadata. The root `llms.txt` file gives AI and retrieval tools a concise site map, disambiguation note, and citation guidance.

`all-papers.zip` is a tracked deploy asset because the public preprints page links to it. Local secrets and Cloudflare cache files remain ignored under `token/` and `.wrangler/`.

## Updating papers

Run the publishing script to archive the current root PDF/source bundle, copy in a new PDF/source bundle, and rebuild `all-papers.zip`:

```powershell
.\update-paper.ps1 -Paper rie -NewPdf path\to\new-version.pdf
```

The script no longer commits or pushes by default. Before publishing, verify that the paper landing page, `/preprints/`, BibTeX, feed entry, sitemap, and version history all describe the same version. Then commit and push to `main`.

## License

All works © Chast K. Wolfe. All rights reserved. Public availability is for reading, citation, criticism, and scholarly review; it is not an open-source license grant.

## Contact

Chast K. Wolfe · [chast.wolfe@closureresearchinitiative.org](mailto:chast.wolfe@closureresearchinitiative.org)
