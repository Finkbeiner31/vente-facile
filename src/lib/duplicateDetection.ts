import { supabase } from '@/integrations/supabase/client';

export interface DuplicateCandidate {
  id: string;
  company_name: string;
  city: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  customer_type: string;
  assigned_rep_id: string | null;
  confidence: 'exact' | 'strong' | 'probable';
  matchReasons: string[];
}

function normalizeStr(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizePhone(p: string): string {
  return p.replace(/[\s.\-()]/g, '');
}

function similarityScore(a: string, b: string): number {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  // Simple containment check
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  // Levenshtein-based for short strings
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  let dist = 0;
  const matrix: number[][] = [];
  for (let i = 0; i <= na.length; i++) { matrix[i] = [i]; }
  for (let j = 0; j <= nb.length; j++) { matrix[0][j] = j; }
  for (let i = 1; i <= na.length; i++) {
    for (let j = 1; j <= nb.length; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (na[i - 1] === nb[j - 1] ? 0 : 1)
      );
    }
  }
  dist = matrix[na.length][nb.length];
  return 1 - dist / maxLen;
}

export function detectDuplicates(
  input: { company_name: string; city: string; address?: string; phone?: string; email?: string; postal_code?: string },
  existing: { id: string; company_name: string; city: string | null; address: string | null; phone: string | null; email: string | null; customer_type: string; assigned_rep_id: string | null }[]
): DuplicateCandidate[] {
  const results: DuplicateCandidate[] = [];

  for (const c of existing) {
    const matchReasons: string[] = [];
    let confidence: 'exact' | 'strong' | 'probable' = 'probable';

    // Exact email match
    if (input.email && c.email && normalizeStr(input.email) === normalizeStr(c.email)) {
      matchReasons.push('Email identique');
      confidence = 'exact';
    }

    // Exact phone match
    if (input.phone && c.phone && normalizePhone(input.phone) === normalizePhone(c.phone)) {
      matchReasons.push('Téléphone identique');
      confidence = 'exact';
    }

    // Company name + city
    const nameSim = similarityScore(input.company_name, c.company_name);
    const citySim = input.city && c.city ? similarityScore(input.city, c.city) : 0;

    if (nameSim >= 0.9 && citySim >= 0.9) {
      matchReasons.push('Même entreprise et ville');
      if (nameSim === 1 && citySim === 1) confidence = 'exact';
      else if (confidence !== 'exact') confidence = 'strong';
    }

    // Company name + address
    if (input.address && c.address && nameSim >= 0.8) {
      const addrSim = similarityScore(input.address, c.address);
      if (addrSim >= 0.8) {
        matchReasons.push('Adresse similaire');
        if (nameSim >= 0.95 && addrSim >= 0.95) confidence = 'exact';
        else if (confidence !== 'exact') confidence = 'strong';
      }
    }

    // Weaker: just company name similarity
    if (matchReasons.length === 0 && nameSim >= 0.85) {
      matchReasons.push('Nom d\'entreprise similaire');
    }

    if (matchReasons.length > 0) {
      results.push({
        id: c.id,
        company_name: c.company_name,
        city: c.city || '',
        address: c.address,
        phone: c.phone,
        email: c.email,
        customer_type: c.customer_type,
        assigned_rep_id: c.assigned_rep_id,
        confidence,
        matchReasons,
      });
    }
  }

  // Sort: exact first, then strong, then probable
  const order = { exact: 0, strong: 1, probable: 2 };
  results.sort((a, b) => order[a.confidence] - order[b.confidence]);

  return results;
}

export async function fetchExistingCustomersForDuplicateCheck() {
  const { data, error } = await supabase
    .from('customers')
    .select('id, company_name, city, address, phone, email, customer_type, assigned_rep_id');
  if (error) throw error;
  return (data || []).map(c => ({
    id: c.id,
    company_name: c.company_name,
    city: c.city || '',
    address: c.address || null,
    phone: c.phone || null,
    email: c.email || null,
    customer_type: c.customer_type || 'prospect',
    assigned_rep_id: c.assigned_rep_id || null,
  }));
}
