import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const customerId: string = body.customerId;
    const limit: number = Math.min(body.limit || 5, 10);

    if (!customerId) {
      return new Response(JSON.stringify({ error: 'customerId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the latest reports (RLS will limit access)
    const { data: reports, error: reportsError } = await supabase
      .from('visit_reports')
      .select('visit_date, summary, next_actions, quick_outcome, visit_purpose, customer_needs, opportunities_detected, competitor_info, follow_up_date')
      .eq('customer_id', customerId)
      .order('visit_date', { ascending: false })
      .limit(limit);

    if (reportsError) throw reportsError;

    if (!reports || reports.length < 3) {
      return new Response(JSON.stringify({
        error: 'insufficient_data',
        message: "Pas assez de données pour générer une synthèse fiable",
        reports_count: reports?.length || 0,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch customer info for context
    const { data: customer } = await supabase
      .from('customers')
      .select('company_name, city, customer_type, account_status')
      .eq('id', customerId)
      .maybeSingle();

    // Build prompt
    const reportsBlock = reports.map((r, i) => {
      const lines: string[] = [`### Visite ${i + 1} — ${r.visit_date}`];
      if (r.quick_outcome) lines.push(`Résultat: ${r.quick_outcome}`);
      if (r.visit_purpose) lines.push(`Objet: ${r.visit_purpose}`);
      if (r.summary) lines.push(`Résumé: ${r.summary}`);
      if (r.customer_needs) lines.push(`Besoins: ${r.customer_needs}`);
      if (r.opportunities_detected) lines.push(`Opportunités détectées: ${r.opportunities_detected}`);
      if (r.competitor_info) lines.push(`Concurrence: ${r.competitor_info}`);
      if (r.next_actions) lines.push(`Prochaines actions: ${r.next_actions}`);
      if (r.follow_up_date) lines.push(`Relance prévue: ${r.follow_up_date}`);
      return lines.join('\n');
    }).join('\n\n');

    const systemPrompt = `Tu es un assistant commercial spécialisé dans la synthèse de rapports de visite client pour des commerciaux terrain (secteur véhicules industriels).
Ton rôle: aider le commercial à comprendre la situation d'un client en quelques secondes, sans relire tous les rapports.
Sois concis, factuel, et orienté action. Réponds toujours en français.`;

    const userPrompt = `Client: ${customer?.company_name || 'Client'}${customer?.city ? ` (${customer.city})` : ''}
Type: ${customer?.customer_type || 'inconnu'}

Voici les ${reports.length} dernières visites (du plus récent au plus ancien):

${reportsBlock}

Génère une synthèse structurée en utilisant l'outil fourni.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'output_synthesis',
            description: 'Synthèse structurée de la situation client',
            parameters: {
              type: 'object',
              properties: {
                summary: { type: 'string', description: '2 à 3 phrases résumant la situation globale' },
                sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'], description: 'Sentiment global du client' },
                potential: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Potentiel commercial' },
                opportunities: { type: 'string', description: 'Opportunités business détectées (besoins, services, upsell). Liste en bullet points avec - .' },
                risks: { type: 'string', description: 'Risques / blocages (objections, concurrence, retards). Liste en bullet points avec - . Si aucun, retourner vide.' },
                next_actions: { type: 'string', description: 'Actions concrètes recommandées. Liste en bullet points avec - .' },
              },
              required: ['summary', 'sentiment', 'potential', 'opportunities', 'risks', 'next_actions'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'output_synthesis' } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez dans un instant.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'Crédits IA épuisés. Ajoutez des crédits dans Lovable Cloud.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errText);
      throw new Error('AI gateway error');
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error('Aucune synthèse générée');

    const synthesis = JSON.parse(toolCall.function.arguments);

    // Upsert into cache
    const { data: saved, error: saveError } = await supabase
      .from('client_report_syntheses')
      .upsert({
        customer_id: customerId,
        summary: synthesis.summary,
        sentiment: synthesis.sentiment,
        potential: synthesis.potential,
        opportunities: synthesis.opportunities || null,
        risks: synthesis.risks || null,
        next_actions: synthesis.next_actions || null,
        reports_count: reports.length,
        latest_report_date: reports[0].visit_date,
        generated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'customer_id' })
      .select()
      .single();

    if (saveError) {
      console.error('Save error:', saveError);
      // Still return the synthesis even if save fails
    }

    return new Response(JSON.stringify({
      synthesis: saved || {
        ...synthesis,
        reports_count: reports.length,
        latest_report_date: reports[0].visit_date,
        updated_at: new Date().toISOString(),
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('synthesize-client-reports error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
