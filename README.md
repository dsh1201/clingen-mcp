# ClinGen MCP Server

MCP server for the [ClinGen API platform](https://doi.org/10.1016/j.xgen.2026.101211) providing Claude Code access to ClinGen's 4 genomic variant microservices.

## APIs Covered

| Prefix | Service | Description |
|--------|---------|-------------|
| `car_*` | ClinGen Allele Registry (CAR) | Variant naming, HGVS/CAid lookups, VRS identifiers |
| `ldh_*` | Linked Data Hub (LDH) | GnomAD frequencies, REVEL scores, literature evidence |
| `cspec_*` | Criteria Specification Registry (CSpec) | ACMG/AMP criteria specs per gene/disease/VCEP |
| `erepo_*` | Evidence Repository (ERepo) | 12,000+ expert-curated variant classifications |

## Tools

### CAR – ClinGen Allele Registry
- `car_lookup_by_caid` — Lookup variant by CAid (e.g. `CA128085`)
- `car_lookup_by_hgvs` — Lookup variant by HGVS (e.g. `NM_000690.4:c.1510G>A`)
- `car_lookup_by_gnomad` — Lookup variant by gnomAD ID (e.g. `12-111803962-G-A`)

### LDH – Linked Data Hub
- `ldh_get_service_info` — Service metadata, entity types, external datasets
- `ldh_get_variant` — Linked evidence overview for a variant; see [two-mode usage](#ldh_get_variant-two-mode-usage) below
- `ldh_get_gene` — Gene entity record
- `ldh_get_allele_molecular_consequence` — Preferred transcript consequences from Ensembl VEP and RefSeq (including MANE Select)
- `ldh_get_population_allele_frequency` — gnomAD v4.1 Exome and Genome frequencies: AF, AC, AN, homozygote counts, grpMaxFAF95, and per-ancestry subcohort breakdown
- `ldh_get_insilico_prediction` — REVEL scores per transcript (MANE Select flagged), CADD, M-CAP

### CSpec – Criteria Specification Registry
- `cspec_list_specifications` — List all 200+ ACMG/AMP specifications
- `cspec_get_specification` — Get full spec by ID (e.g. `GN002` for MYH7)
- `cspec_search_by_gene` — Filter specs by gene symbol (e.g. `BRCA1`)
- `cspec_search_by_vcep` — Filter specs by VCEP name (e.g. `Cardiomyopathy`)

### ERepo – Evidence Repository
- `erepo_query_classifications` — Query 12,000+ curated variants by gene/HGVS/CAid/assertion
- `erepo_get_classification` — Get full classification record by entity ID
- `erepo_download_classifications` — Bulk download all classifications (TSV/CSV)
- `erepo_get_summary_stats` — Heatmap statistics by gene/condition/expert panel

## Installation

### Prerequisites
- Node.js ≥ 18
- Claude Code CLI

### Install
```bash
git clone https://github.com/dsh1201/clingen-mcp
cd clingen-mcp
npm install
npm run build

# Add to Claude Code
claude mcp add clingen-mcp node $(pwd)/dist/index.js
```

### Test
```bash
npm test
```

### Rebuild after edits
```bash
npm run build
```

## Example Usage in Claude Code

```
# Look up the ALDH2 rs671 variant
car_lookup_by_hgvs("NM_000690.4:c.1510G>A")

# Get classification criteria for BRCA1
cspec_search_by_gene("BRCA1")

# Query all pathogenic BRCA1 variants
erepo_query_classifications(gene="BRCA1", assertion="Pathogenic")

# Overview: see all available entity types + compact summaries (safe for any variant)
ldh_get_variant("CA128085")

# Selective: get full detail for specific entity types only
ldh_get_variant("CA128085", entity_types=["GnomADExomesV4.1", "RevelScore"])

# Get gnomAD v4.1 frequencies (AF, AC, AN, grpMaxFAF95, per-ancestry)
ldh_get_population_allele_frequency("http://reg.genome.network/allele/CA128085")

# Get REVEL score (MANE Select), CADD, M-CAP
ldh_get_insilico_prediction("http://reg.genome.network/allele/CA128085")

# Get Ensembl VEP / RefSeq molecular consequence
ldh_get_allele_molecular_consequence("http://reg.genome.network/allele/CA128085")
```

## `ldh_get_variant` Two-Mode Usage

LDH variant data can exceed 1 MB for some variants (e.g. 27 literature records with full annotation text, or 54-annotator OpenCRAVAT reports). `ldh_get_variant` handles this with two modes:

### Overview Mode (default — no `entity_types`)

Returns compact summaries of **all available entity types** in one response. Safe to call for any variant.

```
ldh_get_variant("CA126713")
```

Returns:
- `entityTypesAvailable` — list of entity types present for this variant
- `compactSummary` — per-entity-type condensed output:

| Entity Type | Compact Output |
|---|---|
| `GnomADExomesV4.1` / `GnomADGenomesV4.1` | AF, AC, AN, homozygotes, grpMaxFAF95, jointFreq, subcohort count |
| `RevelScore` | Score and transcript for each entry (MANE Select flagged) |
| `AlleleMolecularConsequenceStatement` | Transcript count + id/consequence/source/biotype per transcript |
| `InSilicoPredictionScoreStatement` | Predictor count + score per predictor |
| `OpenCRAVAT` | variantInfo + 15 key clinical tools (CADD, REVEL, SIFT, PolyPhen2, BayesDel, AlphaMissense…) + full annotator list |
| `PathogenicityClassification` | Classification label |
| `PopulationAlleleFrequencyStatement` | Per-population AF/AC/AN/faf95/homozygousCount (up to 25 records) |
| `PopulationAlleleFrequencySource` | Source dataset names |
| `VariantsInLiterature` | Per-publication PMID/PMCID/DOI/type/annotationCount (up to 30 records) |
| `BrcaExchangeRecord` | bxId + clinical significance |
| `CivicEvidence` | Evidence count + level/significance per entry |
| `MaveDBMapping` | URN + functional score |
| Unknown types | Top-level field names + record count |

### Selective Mode (`entity_types` provided)

Returns **full uncompressed data** for only the listed entity types. Use when you need complete detail that the compact summary omits (e.g. gnomAD per-ancestry subcohort breakdown, full OpenCRAVAT annotator set).

```
ldh_get_variant("CA126713", entity_types=["RevelScore"])
ldh_get_variant("CA015944", entity_types=["GnomADExomesV4.1", "PopulationAlleleFrequencyStatement"])
```

> **Note:** Some individual entity types are themselves >1 MB (e.g. `VariantsInLiterature` with many annotated publications, `OpenCRAVAT` with 54 annotators). For gnomAD frequencies use `ldh_get_population_allele_frequency`; for REVEL/CADD use `ldh_get_insilico_prediction` — both return pre-extracted compact data.

## LDH API Notes

The LDH sub-tools (`ldh_get_population_allele_frequency`, `ldh_get_insilico_prediction`, `ldh_get_allele_molecular_consequence`) use the LDH `/Variant/id/{caid}/ld?detail=high` endpoint — **not** the `?iri=` query parameter form.

The `?iri=` form only returns service-level statistics (`ldPerEnt` counts) and does not embed actual variant data. The `/id/` path format is required to retrieve real gnomAD frequencies, REVEL scores, and VEP consequence records.

If a tool returns "No data found", it means LDH genuinely has no record of that type for the variant — not a lookup error. Coverage varies: gnomAD v4.1 covers ~1.6 billion alleles, REVEL covers ~78M records, and VEP consequence statements cover ~14M variants.

## Data Sources
- CAR: https://reg.clinicalgenome.org/ — 2.96 billion registered variants (June 2025)
- LDH: https://ldh.genome.network/ — GnomAD v4.1, REVEL, CIViC, MaveDB, BRCA Exchange
- CSpec: https://cspec.genome.network/ — 202 VCEP specifications, 140+ genes
- ERepo: https://erepo.clinicalgenome.org/ — 12,359 curated variant classifications

## No API Key Required
All ClinGen APIs are publicly accessible without authentication.
