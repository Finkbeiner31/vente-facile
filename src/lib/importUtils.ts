import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface ImportRow {
  statut: string;
  entreprise: string;
  adresse: string;
  code_postal: string;
  ville: string;
  nb_vehicules: string;
  frequence_visite: string;
  contact_principal: string;
  telephone: string;
  email: string;
  notes: string;
  commercial_assigne: string;
  zone: string;
}

export interface ValidatedRow {
  rowIndex: number;
  data: ImportRow;
  errors: string[];
  isDuplicate: boolean;
  duplicateOf?: string;
}

const VALID_STATUTS = ['prospect', 'client_actif', 'client_inactif'];
const VALID_FREQUENCIES = ['hebdomadaire', 'bimensuelle', 'mensuelle', 'trimestrielle', 'semestrielle', 'annuelle', ''];

const COLUMN_MAP: Record<string, keyof ImportRow> = {
  statut: 'statut',
  entreprise: 'entreprise',
  adresse: 'adresse',
  code_postal: 'code_postal',
  ville: 'ville',
  nb_vehicules: 'nb_vehicules',
  frequence_visite: 'frequence_visite',
  contact_principal: 'contact_principal',
  telephone: 'telephone',
  email: 'email',
  notes: 'notes',
  commercial_assigne: 'commercial_assigne',
  zone: 'zone',
};

function normalizeKey(key: string): keyof ImportRow | null {
  const k = key.trim().toLowerCase().replace(/\s+/g, '_').replace(/é/g, 'e');
  return COLUMN_MAP[k] || null;
}

function normalizeRow(raw: Record<string, string>): ImportRow {
  const row: Partial<ImportRow> = {};
  for (const [key, value] of Object.entries(raw)) {
    const mapped = normalizeKey(key);
    if (mapped) row[mapped] = String(value ?? '').trim();
  }
  return {
    statut: row.statut || '',
    entreprise: row.entreprise || '',
    adresse: row.adresse || '',
    code_postal: row.code_postal || '',
    ville: row.ville || '',
    nb_vehicules: row.nb_vehicules || '',
    frequence_visite: row.frequence_visite || '',
    contact_principal: row.contact_principal || '',
    telephone: row.telephone || '',
    email: row.email || '',
    notes: row.notes || '',
    commercial_assigne: row.commercial_assigne || '',
    zone: row.zone || '',
  };
}

export function parseCSV(text: string): ImportRow[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: '',
  });
  return result.data.map(normalizeRow);
}

export function parseXLSX(buffer: ArrayBuffer): ImportRow[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
  return data.map(normalizeRow);
}

export function validateRows(
  rows: ImportRow[],
  existingCustomers: { company_name: string; city: string; phone: string; email: string }[]
): ValidatedRow[] {
  const seen = new Map<string, number>();

  return rows.map((data, i) => {
    const errors: string[] = [];
    let isDuplicate = false;
    let duplicateOf: string | undefined;

    // Required fields
    if (!data.entreprise) errors.push('Entreprise manquante');
    if (!data.ville) errors.push('Ville manquante');
    if (!data.statut) {
      errors.push('Statut manquant');
    } else if (!VALID_STATUTS.includes(data.statut.toLowerCase())) {
      errors.push(`Statut invalide: "${data.statut}"`);
    }

    // Number validation
    if (data.nb_vehicules && isNaN(Number(data.nb_vehicules))) {
      errors.push('Nb véhicules: format invalide');
    }

    // Frequency validation
    if (data.frequence_visite && !VALID_FREQUENCIES.includes(data.frequence_visite.toLowerCase())) {
      errors.push(`Fréquence invalide: "${data.frequence_visite}"`);
    }

    // Email validation
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push('Email invalide');
    }

    // Duplicate detection within file
    const key = `${data.entreprise.toLowerCase()}|${data.ville.toLowerCase()}`;
    if (data.entreprise && data.ville) {
      if (seen.has(key)) {
        isDuplicate = true;
        duplicateOf = `Ligne ${seen.get(key)! + 1} du fichier`;
      } else {
        seen.set(key, i);
      }
    }

    // Duplicate detection against existing DB
    if (!isDuplicate && data.entreprise) {
      const match = existingCustomers.find(c => {
        if (c.company_name.toLowerCase() === data.entreprise.toLowerCase() &&
            (c.city || '').toLowerCase() === data.ville.toLowerCase()) return true;
        if (data.email && c.email && c.email.toLowerCase() === data.email.toLowerCase()) return true;
        if (data.telephone && c.phone && c.phone.replace(/\s/g, '') === data.telephone.replace(/\s/g, '')) return true;
        return false;
      });
      if (match) {
        isDuplicate = true;
        duplicateOf = `"${match.company_name}" existant en base`;
      }
    }

    return { rowIndex: i, data, errors, isDuplicate, duplicateOf };
  });
}

export function generateTemplate(): Blob {
  const ws = XLSX.utils.aoa_to_sheet([
    ['statut', 'entreprise', 'adresse', 'code_postal', 'ville', 'nb_vehicules', 'frequence_visite', 'contact_principal', 'telephone', 'email', 'notes', 'commercial_assigne', 'zone'],
    ['prospect', 'Exemple SARL', '12 rue de la Paix', '75002', 'Paris', '5', 'mensuelle', 'Jean Dupont', '0612345678', 'jean@exemple.fr', 'Note exemple', '', ''],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
