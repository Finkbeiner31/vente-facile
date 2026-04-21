import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADDRESS_FIELDS = [
  "entreprise_address", "entreprise_lat", "entreprise_lng",
  "domicile_address", "domicile_lat", "domicile_lng",
  "autre_address", "autre_lat", "autre_lng",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(JSON.stringify({ error: "Configuration serveur manquante" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const targetUserId = typeof body.user_id === "string" && body.user_id ? body.user_id : caller.id;

    if (targetUserId !== caller.id) {
      const { data: roleCheck } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id)
        .single();

      if (roleCheck?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Accès réservé aux administrateurs pour modifier un autre profil" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const payload = Object.fromEntries(
      ADDRESS_FIELDS
        .filter((field) => body[field] !== undefined)
        .map((field) => [field, body[field]]),
    );

    if (Object.keys(payload).length === 0) {
      return new Response(JSON.stringify({ error: "Aucune adresse à enregistrer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error } = await adminClient
      .from("profiles")
      .update(payload)
      .eq("id", targetUserId)
      .select("entreprise_address, entreprise_lat, entreprise_lng, domicile_address, domicile_lat, domicile_lng, autre_address, autre_lat, autre_lng, full_name")
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ profile }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});