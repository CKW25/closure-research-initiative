# Closure Research Initiative

Repository for the public HTML record, manuscript archive, citation metadata, and deployment code of the Closure Research Initiative.

The live research record is maintained at [closureresearchinitiative.org](https://closureresearchinitiative.org). This repository preserves the public HTML source, PDFs, LaTeX source bundles, version archive, bounded corpus-query Worker, and operational metadata used to serve that record.

## Research Scope

The Closure Research Initiative studies what structure a physical theory may invoke when it is formulated without external primitive structure. Its basic admissibility condition is intrinsicality: comparison predicates are relations among states and are invariant under the automorphisms of the comparison world they help constitute.

Under the theorem hypotheses stated in the monograph, especially local distinguishability, intrinsicality yields rectangular completeness as a theorem rather than as an independent closure axiom. The finite-to-global boundary is addressed through refinement-tower and finite-witness results. The subsequent development gives quotient semantics, the obstruction to subsystem attribution, route-invariant transport criteria, and geometric consequences in the ghost-free interface regime (T)+(D), under which the faithful realization is supplied canonically by the transport tower.

Standard physical frameworks are treated as recovery targets. Their successful structures constrain the program: background spacetime, field content, state spaces, gauge conventions, causal order, scale structure, and boundary data are classified according to whether they are recovered from the closed-system comparison architecture or retained as explicit interface conditions.

Research sequence, theorem status, empirical consequences, citation metadata, and provenance are maintained on [Overview](https://closureresearchinitiative.org/overview/), [Structural Map](https://closureresearchinitiative.org/map/), [Notation](https://closureresearchinitiative.org/notation/), [Logical Status](https://closureresearchinitiative.org/status/), [Predictions](https://closureresearchinitiative.org/predictions/), [Sources and Citation](https://closureresearchinitiative.org/sources/), and the individual work pages. For binding claims, cite the monograph, the relevant preprint, or the cited theorem location rather than this README.

## Canonical Citation

For general citation of the program, cite the current monograph:

Chast K. Wolfe, *Closed Systems from Comparison Completeness*, v7, Closure Research Initiative, 2026. Current version: [closureresearchinitiative.org/csm/](https://closureresearchinitiative.org/csm/). DOI pending for v7; prior DOI records are retained with their archived versions.

Paper-specific claims should cite the current work page listed in [Sources and Citation](https://closureresearchinitiative.org/sources/). GitHub citation metadata is provided in [`CITATION.cff`](CITATION.cff).

## Public Works

| Code | Title | Status | Citation target |
|------|-------|--------|-----------------|
| `csm` | *Closed Systems from Comparison Completeness* | Monograph, v7 | [Current page](https://closureresearchinitiative.org/csm/) |
| `ccw` | *Closed Comparison Worlds and the Obstruction to Subsystem Attribution* | Preprint, v3 | [Current page](https://closureresearchinitiative.org/ccw/) |
| `cfsg` | *Closure Forces Spherical Geometry: Genuinely Closed Three-Dimensional Systems Are Diffeomorphic to S3* | Preprint, v3 | [Current page](https://closureresearchinitiative.org/cfsg/) |
| `scc` | *Structural Closure and the Cosmological Misnomer: Admissibility, Expansion, and the Geometry of Closed Systems* | Preprint, v3 | [Current page](https://closureresearchinitiative.org/scc/) |
| `rc` | *Rectangular Completeness Encompasses Standard Physical Closure* | Preprint, v3 | [Current page](https://closureresearchinitiative.org/rc/) |
| `fe` | *Foundational Closure and Primitive Structural Input: A Four-Axis Taxonomy* | Preprint, v3 | [Paper page](https://closureresearchinitiative.org/fe/) |
| `rie` | *A Factorization Criterion for Route Invariants with Fixed Endpoint Data* | Preprint, v3 | [Current page](https://closureresearchinitiative.org/rie/) |

All public manuscripts are versioned research manuscripts. They are not peer reviewed unless a later record states otherwise.

## Repository Contents

| Path | Contents |
|------|----------|
| `index.html` and page directories | Public HTML record |
| `papers/` | Public PDFs and LaTeX source bundles for the monograph and six preprints |
| `archive/` | Superseded PDFs retained for provenance and version-specific reference |
| `external-sources.bib` | Bibliography for outside sources cited by the research record |
| `CITATION.cff` | GitHub-readable citation metadata |
| `LICENSE.md` | Repository-level rights and permissions notice |
| `CONTRIBUTING.md`, `SUPPORT.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` | Correction, correspondence, conduct, and security-reporting guidance |
| `.gitattributes` | Line-ending, binary-file, diff, and GitHub language-stat hygiene |
| `llms.txt` | Bounded research summary and citation guidance for retrieval tools |
| `src/worker.js` | Cloudflare Worker for `/api/ask`, `/api/ask-status`, and static-asset fallback |
| `src/_generated/ask-corpus.js` | Generated retrieval corpus for the public corpus-query interface |
| `scripts/` | Corpus and deployment-wiring checks |
| `_headers` and `_redirects` | Cloudflare response headers and path redirects |
| `wrangler.toml` | Cloudflare Worker deployment configuration |
| `update-paper.ps1` | Local paper revision helper; does not commit or push by default |

## Use and Corrections

The public record supports three participation channels:

- Use [GitHub Discussions](https://github.com/CKW25/closure-research-initiative/discussions) for technical discussion of definitions, hypotheses, proof structure, interpretation, and possible extensions.
- Use GitHub issue templates for public errata, citation corrections, broken links, deployment problems, or narrowly scoped technical questions about a specific passage.
- Use [Contact](https://closureresearchinitiative.org/contact/) for correspondence that should not be a public issue or discussion.

Reports should identify the work, version, section, theorem or definition label, page number when available, and the proposed correction or question.

For substantial theoretical criticism, cite the relevant formal statement and distinguish among:

- a definitional ambiguity,
- a proof error,
- a mismatch between a theorem and its stated hypotheses,
- a citation or versioning problem,
- a premise-level disagreement.

General correspondence is listed at [Contact](https://closureresearchinitiative.org/contact/). The [Reading Guide](https://closureresearchinitiative.org/guide/) gives suggested paths through the material by background and interest.

## Versioning and Provenance

The current monograph and preprints are the version-of-record releases. Version history is maintained on the corresponding work pages.

`main` is the only active branch. It is the public deployment branch and should remain the canonical source of the website record.

## Deployment Notes

The live site is served through Cloudflare Workers with static assets from this repository. Pushes to `main` publish automatically after Cloudflare completes its deployment.

Download links intentionally use `/dl/...` URLs. A separate Cloudflare download-count route increments the public counter and redirects to the static file. The shared `site.js` file reads `/dl/stats` and displays the visible down-arrow count beside each download link.

The checked-in Worker in `src/worker.js` serves the bounded corpus-query interface at `/ask/`. The generated corpus is built from the monograph, six public preprints, public research pages, `llms.txt`, and `external-sources.bib`. The Worker retrieves local corpus excerpts before calling the Cloudflare Workers inference binding and fails closed if the binding is absent.

Run the wiring checks after changes that touch downloads, Worker code, headers, redirects, the corpus, citation metadata, or public discoverability files:

```powershell
npm.cmd run backend:check
npm.cmd run backend:check:live
```

## Publication Workflow

Use `update-paper.ps1` only as a local helper for copying revised PDFs/source bundles and rebuilding `all-papers.zip`:

```powershell
.\update-paper.ps1 -Paper rie -NewPdf path\to\new-version.pdf
```

Before publishing a revision, verify that the work page, [Preprints](https://closureresearchinitiative.org/preprints/), BibTeX block, feed entry, sitemap, `llms.txt`, `CITATION.cff`, and version-history table describe the same version.

## Rights

All works are (c) Chast K. Wolfe. All rights reserved. Public availability is for reading, citation, criticism, and review; it is not an open-source license grant.

## Contact

- Chast K. Wolfe
- [chast.wolfe@closureresearchinitiative.org](mailto:chast.wolfe@closureresearchinitiative.org)
- [ORCID 0009-0008-8846-2539](https://orcid.org/0009-0008-8846-2539)
