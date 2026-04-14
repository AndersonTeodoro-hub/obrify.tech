import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const ELEMENT_COLORS: Record<string, string> = {
  sapata: "#EF4444",
  pilar: "#3B82F6",
  viga: "#22C55E",
  laje: "#A855F7",
  muro: "#F97316",
  caixa_visita: "#06B6D4",
  generico: "#6B7280",
};

const VALID_TYPES = Object.keys(ELEMENT_COLORS);

const PROMPT = `Analisa esta planta de construção civil e identifica TODOS os elementos estruturais visíveis: sapatas, pilares, vigas de fundação, muros, lajes, caixas de visita, e quaisquer outros elementos identificáveis.

Para cada elemento, retorna a sua posição na imagem como coordenadas percentuais (0.0 a 1.0) relativas ao canto superior esquerdo.

Responde APENAS com JSON (sem markdown, sem backticks):
{
  "elements": [
    { "code": "S1", "type": "sapata", "label": "Sapata S1", "pos_x": 0.15, "pos_y": 0.72, "capture_mode": "mobile", "details": "1.5x1.5m" },
    { "code": "P1", "type": "pilar", "label": "Pilar P1", "pos_x": 0.15, "pos_y": 0.72, "capture_mode": "mobile", "details": "0.30x0.30m" }
  ],
  "summary": "Planta de fundações com X sapatas, Y pilares, Z vigas"
}

Tipos válidos: sapata, pilar, viga, laje, muro, caixa_visita, generico
capture_mode: mobile para pontos acessíveis a pé, drone para vistas aéreas ou zonas difíceis`;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[],
    );
  }
  return btoa(binary);
}

function extractJson(text: string): any {
  // Tenta parse directo
  try {
    return JSON.parse(text);
  } catch (_) {}
  // Remove fences markdown
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {}
  // Procura primeiro bloco { ... }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (_) {}
  }
  throw new Error("Resposta da IA não é JSON válido");
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Variáveis de ambiente em falta");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authToken = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: authError } = await authSupabase.auth.getUser(authToken);
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { floor_plan_file_id, floor_id, site_id, obra_id, user_id } = body;

    if (!floor_plan_file_id || !floor_id) {
      throw new Error("floor_plan_file_id e floor_id são obrigatórios");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Obter registo do project_files
    const { data: fileRow, error: fileErr } = await supabase
      .from("project_files")
      .select("id, file_path, name, mime_type")
      .eq("id", floor_plan_file_id)
      .single();

    if (fileErr || !fileRow) {
      throw new Error(`Ficheiro não encontrado: ${fileErr?.message || ""}`);
    }

    // 2. Descarregar do storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from("project-files")
      .download(fileRow.file_path);

    if (dlErr || !fileData) {
      throw new Error(`Erro ao descarregar planta: ${dlErr?.message || ""}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const mimeType = fileRow.mime_type || "image/png";

    // 3. Construir bloco de imagem ou documento para Claude
    const isPdf = mimeType === "application/pdf" ||
      fileRow.file_path.toLowerCase().endsWith(".pdf");

    const contentBlock = isPdf
      ? {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64,
        },
      }
      : {
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType,
          data: base64,
        },
      };

    // 4. Chamar Claude
    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 8000,
        messages: [
          {
            role: "user",
            content: [
              contentBlock,
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });

    if (!claudeResp.ok) {
      const errText = await claudeResp.text();
      throw new Error(`Claude API erro: ${claudeResp.status} ${errText}`);
    }

    const claudeData = await claudeResp.json();
    const textOut = claudeData?.content?.[0]?.text || "";
    console.log("ENG-SILVA-FLOORPLAN: resposta length", textOut.length);

    // 5. Parse JSON
    const parsed = extractJson(textOut);
    const elements: any[] = Array.isArray(parsed.elements) ? parsed.elements : [];
    const summary: string = parsed.summary || "";

    // 6. Obter área default do floor (capture_points requer area_id)
    const { data: areas } = await supabase
      .from("areas")
      .select("id")
      .eq("floor_id", floor_id)
      .order("name")
      .limit(1);

    let areaId = areas?.[0]?.id;

    if (!areaId) {
      // Criar área default
      const { data: newArea, error: areaErr } = await supabase
        .from("areas")
        .insert({
          floor_id: floor_id,
          site_id: site_id,
          name: "Geral",
        })
        .select("id")
        .single();
      if (areaErr || !newArea) {
        throw new Error(`Sem áreas no piso e impossível criar: ${areaErr?.message || ""}`);
      }
      areaId = newArea.id;
    }

    // 7. Inserir capture_points
    let inserted = 0;
    for (const el of elements) {
      const type = VALID_TYPES.includes(el.type) ? el.type : "generico";
      const color = ELEMENT_COLORS[type];
      const px = typeof el.pos_x === "number" ? el.pos_x : parseFloat(el.pos_x);
      const py = typeof el.pos_y === "number" ? el.pos_y : parseFloat(el.pos_y);
      if (isNaN(px) || isNaN(py)) continue;

      // Coordenadas vêm 0..1, mas o viewer usa 0..100
      const posX = px <= 1 ? px * 100 : px;
      const posY = py <= 1 ? py * 100 : py;

      const { error: insErr } = await supabase
        .from("capture_points")
        .insert({
          area_id: areaId,
          code: String(el.code || "?").slice(0, 32),
          description: el.label || el.details || null,
          element_type: type,
          color,
          pos_x: parseFloat(posX.toFixed(2)),
          pos_y: parseFloat(posY.toFixed(2)),
          point_source: "ai_detected",
        });

      if (insErr) {
        console.error("Erro insert ponto:", insErr.message);
      } else {
        inserted++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        detected: elements.length,
        inserted,
        summary,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    console.error("ENG-SILVA-FLOORPLAN erro:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
