

# Fix: Register analyze-material-approval in config.toml

## Root Cause
The `analyze-material-approval` edge function is not registered in `supabase/config.toml`. All other functions have `[functions.xxx] verify_jwt = false` entries, but this one is missing. This causes the function to fail because JWT verification is applied by default, and the client call doesn't pass the expected JWT format for function-level verification.

## Verification
- **Edge function code** (`index.ts`): No syntax errors, no missing imports, no undefined variables. Field names (`pdm_base64`, `mqt_base64`, `contract_base64`, `certificates_base64`, `manufacturer_docs_base64`) match exactly between `MaterialApprovals.tsx` and the edge function.
- **Client-side** (`MaterialApprovals.tsx`): Sends correct field names at line 233-244.

## Fix

### 1. Add to `supabase/config.toml`
Append:
```toml
[functions.analyze-material-approval]
verify_jwt = false
```

### 2. Add diagnostic logging to `MaterialApprovals.tsx`
Before the `supabase.functions.invoke` call, add:
```typescript
console.log("PAM: Sending to edge function:", JSON.stringify({
  has_pdm: !!pdmBase64,
  has_mqt: !!mqtBase64,
  has_contract: !!contractBase64,
  certs: certificatesBase64.length,
  mfg_docs: mfgDocsBase64.length,
}));
```

### 3. Redeploy the edge function
After config change, redeploy to pick up the new config.

## Files changed
- `supabase/config.toml` — add function registration
- `src/pages/app/MaterialApprovals.tsx` — add debug logging

