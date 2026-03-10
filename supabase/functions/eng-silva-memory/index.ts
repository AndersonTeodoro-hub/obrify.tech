import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { action, profile, summary } = await req.json();

    if (action === "load") {
      const { data } = await supabase
        .from("eng_silva_memory")
        .select("profile, conversation_summaries")
        .eq("user_id", user.id)
        .maybeSingle();

      return new Response(JSON.stringify({
        profile: data?.profile || {},
        summaries: data?.conversation_summaries || [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_profile") {
      const { data: existing } = await supabase
        .from("eng_silva_memory")
        .select("id, profile")
        .eq("user_id", user.id)
        .maybeSingle();

      const mergedProfile = { ...(existing?.profile || {}), ...profile };

      if (existing) {
        await supabase
          .from("eng_silva_memory")
          .update({ profile: mergedProfile, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("eng_silva_memory")
          .insert({ user_id: user.id, profile: mergedProfile });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "add_summary") {
      const { data: existing } = await supabase
        .from("eng_silva_memory")
        .select("id, conversation_summaries")
        .eq("user_id", user.id)
        .maybeSingle();

      const summaries = existing?.conversation_summaries || [];
      summaries.push({
        date: new Date().toISOString(),
        summary: summary,
      });
      // Keep only last 10 summaries
      const trimmed = summaries.slice(-10);

      if (existing) {
        await supabase
          .from("eng_silva_memory")
          .update({ conversation_summaries: trimmed, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("eng_silva_memory")
          .insert({ user_id: user.id, conversation_summaries: trimmed });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
