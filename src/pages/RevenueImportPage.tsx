import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2,
  XCircle, Loader2, ArrowLeft, Info, DollarSign,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

type ImportMode = 'create_only' | 'update_only' | 'create_and_update';
type Step = 'upload' | 'preview' | 'result';

interface RevenueRow {
  customer_id: string;
  entreprise: string;
  ville: string;
  code_postal: string;
  month: string;
  year: string;
  monthly_revenue: string;
}

interface ValidatedRevenueRow {
  rowIndex: number;
  data: RevenueRow;
  errors: string[];
  matchedCustomerId: string | null;
  matchedCustomerName: string | null;
  isDuplicate: boolean;
}

interface ImportResult {
  matched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  unmatched: number;
}

const COLUMN_MAP: Record<string, keyof RevenueRow> = {
  customer_id: 'customer_id',
  entreprise: 'entreprise',
  ville: 'ville',
  code_postal: 'code_postal',
  month: 'month',
  mois: 'month',
  year: 'year',
  annee: 'year',
  année: 'year',
  monthly_revenue: 'monthly_revenue',
  ca_mensuel: 'monthly_revenue',
  ca: 'monthly_revenue',
  revenue: 'monthly_revenue',
};

function normalizeKey(key: string): keyof RevenueRow | null {
  const k = key.trim().toLowerCase().replace(/\s+/g, '_').replace(/[éè]/g, 'e');
  return COLUMN_MAP[k] || null;
}

function normalizeRow(raw: Record<string, string>): RevenueRow {
  const row: Partial<RevenueRow> = {};
  for (const [key, value] of Object.entries(raw)) {
    const mapped = normalizeKey(key);
    if (mapped) row[mapped] = String(value ?? '').trim();
  }
  return {
    customer_id: row.customer_id || '',
    entreprise: row.entreprise || '',
    ville: row.ville || '',
    code_postal: row.code_postal || '',
    month: row.month || '',
    year: row.year || '',
    monthly_revenue: row.monthly_revenue || '',
  };
}

function generateRevenueTemplate(): Blob {
  const ws = XLSX.utils.aoa_to_sheet([
    ['customer_id', 'entreprise', 'ville', 'code_postal', 'month', 'year', 'monthly_revenue'],
    ['', 'Exemple SARL', 'Paris', '75002', '3', '2025', '4500'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CA Mensuel');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export default function RevenueImportPage() {
  const { user, role } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<ValidatedRevenueRow[]>([]);
  const [mode, setMode] = useState<ImportMode>('create_only');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-for-revenue-import'],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, company_name, city, postal_code');
      return data || [];
    },
  });

  const { data: existingRevenues = [] } = useQuery({
    queryKey: ['existing-revenues-for-import'],
    queryFn: async () => {
      const { data } = await supabase
        .from('monthly_revenues')
        .select('customer_id, month, year');
      return data || [];
    },
  });

  const matchCustomer = useCallback((row: RevenueRow) => {
    // Priority 1: customer_id
    if (row.customer_id) {
      const c = customers.find(c => c.id === row.customer_id);
      if (c) return { id: c.id, name: c.company_name };
    }
    // Priority 2: entreprise + ville
    const byNameCity = customers.find(c =>
      c.company_name.toLowerCase() === row.entreprise.toLowerCase() &&
      (c.city || '').toLowerCase() === row.ville.toLowerCase()
    );
    if (byNameCity) return { id: byNameCity.id, name: byNameCity.company_name };
    // Priority 3: entreprise + ville + code_postal
    if (row.code_postal) {
      const byAll = customers.find(c =>
        c.company_name.toLowerCase() === row.entreprise.toLowerCase() &&
        (c.city || '').toLowerCase() === row.ville.toLowerCase() &&
        (c.postal_code || '') === row.code_postal
      );
      if (byAll) return { id: byAll.id, name: byAll.company_name };
    }
    return null;
  }, [customers]);

  const validateRows = useCallback((parsed: RevenueRow[]): ValidatedRevenueRow[] => {
    return parsed.map((data, i) => {
      const errors: string[] = [];
      const month = parseInt(data.month);
      const year = parseInt(data.year);
      const revenue = parseFloat(data.monthly_revenue);

      if (!data.month) errors.push('Mois manquant');
      else if (isNaN(month) || month < 1 || month > 12) errors.push('Mois invalide (1-12)');

      if (!data.year) errors.push('Année manquante');
      else if (isNaN(year) || year < 2000 || year > 2100) errors.push('Année invalide');

      if (!data.monthly_revenue) errors.push('CA manquant');
      else if (isNaN(revenue) || revenue < 0) errors.push('CA invalide');

      if (!data.customer_id && !data.entreprise) errors.push('Client non identifiable');

      const match = matchCustomer(data);
      if (!match && errors.length === 0) errors.push('Client introuvable');

      const isDuplicate = match ? existingRevenues.some(r =>
        r.customer_id === match.id && r.month === month && r.year === year
      ) : false;

      return {
        rowIndex: i,
        data,
        errors,
        matchedCustomerId: match?.id || null,
        matchedCustomerName: match?.name || null,
        isDuplicate,
      };
    });
  }, [matchCustomer, existingRevenues]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    try {
      let parsed: RevenueRow[];
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
        parsed = result.data.map(normalizeRow);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
        parsed = data.map(normalizeRow);
      } else {
        toast.error('Format non supporté. Utilisez .csv ou .xlsx');
        return;
      }

      if (parsed.length === 0) {
        toast.error('Le fichier est vide ou mal formaté.');
        return;
      }

      setRows(validateRows(parsed));
      setStep('preview');
    } catch {
      toast.error('Erreur lors de la lecture du fichier.');
    }
    e.target.value = '';
  }, [validateRows]);

  const handleDownloadTemplate = () => {
    const blob = generateRevenueTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele_import_ca_mensuel.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!user) return;
    setImporting(true);
    const batchId = crypto.randomUUID();
    const res: ImportResult = { matched: 0, created: 0, updated: 0, skipped: 0, errors: 0, unmatched: 0 };

    for (const row of rows) {
      if (row.errors.length > 0) { res.errors++; continue; }
      if (!row.matchedCustomerId) { res.unmatched++; continue; }

      res.matched++;
      const month = parseInt(row.data.month);
      const year = parseInt(row.data.year);
      const revenue = parseFloat(row.data.monthly_revenue);

      if (mode === 'create_only' && row.isDuplicate) { res.skipped++; continue; }
      if (mode === 'update_only' && !row.isDuplicate) { res.skipped++; continue; }

      try {
        if (row.isDuplicate && (mode === 'update_only' || mode === 'create_and_update')) {
          const { error } = await supabase
            .from('monthly_revenues')
            .update({ monthly_revenue: revenue, imported_by: user.id, import_batch_id: batchId })
            .eq('customer_id', row.matchedCustomerId)
            .eq('month', month)
            .eq('year', year);
          if (error) res.errors++; else res.updated++;
        } else {
          const { error } = await supabase
            .from('monthly_revenues')
            .insert({
              customer_id: row.matchedCustomerId,
              month,
              year,
              monthly_revenue: revenue,
              imported_by: user.id,
              import_batch_id: batchId,
            });
          if (error) res.errors++; else res.created++;
        }
      } catch {
        res.errors++;
      }
    }

    // Log import
    await supabase.from('revenue_import_logs').insert({
      user_id: user.id,
      file_name: fileName,
      rows_matched: res.matched,
      rows_created: res.created,
      rows_updated: res.updated,
      rows_skipped: res.skipped,
      rows_errors: res.errors,
      details: { unmatched: res.unmatched, batch_id: batchId },
    });

    setResult(res);
    setStep('result');
    setImporting(false);
  };

  const errorCount = rows.filter(r => r.errors.length > 0).length;
  const duplicateCount = rows.filter(r => r.isDuplicate).length;
  const validCount = rows.filter(r => r.errors.length === 0 && r.matchedCustomerId).length;
  const unmatchedCount = rows.filter(r => r.errors.length === 0 && !r.matchedCustomerId).length;

  if (role !== 'admin') {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <XCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <h2 className="text-lg font-bold mb-2">Accès refusé</h2>
            <p className="text-sm text-muted-foreground">Cette fonctionnalité est réservée aux administrateurs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

  if (step === 'upload') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="font-heading text-2xl font-bold">Import CA mensuel</h1>
          <p className="text-sm text-muted-foreground">Importez le chiffre d'affaires mensuel par client depuis CSV ou Excel</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-dashed border-2 hover:border-primary/50 transition-colors">
            <CardContent className="p-8 text-center">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">Importer un fichier</h3>
              <p className="text-xs text-muted-foreground mb-4">Formats acceptés : .csv, .xlsx</p>
              <label>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
                <Button asChild variant="default">
                  <span><FileSpreadsheet className="h-4 w-4 mr-2" />Choisir un fichier</span>
                </Button>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-8 text-center">
              <Download className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">Modèle d'import</h3>
              <p className="text-xs text-muted-foreground mb-4">Téléchargez le modèle avec les colonnes attendues</p>
              <Button variant="outline" onClick={handleDownloadTemplate}>
                <Download className="h-4 w-4 mr-2" />Télécharger le modèle
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Colonnes attendues</p>
                <p>customer_id (optionnel), entreprise*, ville*, code_postal, month*, year*, monthly_revenue*</p>
                <p className="text-xs">* champs obligatoires · Correspondance : customer_id {">"} entreprise+ville {">"} entreprise+ville+code_postal</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'preview') {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-heading text-2xl font-bold">Aperçu de l'import CA</h1>
            <p className="text-sm text-muted-foreground">{fileName} · {rows.length} lignes</p>
          </div>
          <Button variant="ghost" onClick={() => { setStep('upload'); setRows([]); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3 text-accent" /> {validCount} valides
          </Badge>
          {errorCount > 0 && (
            <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> {errorCount} erreurs</Badge>
          )}
          {duplicateCount > 0 && (
            <Badge variant="secondary" className="gap-1 bg-warning/15 text-warning">
              <AlertTriangle className="h-3 w-3" /> {duplicateCount} doublons
            </Badge>
          )}
          {unmatchedCount > 0 && (
            <Badge variant="secondary" className="gap-1 bg-destructive/15 text-destructive">
              <XCircle className="h-3 w-3" /> {unmatchedCount} non matchés
            </Badge>
          )}
        </div>

        <Card>
          <CardContent className="p-4 flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium">Mode d'import :</label>
            <Select value={mode} onValueChange={v => setMode(v as ImportMode)}>
              <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="create_only">Créer uniquement les nouveaux</SelectItem>
                <SelectItem value="update_only">Mettre à jour les existants uniquement</SelectItem>
                <SelectItem value="create_and_update">Créer et mettre à jour</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <div className="border rounded-lg overflow-auto max-h-[50vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Entreprise</TableHead>
                <TableHead>Ville</TableHead>
                <TableHead>Mois</TableHead>
                <TableHead>Année</TableHead>
                <TableHead>CA mensuel</TableHead>
                <TableHead>Client trouvé</TableHead>
                <TableHead className="min-w-[200px]">Validation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.rowIndex}
                  className={row.errors.length > 0 ? 'bg-destructive/5' : row.isDuplicate ? 'bg-warning/5' : ''}
                >
                  <TableCell className="text-xs text-muted-foreground">{row.rowIndex + 1}</TableCell>
                  <TableCell className="font-medium text-sm">{row.data.entreprise || row.data.customer_id || '—'}</TableCell>
                  <TableCell className="text-sm">{row.data.ville || '—'}</TableCell>
                  <TableCell className="text-sm">
                    {row.data.month && !isNaN(parseInt(row.data.month)) && parseInt(row.data.month) >= 1 && parseInt(row.data.month) <= 12
                      ? MONTH_LABELS[parseInt(row.data.month) - 1]
                      : row.data.month || '—'}
                  </TableCell>
                  <TableCell className="text-sm">{row.data.year || '—'}</TableCell>
                  <TableCell className="text-sm font-semibold">
                    {!isNaN(parseFloat(row.data.monthly_revenue))
                      ? `${parseFloat(row.data.monthly_revenue).toLocaleString('fr-FR')}€`
                      : row.data.monthly_revenue || '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.matchedCustomerName ? (
                      <span className="text-accent">{row.matchedCustomerName}</span>
                    ) : (
                      <span className="text-destructive">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.errors.length > 0 ? (
                      <div className="space-y-0.5">
                        {row.errors.map((err, j) => (
                          <p key={j} className="text-xs text-destructive flex items-center gap-1">
                            <XCircle className="h-3 w-3 shrink-0" /> {err}
                          </p>
                        ))}
                      </div>
                    ) : row.isDuplicate ? (
                      <p className="text-xs text-warning flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> Doublon existant
                      </p>
                    ) : (
                      <p className="text-xs text-accent flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 shrink-0" /> OK
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setStep('upload'); setRows([]); }}>Annuler</Button>
          <Button onClick={handleImport} disabled={importing || validCount === 0}>
            {importing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Import en cours...</>
            ) : (
              <><DollarSign className="h-4 w-4 mr-2" /> Importer {validCount} lignes</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // RESULT
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-2xl font-bold">Résultat de l'import CA</h1>
        <p className="text-sm text-muted-foreground">{fileName}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Matchés', value: result?.matched || 0, icon: CheckCircle2, color: 'text-primary' },
          { label: 'Créés', value: result?.created || 0, icon: CheckCircle2, color: 'text-accent' },
          { label: 'Mis à jour', value: result?.updated || 0, icon: Info, color: 'text-primary' },
          { label: 'Ignorés', value: result?.skipped || 0, icon: AlertTriangle, color: 'text-warning' },
          { label: 'Non matchés', value: result?.unmatched || 0, icon: XCircle, color: 'text-destructive' },
          { label: 'Erreurs', value: result?.errors || 0, icon: XCircle, color: 'text-destructive' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4 text-center">
              <Icon className={`mx-auto h-6 w-6 ${color} mb-1`} />
              <p className="text-xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => { setStep('upload'); setRows([]); setResult(null); }}>Nouvel import</Button>
        <Button asChild variant="default"><a href="/admin/historique-ca">Voir l'historique</a></Button>
      </div>
    </div>
  );
}
