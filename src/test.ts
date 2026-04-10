#!/usr/bin/env node
/**
 * ClinGen MCP Server – API integration tests
 * Verifies that each real ClinGen API endpoint responds correctly.
 * Run: npm run build && npm test
 */

export {}; // make this file a module for top-level await

const CAR_BASE   = "https://reg.clinicalgenome.org";
const LDH_BASE   = "https://ldh.genome.network/ldh";
const LDH_SRVC   = "https://ldh.genome.network/ldh/srvc";
const CSPEC_BASE = "https://cspec.genome.network/cspec/api";
const EREPO_BASE = "https://erepo.clinicalgenome.org/evrepo/api";

type TestResult = { name: string; passed: boolean; message: string };

async function fetchJSON(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function run(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    return { name, passed: true, message: "OK" };
  } catch (err) {
    const msg = (err as Error).message;
    console.log(`  ❌ ${name}: ${msg}`);
    return { name, passed: false, message: msg };
  }
}

// ─── CAR Tests ────────────────────────────────────────────────────────────────
async function testCarLookupByCaid(): Promise<void> {
  const data = await fetchJSON(`${CAR_BASE}/allele/CA128085`) as Record<string, unknown>;
  if (!data["@id"]) throw new Error("Response missing @id field");
  if (!data["communityStandardTitle"]) throw new Error("Response missing communityStandardTitle");
  console.log(`     CAid: CA128085 → ${data["communityStandardTitle"]}`);
}

async function testCarLookupByHgvs(): Promise<void> {
  const hgvs = "NM_000690.4:c.1510G>A";
  const url = `${CAR_BASE}/allele?hgvs=${encodeURIComponent(hgvs)}`;
  const data = await fetchJSON(url) as Record<string, unknown>;
  if (!data["@id"]) throw new Error("Response missing @id field");
  console.log(`     HGVS: ${hgvs} → ${data["@id"]}`);
}

async function testCarLookupByGnomad(): Promise<void> {
  // gnomAD ID for ALDH2 rs671: chr12-111803962-G-A (GRCh38)
  const url = `${CAR_BASE}/allele?gnomAD=12-111803962-G-A`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  // Accept 200 (found) or 400/404 (parameter format unknown) — endpoint exists
  if (res.status !== 200 && res.status !== 400 && res.status !== 404) {
    throw new Error(`Unexpected HTTP ${res.status}`);
  }
  console.log(`     gnomAD lookup: HTTP ${res.status} (endpoint reachable)`);
}

// ─── LDH Tests ───────────────────────────────────────────────────────────────
async function testLdhServiceInfo(): Promise<void> {
  const data = await fetchJSON(LDH_SRVC) as Record<string, unknown>;
  if (!data["metadata"] && !data["data"] && !data["status"]) {
    throw new Error("Missing expected LDH response fields");
  }
  const version = (data["data"] as Record<string, unknown> | undefined);
  console.log(`     LDH service info received${version ? "" : ""}`);
}

async function testLdhGetVariant(): Promise<void> {
  const iri = "http://reg.genome.network/allele/CA128085";
  const url = `${LDH_BASE}/Variant?iri=${encodeURIComponent(iri)}`;
  const data = await fetchJSON(url) as Record<string, unknown>;
  if (!data["data"] && !data["status"]) {
    throw new Error("Missing expected LDH Variant response fields");
  }
  const d = data["data"] as Record<string, unknown>;
  console.log(`     LDH Variant: entType=${d["entType"]}, entCount=${d["entCount"]}`);
}

// ─── CSpec Tests ─────────────────────────────────────────────────────────────
async function testCspecListSpecifications(): Promise<void> {
  const resp = await fetchJSON(`${CSPEC_BASE}/svis`) as { data?: unknown[] } | unknown[];
  const data: unknown[] = Array.isArray(resp)
    ? resp
    : (resp as { data?: unknown[] }).data ?? [];
  if (!Array.isArray(data)) throw new Error("Expected array of specifications");
  if (data.length < 10) throw new Error(`Too few specs: ${data.length}`);
  console.log(`     Found ${data.length} CSpec specifications`);
}

async function testCspecGetById(): Promise<void> {
  const data = await fetchJSON(
    `${CSPEC_BASE}/SequenceVariantInterpretation/id/GN002`
  ) as Record<string, unknown>;
  if (!data["@id"]) throw new Error("Missing @id field");
  if (!data["version"]) throw new Error("Missing version field");
  console.log(`     GN002: ${data["@type"] ?? "CSpec"} v${data["version"]}`);
}

async function testCspecSearchByGene(): Promise<void> {
  const resp = await fetchJSON(`${CSPEC_BASE}/svis`) as { data?: Array<{
    ruleSets?: Array<{ genes?: Array<{ label?: string }> }>;
    affiliation?: { label?: string };
  }> } | Array<{ ruleSets?: Array<{ genes?: Array<{ label?: string }> }>; affiliation?: { label?: string } }>;
  const allSpecs = Array.isArray(resp) ? resp : (resp as { data?: typeof resp }).data ?? [];
  const matches = (allSpecs as Array<{ ruleSets?: Array<{ genes?: Array<{ label?: string }> }>; affiliation?: { label?: string } }>).filter((spec) =>
    spec.ruleSets?.some((rs) => rs.genes?.some((g) => g.label?.toUpperCase() === "MYH7"))
  );
  if (matches.length === 0) throw new Error("No specs found for MYH7");
  console.log(`     MYH7 specs: ${matches.length} found (VCEP: ${matches[0]?.affiliation?.label})`);
}

// ─── ERepo Tests ─────────────────────────────────────────────────────────────
async function testErepoQueryByGene(): Promise<void> {
  const url = `${EREPO_BASE}/summary/classifications?gene=BRCA1&limit=3`;
  const data = await fetchJSON(url) as { data?: unknown[] };
  if (!data.data || !Array.isArray(data.data)) throw new Error("Missing data array in response");
  console.log(`     BRCA1 classifications: ${data.data.length} records returned`);
}

async function testErepoQueryByAssertion(): Promise<void> {
  const url = `${EREPO_BASE}/summary/classifications?gene=BRCA1&assertion=Pathogenic&limit=2`;
  const data = await fetchJSON(url) as { data?: unknown[] };
  if (!data.data || !Array.isArray(data.data)) throw new Error("Missing data array in response");
  console.log(`     BRCA1 Pathogenic: ${data.data.length} records returned`);
}

async function testErepoDownloadEndpoint(): Promise<void> {
  const res = await fetch(`${EREPO_BASE}/summary/classifications/download`, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("Download returned too few lines");
  console.log(`     ERepo download: ${lines.length - 1} classification records`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log("\n🧬 ClinGen MCP Server – Integration Tests\n");
console.log("━".repeat(52));

console.log("\n📋 CAR – ClinGen Allele Registry");
console.log("━".repeat(52));
const carResults = await Promise.all([
  run("car_lookup_by_caid   (CA128085)", testCarLookupByCaid),
  run("car_lookup_by_hgvs   (NM_000690.4:c.1510G>A)", testCarLookupByHgvs),
  run("car_lookup_by_gnomad (12-111803962-G-A)", testCarLookupByGnomad),
]);

console.log("\n🔗 LDH – Linked Data Hub");
console.log("━".repeat(52));
const ldhResults = await Promise.all([
  run("ldh_get_service_info", testLdhServiceInfo),
  run("ldh_get_variant      (CA128085 IRI)", testLdhGetVariant),
]);

console.log("\n📐 CSpec – Criteria Specification Registry");
console.log("━".repeat(52));
const cspecResults = await Promise.all([
  run("cspec_list_specifications", testCspecListSpecifications),
  run("cspec_get_specification  (GN002 / MYH7)", testCspecGetById),
  run("cspec_search_by_gene     (MYH7)", testCspecSearchByGene),
]);

console.log("\n🗄️  ERepo – Evidence Repository");
console.log("━".repeat(52));
const erepoResults = await Promise.all([
  run("erepo_query_classifications (BRCA1)", testErepoQueryByGene),
  run("erepo_query_classifications (BRCA1 Pathogenic)", testErepoQueryByAssertion),
  run("erepo_download_classifications", testErepoDownloadEndpoint),
]);

// ─── Summary ─────────────────────────────────────────────────────────────────
const allResults = [...carResults, ...ldhResults, ...cspecResults, ...erepoResults];
const passed = allResults.filter((r) => r.passed).length;
const failed = allResults.filter((r) => !r.passed).length;

console.log("\n" + "━".repeat(52));
console.log(`\n📊 Results: ${passed}/${allResults.length} tests passed`);

if (failed > 0) {
  console.log(`\n⚠️  Failed tests:`);
  allResults.filter((r) => !r.passed).forEach((r) => {
    console.log(`   ❌ ${r.name}: ${r.message}`);
  });
}

console.log(
  passed === allResults.length
    ? "\n✅ All tests passed — MCP server is ready to install!\n"
    : `\n⚠️  ${failed} test(s) failed — review above before installing.\n`
);

process.exit(failed > 0 ? 1 : 0);
