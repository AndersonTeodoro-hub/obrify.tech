

# Fix: analyze-material-approval Edge Function Robustness

The function code structure is sound but lacks defensive handling for missing/optional parameters. The client-side (`processApproval`) correctly sends `user_id`, `certificates_base64`, and `manufacturer_docs_base64`, but the edge function should handle cases where these are missing or malformed.

## Changes to `supabase/functions/analyze-material-approval/index.ts`

1. **Parse request body with defaults** — destructure with fallback empty arrays for optional fields
2. **Wrap knowledge query in try-catch** — prevent crash if query fails
3. **Add diagnostic logging** at entry point with request shape
4. **Guard against missing `user_id`** — skip knowledge query if no user_id provided
5. **Ensure outer try-catch logs error details clearly**

Specific edits (lines 53-69):

```typescript
const body = await req.json();
const approval_id = body.approval_id;
const pdm_base64 = body.pdm_base64;
const certificates_base64 = body.certificates_base64 || [];
const manufacturer_docs_base64 = body.manufacturer_docs_base64 || [];
const material_category = body.material_category;
const obra_id = body.obra_id;
const user_id = body.user_id;

console.log("PAM: Request received:", JSON.stringify({
  approval_id, obra_id, material_category,
  has_pdm: !!pdm_base64,
  certs: certificates_base64?.length || 0,
  mfg_docs: manufacturer_docs_base64?.length || 0,
  has_user_id: !!user_id,
}));
```

Replace knowledge query (lines 64-69) with try-catch:

```typescript
let knowledge: any[] = [];
try {
  if (obra_id && user_id) {
    const { data } = await supabase
      .from("eng_silva_project_knowledge")
      .select("document_name, specialty, summary, key_elements")
      .eq("obra_id", obra_id)
      .eq("user_id", user_id)
      .eq("processed", true);
    knowledge = data || [];
  }
} catch (err) {
  console.error("PAM: Knowledge load failed:", err);
}
```

Then use `knowledge` variable (already an array) in the existing context-building loop — just change `if (knowledge &&` to `if (knowledge.length > 0)`.

No changes needed to the client-side code — it already sends all required fields correctly.

