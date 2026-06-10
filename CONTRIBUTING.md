# Scholarly Contributions and Corrections

This repository supports the public website and manuscript record of the Closure Research Initiative. Contributions should be directed toward accuracy, citation integrity, deployment correctness, and clear scholarly navigation.

## Appropriate Reports

Use GitHub issues for:

- possible errata in a definition, lemma, theorem, proof, citation, or version note,
- broken links, missing citation metadata, or inconsistent BibTeX,
- deployment or download-count problems,
- narrowly scoped questions about a specific passage,
- proposed improvements to scholarly presentation or public discoverability.

Use [GitHub Discussions](https://github.com/CKW25/closure-research-initiative/discussions) for broader scholarly discussion, interpretive questions, and proposals that are not yet correction reports.

For broad correspondence, use the contact information on the site. For paper-specific criticism, cite the work, version, section, theorem or definition label, and page number when available.

## Standards for Errata

An erratum report should include:

1. Work and version.
2. Exact location.
3. The statement at issue.
4. The reason the statement is wrong, ambiguous, or underspecified.
5. The proposed correction, if known.
6. Whether the issue affects later results, citations, or public summaries.

Distinguish a proof error from disagreement with a premise. Both can be valuable, but they require different treatment.

## Pull Requests

Pull requests are appropriate for site infrastructure, metadata, typographical corrections, broken links, and narrowly scoped documentation fixes. Changes to mathematical claims, theorem statements, version histories, or public citation targets should first be discussed in an issue unless they are correcting an unambiguous transcription error.

Do not add external claims without a citation trail. External background should point to DOI, publisher, arXiv, archive, institutional, or standards pages, and should be reflected in `external-sources.bib` when it is part of the site bibliography.

## Publication Checks

Before merging changes that affect public manuscripts or citation records, verify the relevant landing page, `preprints/`, `sources/`, `llms.txt`, `CITATION.cff`, `feed.xml`, and `sitemap.xml` agree on title, version, DOI, date, PDF link, and source bundle.

Run deployment-wiring checks when changing Worker code, headers, redirects, downloads, metadata, or public discoverability files:

```powershell
npm.cmd run backend:check
npm.cmd run backend:check:live
```

## Rights

Public availability of the manuscripts and site source supports reading, citation, criticism, and scholarly review. It is not an open-source license grant. All works are (c) Chast K. Wolfe. All rights reserved.
