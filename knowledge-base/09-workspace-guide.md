# Workspace guide

## Start here

The root [START-HERE.md](../START-HERE.md) is the entry point. Read the product foundation, scope register, source precedence and open questions before using old screens as development requirements.

```text
Resbite app/
  START-HERE.md
  knowledge-base/
    01-product-foundation.md
    02-scope-register.md
    03-user-journeys-and-rules.md
    04-source-precedence.md
    05-open-questions.md
    06-brand-assets-and-content.md
    07-audit-report.md
    08-decisions.md
    09-workspace-guide.md
    sources.md
    reference-extracts/
    audit/
  source-materials/
    README.md
    main-archive/
    supplementary-archive/
    app-design-archive/
    pitch-decks/
```

## What moved

| Original location | Current location |
|---|---|
| Complete resbite folder/ | source-materials/main-archive/ |
| Extra/ | source-materials/supplementary-archive/ |
| Resbite app docs/ | source-materials/app-design-archive/ |
| presentation_deck_13.1 (might be work in progress).pdf | source-materials/pitch-decks/presentation-deck-v13.1-wip.pdf |
| resbite-deck-one-pager-new.pdf | source-materials/pitch-decks/resbite-one-pager-2020.pdf |

Internal source-tree filenames and folder structures remain intact to preserve relative asset relationships. Absolute paths or links outside the moved trees have not been validated in native authoring applications. The [complete move map](audit/file-moves.json) records the previous path of every original file so these moves can be reversed or old references repaired.

The three archives remain separate because they contain unique files as well as duplicates. In particular, “supplementary” does not mean obsolete: it contains the controlling V3 master. The source catalogue identifies authority by content, not archive name.

## How to find material

- Use [sources.md](sources.md) for the human-readable catalogue and direct file links.
- Use [inventory.json](audit/inventory.json) for all 1,070 original files, hashes, sizes, dates and extraction metadata.
- Use [archive-members.json](audit/archive-members.json) and [rar-members.json](audit/rar-members.json) for files inside compressed archives.
- Use [duplicates.md](audit/duplicates.md) for byte-identical groups. Do not assume all duplicate copies can be removed without affecting project packaging.
- Use [scope-register.json](audit/scope-register.json) if another tool needs the same feature register in structured form.
- `audit/extracted-text/` contains searchable derivatives for source investigation, not authoritative replacements for layout, diagrams, comments or originals. Sensitive operational extracts were omitted.
- `reference-extracts/` holds an unchanged copy of the otherwise-buried full Keele report. Its parent archive/source provenance remains S0913.

## Naming for future additions

For new documents use descriptive lowercase names, an actual known date when meaningful, a version within its family, and a truthful status. For example: `resbite-mvp-scope-2026-09-17-draft.md`. Use `approved` only after an explicit decision. Do not label an export with its copy date as though that were its content date.

Avoid renaming every existing Illustrator, InDesign or After Effects asset into this pattern: linked source projects may depend on those filenames. The catalogue is the cleaner navigation layer for the historical collection.

## Maintaining scope

Record owner answers in the decision log. Update the matching scope IDs and journeys together. Preserve rejected/historical concepts separately so they cannot return unnoticed from an old mockup. External references mentioned inside source files are evidence links, not instructions to execute or approved dependencies.
