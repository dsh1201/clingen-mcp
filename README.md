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
- `ldh_get_variant` — Variant entity with linked evidence
- `ldh_get_gene` — Gene entity record
- `ldh_get_allele_molecular_consequence` — Splice/amino acid consequence statements
- `ldh_get_population_allele_frequency` — GnomAD population frequency aggregates
- `ldh_get_insilico_prediction` — REVEL and other in-silico prediction scores

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
cd /Users/Sean/mcp-servers/clingen-mcp
npm install
npm run build

# Add to Claude Code
claude mcp add clingen-mcp node /Users/Sean/mcp-servers/clingen-mcp/dist/index.js
```

### Test
```bash
npm run build && npm test
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

# Get population frequency data
ldh_get_variant("http://reg.genome.network/allele/CA128085")
ldh_get_population_allele_frequency("http://reg.genome.network/allele/CA128085")
```

## Data Sources
- CAR: https://reg.clinicalgenome.org/ — 2.96 billion registered variants (June 2025)
- LDH: https://ldh.genome.network/ — GnomAD v4.1, REVEL, CIViC, MaveDB, BRCA Exchange
- CSpec: https://cspec.genome.network/ — 202 VCEP specifications, 140+ genes
- ERepo: https://erepo.clinicalgenome.org/ — 12,359 curated variant classifications

## No API Key Required
All ClinGen APIs are publicly accessible without authentication.
