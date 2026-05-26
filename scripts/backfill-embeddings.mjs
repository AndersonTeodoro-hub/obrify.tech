#!/usr/bin/env node
// Script de backfill — corre localmente com Node.js para vectorizar
// todos os documentos existentes em produção.
//
// Uso (PowerShell):
//   $env:SUPABASE_URL = "https://ufolqxrxiiiygcosucft.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<key>"
//   node scripts/backfill-embeddings.mjs

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

async function fetchDocs() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/eng_silva_project_knowledge?processed=eq.true&select=id,document_name&order=created_at`,
    {
      headers: {
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "apikey": SERVICE_ROLE_KEY,
      },
    }
  );
  if (!res.ok) throw new Error(`Fetch docs failed: ${res.status} - ${await res.text()}`);
  return await res.json();
}

async function embedDoc(knowledge_id) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/embed-document`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ knowledge_id }),
      }
    );
    const body = await res.text();
    return { ok: res.ok, details: body };
  } catch (err) {
    return { ok: false, details: String(err) };
  }
}

async function main() {
  console.log("Fetching documents...");
  const docs = await fetchDocs();
  console.log(`Found ${docs.length} documents to backfill.\n`);

  let success = 0, failed = 0;
  const failures = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const result = await embedDoc(doc.id);

    if (result.ok) {
      success++;
      console.log(`[${i+1}/${docs.length}] ✓ ${doc.document_name}`);
    } else {
      failed++;
      failures.push({ name: doc.document_name, error: result.details.slice(0, 200) });
      console.error(`[${i+1}/${docs.length}] ✗ ${doc.document_name}`);
    }

    // Rate limit defensivo: ~3 docs/segundo
    await new Promise(r => setTimeout(r, 333));
  }

  console.log(`\n========== Backfill complete ==========`);
  console.log(`Success: ${success}`);
  console.log(`Failed:  ${failed}`);

  if (failures.length > 0) {
    console.log(`\nFailures:`);
    for (const f of failures) {
      console.log(`  ✗ ${f.name}: ${f.error}`);
    }
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
