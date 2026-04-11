#!/usr/bin/env node
/**
 * ClinGen MCP Server
 * Provides tools for the ClinGen API platform:
 *  - CAR  (ClinGen Allele Registry)     https://reg.clinicalgenome.org/
 *  - LDH  (Linked Data Hub)             https://ldh.genome.network/ldh/srvc
 *  - CSpec (Criteria Specification Reg) https://cspec.genome.network/cspec/api/
 *  - ERepo (Evidence Repository)        https://erepo.clinicalgenome.org/evrepo/
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Base URLs ────────────────────────────────────────────────────────────────
const CAR_BASE   = "https://reg.clinicalgenome.org";
const LDH_BASE   = "https://ldh.genome.network/ldh";  // entity queries: /ldh/{EntityType}?iri=
const LDH_SRVC   = "https://ldh.genome.network/ldh/srvc"; // service metadata
const CSPEC_BASE = "https://cspec.genome.network/cspec/api";
const EREPO_BASE = "https://erepo.clinicalgenome.org/evrepo/api";

const DEFAULT_TIMEOUT_MS = 15_000;

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "(no body)");
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === "AbortError") {
      throw new Error(`Request timed out after ${DEFAULT_TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  }
}

function buildQS(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ─── Server ──────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "clingen-mcp",
  version: "1.0.0",
});

// ═══════════════════════════════════════════════════════════════════════════════
// CAR – ClinGen Allele Registry
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool(
  "car_lookup_by_caid",
  {
    description:
      "Look up a variant in the ClinGen Allele Registry (CAR) by its CAid " +
      "(ClinGen Allele Identifier, e.g. 'CA128085'). Returns genomic coordinates " +
      "across genome builds, transcript alleles with HGVS nomenclature, protein " +
      "consequences, MANE Select status, and cross-references to ClinVar, dbSNP, " +
      "gnomAD, ExAC, and COSMIC.",
    inputSchema: {
      caid: z
        .string()
        .regex(/^CA\d+$/, "Must be a CAid like CA128085")
        .describe("ClinGen Allele ID, e.g. 'CA128085'"),
    },
  },
  async ({ caid }) => {
    const url = `${CAR_BASE}/allele/${encodeURIComponent(caid)}`;
    const data = await fetchJSON(url);
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "car_lookup_by_hgvs",
  {
    description:
      "Look up a variant in the ClinGen Allele Registry (CAR) by its HGVS " +
      "nomenclature string. Returns the matching allele record with its CAid, " +
      "genomic coordinates across genome builds, transcript alleles, protein " +
      "consequences, and external database cross-references. " +
      "Example HGVS: 'NM_000690.4:c.1510G>A'",
    inputSchema: {
      hgvs: z
        .string()
        .min(5)
        .describe(
          "HGVS variant expression, e.g. 'NM_000690.4:c.1510G>A' or " +
          "'NC_000017.11:g.43094692G>A'"
        ),
    },
  },
  async ({ hgvs }) => {
    const url = `${CAR_BASE}/allele${buildQS({ hgvs })}`;
    const data = await fetchJSON(url);
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "car_lookup_by_gnomad",
  {
    description:
      "Look up a variant in the ClinGen Allele Registry (CAR) by its gnomAD " +
      "variant identifier. Returns the CAid and full allele record with external " +
      "database cross-references. Example gnomAD ID: '12-111803962-G-A' (chr-pos-ref-alt).",
    inputSchema: {
      gnomad_id: z
        .string()
        .min(5)
        .describe("gnomAD variant ID in format 'chr-pos-ref-alt', e.g. '12-111803962-G-A'"),
    },
  },
  async ({ gnomad_id }) => {
    const url = `${CAR_BASE}/allele${buildQS({ gnomAD: gnomad_id })}`;
    const data = await fetchJSON(url);
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// LDH – Linked Data Hub
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool(
  "ldh_get_service_info",
  {
    description:
      "Get metadata about the ClinGen Linked Data Hub (LDH) service: version, " +
      "available entity types (Variant, Gene, AlleleMolecularConsequenceStatement, " +
      "PopulationAlleleFrequencyStatement, etc.), and linked external datasets " +
      "(GnomAD Exomes v4.1 with 205M+ records, GnomAD Genomes v4.1 with 909M+ records, " +
      "REVEL scores with 77M+ records, Variants in Literature with 48K+ records).",
    inputSchema: {},
  },
  async () => {
    const data = await fetchJSON(LDH_SRVC);
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "ldh_get_variant",
  {
    description:
      "Retrieve a variant entity record from the ClinGen Linked Data Hub (LDH) " +
      "by its IRI (typically a CAR allele IRI). LDH aggregates evidence from " +
      "external databases: GnomAD population frequencies, REVEL in-silico prediction " +
      "scores, BRCA Exchange records, CIViC evidence, and MaveDB mappings. " +
      "Example IRI: 'http://reg.genome.network/allele/CA128085'",
    inputSchema: {
      iri: z
        .string()
        .url()
        .describe(
          "IRI of the variant entity from CAR, e.g. 'http://reg.genome.network/allele/CA128085'"
        ),
    },
  },
  async ({ iri }) => {
    const url = `${LDH_BASE}/Variant${buildQS({ iri })}`;
    const data = await fetchJSON(url);
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "ldh_get_gene",
  {
    description:
      "Retrieve a gene entity from the ClinGen Linked Data Hub (LDH) by its IRI. " +
      "Returns linked gene information and associated external data sources.",
    inputSchema: {
      iri: z
        .string()
        .url()
        .describe(
          "IRI of the gene entity, e.g. 'https://www.ncbi.nlm.nih.gov/gene/217'"
        ),
    },
  },
  async ({ iri }) => {
    const url = `${LDH_BASE}/Gene${buildQS({ iri })}`;
    const data = await fetchJSON(url);
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "ldh_get_allele_molecular_consequence",
  {
    description:
      "Retrieve allele molecular consequence statements from the ClinGen Linked " +
      "Data Hub (LDH) for a variant IRI. Returns computed functional consequences " +
      "including splice effects, amino acid changes, and other molecular impacts " +
      "from tools like SpliceAI and OpenCRAVAT.",
    inputSchema: {
      iri: z
        .string()
        .url()
        .describe("IRI of the variant entity (CAR allele IRI)"),
    },
  },
  async ({ iri }) => {
    const url = `${LDH_BASE}/AlleleMolecularConsequenceStatement${buildQS({ iri })}`;
    const data = await fetchJSON(url);
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "ldh_get_population_allele_frequency",
  {
    description:
      "Retrieve population allele frequency statements from the ClinGen Linked " +
      "Data Hub (LDH) for a variant IRI. Aggregates frequency data from " +
      "GnomAD Exomes v4.1 (205M+ records) and GnomAD Genomes v4.1 (909M+ records).",
    inputSchema: {
      iri: z
        .string()
        .url()
        .describe("IRI of the variant entity (CAR allele IRI)"),
    },
  },
  async ({ iri }) => {
    const url = `${LDH_BASE}/PopulationAlleleFrequencyStatement${buildQS({ iri })}`;
    const data = await fetchJSON(url);
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "ldh_get_insilico_prediction",
  {
    description:
      "Retrieve in-silico prediction score statements from the ClinGen Linked " +
      "Data Hub (LDH) for a variant IRI. Returns computational pathogenicity " +
      "prediction scores such as REVEL (77M+ records indexed), used as evidence " +
      "in ACMG/AMP variant classification (PP3/BP4 criteria).",
    inputSchema: {
      iri: z
        .string()
        .url()
        .describe("IRI of the variant entity (CAR allele IRI)"),
    },
  },
  async ({ iri }) => {
    const url = `${LDH_BASE}/InSilicoPredictionScoreStatement${buildQS({ iri })}`;
    const data = await fetchJSON(url);
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// CSpec – Criteria Specification Registry
// ═══════════════════════════════════════════════════════════════════════════════

// CSpec response wrapper type
interface CSpecListResponse {
  "@context"?: string;
  data: CSpecSpec[];
}
interface CSpecSpec {
  "@id": string;
  affiliation?: { label?: string; url?: string };
  ruleSets?: Array<{ genes?: Array<{ label?: string; diseases?: unknown[] }> }>;
  status?: string;
  url?: string;
  version?: string;
}

async function fetchCSpecList(): Promise<CSpecSpec[]> {
  const response = await fetchJSON<CSpecListResponse>(`${CSPEC_BASE}/svis`);
  if (Array.isArray(response)) return response as unknown as CSpecSpec[];
  if (response?.data && Array.isArray(response.data)) return response.data;
  throw new Error("Unexpected CSpec /svis response structure");
}

server.registerTool(
  "cspec_list_specifications",
  {
    description:
      "List all ACMG/AMP variant classification criteria specifications in the " +
      "ClinGen Criteria Specification Registry (CSpec). Returns specifications from " +
      "all Variant Curation Expert Panels (VCEPs) including the associated genes, " +
      "diseases, VCEP names, version, and release status. " +
      "There are 200+ specifications available covering 140+ gene-disease pairs.",
    inputSchema: {},
  },
  async () => {
    const specs = await fetchCSpecList();
    return { content: [{ type: "text", text: formatResult(specs) }] };
  }
);

server.registerTool(
  "cspec_get_specification",
  {
    description:
      "Get a specific ACMG/AMP variant classification criteria specification from " +
      "the ClinGen Criteria Specification Registry (CSpec) by its specification ID. " +
      "Returns the full specification including all 35 ACMG/AMP criteria codes " +
      "(PM1, BP4, PS3, etc.), their allowed evidence strengths, interpretive guidance, " +
      "gene-disease pairs, and literature references. " +
      "Example IDs: 'GN002' (MYH7 Cardiomyopathy), 'GN003' (PTEN), 'GN005' (CDH23).",
    inputSchema: {
      spec_id: z
        .string()
        .regex(/^GN\d+$/, "Must be a CSpec ID like GN002")
        .describe("CSpec specification ID, e.g. 'GN002'"),
    },
  },
  async ({ spec_id }) => {
    const url = `${CSPEC_BASE}/SequenceVariantInterpretation/id/${encodeURIComponent(spec_id)}`;
    const data = await fetchJSON(url);
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "cspec_search_by_gene",
  {
    description:
      "Search ClinGen Criteria Specification Registry (CSpec) specifications by " +
      "gene symbol. Filters the full specification list to those covering the given " +
      "gene. Returns matching specifications with VCEP names, versions, and " +
      "gene-disease associations. Example genes: 'BRCA1', 'TP53', 'MYH7', 'PTEN'.",
    inputSchema: {
      gene: z
        .string()
        .min(1)
        .describe("HGNC gene symbol, e.g. 'BRCA1' or 'MYH7'"),
    },
  },
  async ({ gene }) => {
    const allSpecs = await fetchCSpecList();
    const geneUpper = gene.toUpperCase();
    const matches = allSpecs.filter((spec) =>
      spec.ruleSets?.some((rs) =>
        rs.genes?.some((g) => g.label?.toUpperCase() === geneUpper)
      )
    );
    if (matches.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No CSpec specifications found for gene '${gene}'. ` +
              "Use cspec_list_specifications to browse all available genes.",
          },
        ],
      };
    }
    return { content: [{ type: "text", text: formatResult(matches) }] };
  }
);

server.registerTool(
  "cspec_search_by_vcep",
  {
    description:
      "Search ClinGen Criteria Specification Registry (CSpec) specifications by " +
      "Variant Curation Expert Panel (VCEP) name. Returns all specifications " +
      "maintained by the given expert panel. " +
      "Example VCEPs: 'Cardiomyopathy', 'PTEN', 'Hearing Loss', 'ENIGMA BRCA1 and BRCA2'.",
    inputSchema: {
      vcep_name: z
        .string()
        .min(1)
        .describe("Partial or full VCEP name, e.g. 'Cardiomyopathy'"),
    },
  },
  async ({ vcep_name }) => {
    const allSpecs = await fetchCSpecList();
    const query = vcep_name.toLowerCase();
    const matches = allSpecs.filter((spec) =>
      spec.affiliation?.label?.toLowerCase().includes(query)
    );
    if (matches.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No CSpec specifications found for VCEP matching '${vcep_name}'.`,
          },
        ],
      };
    }
    return { content: [{ type: "text", text: formatResult(matches) }] };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ERepo – Evidence Repository
// ═══════════════════════════════════════════════════════════════════════════════

// Fields to strip in compact mode — verbose and rarely needed for overview queries
const EREPO_VERBOSE_FIELDS = new Set([
  "summaryDesc",      // full classification rationale text (can be 10KB+ per record)
  "versionsList",     // historical version objects
  "_rev",             // ArangoDB internal revision token
  "pubMedArticles",   // raw PubMed article objects
  "PCERDocID",        // internal submission ID
  "geneNcbiId",       // redundant with gene symbol
  "mondoId",          // redundant with condition
  "affiliationId",    // internal org ID (ep label is sufficient)
  "docVersion",       // internal doc version number
  "uuid",             // redundant with _key
  "moi",              // mode of inheritance (rarely needed in summary)
]);

// The minimal set of fields returned in compact mode
const EREPO_COMPACT_KEEP = new Set([
  "_key", "caId", "cvId", "gene",
  "classification", "condition",
  "preferredVarTitle", "hgvs",
  "metCodes", "unMetCodes",
  "publishedDate", "approvedDate",
  "ep", "retracted",
]);

type ERepoRecord = Record<string, unknown>;

function compactErepoRecord(record: ERepoRecord): ERepoRecord {
  const out: ERepoRecord = {};
  for (const k of EREPO_COMPACT_KEEP) {
    if (!(k in record)) continue;
    const v = record[k];
    // Keep only the first HGVS entry to save space
    if (k === "hgvs" && Array.isArray(v)) {
      out[k] = (v as unknown[]).slice(0, 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Check if any HGVS string in the record matches the given substring/pattern */
function hgvsMatches(record: ERepoRecord, pattern: string): boolean {
  const re = new RegExp(pattern, "i");
  const hgvsArr = record["hgvs"];
  if (Array.isArray(hgvsArr)) {
    return (hgvsArr as string[]).some((h) => re.test(h));
  }
  const title = record["preferredVarTitle"];
  if (typeof title === "string") return re.test(title);
  return false;
}

server.registerTool(
  "erepo_query_classifications",
  {
    description:
      "Query the ClinGen Evidence Repository (ERepo) for expert-curated variant " +
      "classifications. Filters by gene, HGVS, CAid, ClinVar ID, expert panel, " +
      "condition, or ACMG assertion. " +
      "Returns compact records by default (caId, gene, preferredVarTitle, hgvs[0], " +
      "classification, condition, metCodes, unMetCodes, publishedDate). " +
      "Use hgvs_contains to filter results by HGVS substring or regex — e.g. " +
      "'exon1' patterns like 'c\\.1[0-9]{0,2}[+-]' or 'c\\.[1-9]\\d?[^0-9]' for early-coding variants. " +
      "Use result_limit to cap returned matches (default 10). " +
      "Use erepo_get_classification for one record's full detail including summaryDesc.",
    inputSchema: {
      gene: z.string().optional().describe("Gene symbol, e.g. 'BRCA2'"),
      hgvs: z.string().optional().describe("Exact HGVS expression for server-side lookup"),
      caid: z.string().optional().describe("CAid, e.g. 'CA023232'"),
      variation_id: z.string().optional().describe("ClinVar variation ID"),
      expert_panel: z.string().optional().describe("Expert panel name (partial match)"),
      condition: z.string().optional().describe("Disease/condition name"),
      assertion: z
        .enum(["Pathogenic", "Likely pathogenic", "Uncertain significance",
               "Likely benign", "Benign"])
        .optional()
        .describe("ACMG/AMP classification assertion"),
      hgvs_contains: z
        .string()
        .optional()
        .describe(
          "Client-side HGVS filter: substring or regex applied to each record's hgvs array. " +
          "Examples: 'exon1', 'c\\.67', 'del', 'c\\.[1-9]\\d?[^0-9]' (small c. positions ≈ exon 1)"
        ),
      fetch_limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(100)
        .describe("How many records to fetch from server before client-side filtering (default 100)"),
      result_limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Maximum records to return after all filtering (default 10)"),
      compact: z
        .boolean()
        .default(true)
        .describe("Strip verbose fields (summaryDesc etc.). Set false only when needed."),
    },
  },
  async ({ gene, hgvs, caid, variation_id, expert_panel, condition, assertion,
           hgvs_contains, fetch_limit, result_limit, compact }) => {
    const params: Record<string, string | number | undefined> = { limit: fetch_limit, offset: 0 };
    if (gene) params["gene"] = gene;
    if (hgvs) params["hgvs"] = hgvs;
    if (caid) params["caid"] = caid;
    if (variation_id) params["variationId"] = variation_id;
    if (expert_panel) params["expertpanel"] = expert_panel;
    if (condition) params["condition"] = condition;
    if (assertion) params["assertion"] = assertion;

    const url = `${EREPO_BASE}/summary/classifications${buildQS(params)}`;
    const raw = await fetchJSON<{ data?: ERepoRecord[] }>(url);

    let records: ERepoRecord[] = raw?.data ?? [];

    // Client-side HGVS pattern filter
    if (hgvs_contains && records.length > 0) {
      records = records.filter((r) => hgvsMatches(r, hgvs_contains));
    }

    // Apply result_limit after filtering
    records = records.slice(0, result_limit);

    if (compact) {
      records = records.map(compactErepoRecord);
    }

    return {
      content: [{
        type: "text",
        text: formatResult({ count: records.length, data: records }),
      }],
    };
  }
);

server.registerTool(
  "erepo_get_classification",
  {
    description:
      "Get a specific variant classification record from the ClinGen Evidence " +
      "Repository (ERepo) by its unique entity ID. Returns the full classification " +
      "record including all applied ACMG/AMP criteria codes, unmet codes, detailed " +
      "classification rationale, approval date, and linked publications.",
    inputSchema: {
      entity_id: z
        .string()
        .min(1)
        .describe("ERepo entity/document ID (UUID or database key)"),
    },
  },
  async ({ entity_id }) => {
    const url = `${EREPO_BASE}/summary/classifications/${encodeURIComponent(entity_id)}`;
    const data = await fetchJSON(url);
    return { content: [{ type: "text", text: formatResult(data) }] };
  }
);

server.registerTool(
  "erepo_download_classifications",
  {
    description:
      "Download bulk variant classification data from the ClinGen Evidence Repository " +
      "(ERepo). Returns all curated variant classifications in the requested format. " +
      "Use 'tsv' for tab-separated or 'csv' for comma-separated format. " +
      "Warning: this returns a large dataset (10,527+ records).",
    inputSchema: {
      format: z
        .enum(["tsv", "csv"])
        .default("tsv")
        .describe("Download format: 'tsv' (default) or 'csv'"),
    },
  },
  async ({ format }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000); // 60s for bulk download
    try {
      const url =
        format === "csv"
          ? `${EREPO_BASE}/summary/classifications/download?type=csv`
          : `${EREPO_BASE}/summary/classifications/download`;

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      const lines = text.split("\n");
      const preview = lines.slice(0, 6).join("\n");
      return {
        content: [
          {
            type: "text",
            text:
              `Downloaded ${lines.length - 1} classification records (${format.toUpperCase()}).\n\n` +
              `First 5 rows preview:\n${preview}\n\n` +
              `[Full data truncated — ${text.length} bytes total]`,
          },
        ],
      };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }
);

server.registerTool(
  "erepo_get_summary_stats",
  {
    description:
      "Get summary statistics and heatmap data from the ClinGen Evidence Repository " +
      "(ERepo) for a given entity type. Returns counts of classifications grouped by " +
      "pathogenicity category across genes or conditions.",
    inputSchema: {
      heatmap_type: z
        .enum(["gene", "condition", "expertpanel"])
        .default("gene")
        .describe("Entity type to summarize by: 'gene', 'condition', or 'expertpanel'"),
      format: z
        .enum(["tsv", "csv"])
        .default("tsv")
        .describe("Download format"),
    },
  },
  async ({ heatmap_type, format }) => {
    const url =
      `${EREPO_BASE}/summary/classifications/summary/download/${heatmap_type}?format=${format}`;
    const res = await fetch(url, {
      headers: { Accept: "text/plain" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    const lines = text.split("\n");
    const preview = lines.slice(0, 11).join("\n");
    return {
      content: [
        {
          type: "text",
          text:
            `ERepo summary statistics by ${heatmap_type} (${format.toUpperCase()}):\n\n` +
            `${preview}\n\n` +
            `[${lines.length - 1} rows total]`,
        },
      ],
    };
  }
);

// ─── Start server ─────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
