import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Configuration serveur manquante" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const callerClient = createClient(supabaseUrl, anonKey!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (roleCheck?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Accès réservé aux administrateurs" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, action } = await req.json();
    if (!user_id || !action) {
      return new Response(JSON.stringify({ error: "Paramètres manquants" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if target is admin
    const { data: targetRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user_id)
      .single();

    if (targetRole?.role === "admin") {
      return new Response(JSON.stringify({ error: "Impossible de supprimer un administrateur" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reactivate") {
      await supabaseAdmin.from("profiles").update({ is_active: true }).eq("id", user_id);
      return new Response(JSON.stringify({ result: "reactivated" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user has data
    const { count: clientCount } = await supabaseAdmin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("assigned_rep_id", user_id);

    const { count: reportCount } = await supabaseAdmin
      .from("visit_reports")
      .select("id", { count: "exact", head: true })
      .eq("rep_id", user_id);

    const hasData = (clientCount || 0) > 0 || (reportCount || 0) > 0;

    if (action === "delete") {
      if (hasData) {
        // Cannot hard delete — deactivate instead
        await supabaseAdmin.from("profiles").update({ is_active: false }).eq("id", user_id);
        return new Response(JSON.stringify({
          result: "deactivated",
          reason: "Ce profil a des données associées. Il a été désactivé au lieu d'être supprimé.",
          clients: clientCount || 0,
          reports: reportCount || 0,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Safe to hard delete — remove auth user (cascade will handle profile/role)
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ result: "deleted" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "deactivate") {
      await supabaseAdmin.from("profiles").update({ is_active: false }).eq("id", user_id);
      return new Response(JSON.stringify({ result: "deactivated", clients: clientCount || 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Action inconnue" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
