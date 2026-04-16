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
  XCircle, Loader2, ArrowLeft, Info, DollarSign, Eye, Wand2, Edit3, SkipForward,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

type ImportMode = 'create_only' | 'update_only' | 'create_and_update';
type Step = 'upload' | 'mapping' | 'preview' | 'result';

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

interface ImportErrorDetail {
  rowIndex: number;
  entreprise: string;
  ville: string;
  message: string;
}

interface ImportResult {
  matched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  unmatched: number;
  errorDetails: ImportErrorDetail[];
}

interface ColumnMapping {
  customer_id: string;
  entreprise: string;
  ville: string;
  code_postal: string;
  month: string;
  year: string;
  monthly_revenue: string;
}

const NONE = '__none__';

const AUTO_DETECT_MAP: Record<string, keyof ColumnMapping> = {
  customer_id: 'customer_id',
  id_client: 'customer_id',
  entreprise: 'entreprise',
  'raison sociale': 'entreprise',
  société: 'entreprise',
  societe: 'entreprise',
  nom: 'entreprise',
  company: 'entreprise',
  ville: 'ville',
  city: 'ville',
  code_postal: 'code_postal',
  'code postal': 'code_postal',
  cp: 'code_postal',
  zip: 'code_postal',
  postal: 'code_postal',
  month: 'month',
  mois: 'month',
  year: 'year',
  annee: 'year',
  année: 'year',
  monthly_revenue: 'monthly_revenue',
  ca_mensuel: 'monthly_revenue',
  ca: 'monthly_revenue',
  revenue: 'monthly_revenue',
  chiffre_affaires: 'monthly_revenue',
  'chiffre d\'affaires': 'monthly_revenue',
  montant: 'monthly_revenue',
};

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

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
  const [previewTab, setPreviewTab] = useState<'valid' | 'duplicates' | 'errors' | 'unmatched'>('valid');
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [showResultErrors, setShowResultErrors] = useState(false);
  const [showErrorPanel, setShowErrorPanel] = useState(false);
  const [dismissedErrors, setDismissedErrors] = useState(false);

  // Mapping step state
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    customer_id: NONE, entreprise: NONE, ville: NONE, code_postal: NONE,
    month: NONE, year: NONE, monthly_revenue: NONE,
  });

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
    if (row.customer_id) {
      const c = customers.find(c => c.id === row.customer_id);
      if (c) return { id: c.id, name: c.company_name };
    }
    if (row.entreprise) {
      const byNameCity = customers.find(c =>
        c.company_name.toLowerCase() === row.entreprise.toLowerCase() &&
        (c.city || '').toLowerCase() === (row.ville || '').toLowerCase()
      );
      if (byNameCity) return { id: byNameCity.id, name: byNameCity.company_name };
      if (row.code_postal) {
        const byAll = customers.find(c =>
          c.company_name.toLowerCase() === row.entreprise.toLowerCase() &&
          (c.postal_code || '') === row.code_postal
        );
        if (byAll) return { id: byAll.id, name: byAll.company_name };
      }
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

  const processFile = useCallback(async (file: File) => {
    setFileName(file.name);
    try {
      let headers: string[] = [];
      let data: Record<string, string>[] = [];

      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, delimiter: '' });
        headers = result.meta.fields || [];
        data = result.data;
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
        if (jsonData.length > 0) headers = Object.keys(jsonData[0]);
        data = jsonData;
      } else {
        toast.error('Format non supporté. Utilisez .csv ou .xlsx');
        return;
      }

      if (headers.length === 0 || data.length === 0) {
        toast.error('Le fichier est vide ou mal formaté.');
        return;
      }

      setRawHeaders(headers);
      setRawData(data);
      setColumnMapping({
        customer_id: NONE, entreprise: NONE, ville: NONE, code_postal: NONE,
        month: NONE, year: NONE, monthly_revenue: NONE,
      });
      setStep('mapping');
    } catch {
      toast.error('Erreur lors de la lecture du fichier.');
    }
  }, []);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleAutoDetect = () => {
    const newMapping = { ...columnMapping };
    const used = new Set<string>();
    for (const header of rawHeaders) {
      const normalized = header.trim().toLowerCase().replace(/[_\-]/g, ' ').replace(/[éè]/g, 'e');
      const target = AUTO_DETECT_MAP[normalized];
      if (target && newMapping[target] === NONE && !used.has(target)) {
        newMapping[target] = header;
        used.add(target);
      }
    }
    setColumnMapping(newMapping);
    toast.success('Colonnes détectées automatiquement');
  };

  const handleMappingNext = () => {
    if (columnMapping.month === NONE) { toast.error('La colonne "Mois" est obligatoire'); return; }
    if (columnMapping.year === NONE) { toast.error('La colonne "Année" est obligatoire'); return; }
    if (columnMapping.monthly_revenue === NONE) { toast.error('La colonne "CA mensuel" est obligatoire'); return; }
    if (columnMapping.entreprise === NONE && columnMapping.customer_id === NONE) {
      toast.error('Veuillez mapper au moins "Entreprise" ou "ID Client"');
      return;
    }

    const mapped: RevenueRow[] = rawData.map(raw => ({
      customer_id: columnMapping.customer_id !== NONE ? String(raw[columnMapping.customer_id] ?? '').trim() : '',
      entreprise: columnMapping.entreprise !== NONE ? String(raw[columnMapping.entreprise] ?? '').trim() : '',
      ville: columnMapping.ville !== NONE ? String(raw[columnMapping.ville] ?? '').trim() : '',
      code_postal: columnMapping.code_postal !== NONE ? String(raw[columnMapping.code_postal] ?? '').trim() : '',
      month: columnMapping.month !== NONE ? String(raw[columnMapping.month] ?? '').trim() : '',
      year: columnMapping.year !== NONE ? String(raw[columnMapping.year] ?? '').trim() : '',
      monthly_revenue: columnMapping.monthly_revenue !== NONE ? String(raw[columnMapping.monthly_revenue] ?? '').trim() : '',
    }));

    const validated = validateRows(mapped);
    setRows(validated);
    setExcludedRows(new Set());
    setDismissedErrors(false);
    setStep('preview');
  };

  const updateMapping = (field: keyof ColumnMapping, value: string) => {
    setColumnMapping(prev => ({ ...prev, [field]: value }));
  };

  const handleDismissAllErrors = () => {
    const errorIndices = rows.filter(r => r.errors.length > 0).map(r => r.rowIndex);
    setExcludedRows(prev => {
      const next = new Set(prev);
      errorIndices.forEach(i => next.add(i));
      return next;
    });
    setDismissedErrors(true);
    setShowErrorPanel(false);
    toast.info(`${errorIndices.length} lignes invalides ignorées`);
  };

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
    const res: ImportResult = { matched: 0, created: 0, updated: 0, skipped: 0, errors: 0, unmatched: 0, errorDetails: [] };

    for (const row of rows) {
      if (excludedRows.has(row.rowIndex)) { res.skipped++; continue; }
      if (row.errors.length > 0) {
        res.errors++;
        res.errorDetails.push({ rowIndex: row.rowIndex, entreprise: row.data.entreprise || row.data.customer_id, ville: row.data.ville, message: row.errors.join(', ') });
        continue;
      }
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
          if (error) { res.errors++; res.errorDetails.push({ rowIndex: row.rowIndex, entreprise: row.data.entreprise, ville: row.data.ville, message: error.message }); }
          else res.updated++;
        } else {
          const { error } = await supabase
            .from('monthly_revenues')
            .insert({
              customer_id: row.matchedCustomerId,
              month, year, monthly_revenue: revenue,
              imported_by: user.id, import_batch_id: batchId,
            });
          if (error) { res.errors++; res.errorDetails.push({ rowIndex: row.rowIndex, entreprise: row.data.entreprise, ville: row.data.ville, message: error.message }); }
          else res.created++;
        }
      } catch (err: any) {
        res.errors++;
        res.errorDetails.push({ rowIndex: row.rowIndex, entreprise: row.data.entreprise, ville: row.data.ville, message: err?.message || 'Erreur inconnue' });
      }
    }

    await supabase.from('revenue_import_logs').insert({
      user_id: user.id, file_name: fileName,
      rows_matched: res.matched, rows_created: res.created,
      rows_updated: res.updated, rows_skipped: res.skipped,
      rows_errors: res.errors,
      details: { unmatched: res.unmatched, batch_id: batchId },
    });

    setResult(res);
    setStep('result');
    setImporting(false);
    toast.success(`${res.created} créés, ${res.updated} mis à jour, ${res.errors} erreurs`);
  };

  const errorRows = rows.filter(r => r.errors.length > 0);
  const duplicateRows = rows.filter(r => r.isDuplicate && r.errors.length === 0);
  const unmatchedRows = rows.filter(r => r.errors.length === 0 && !r.matchedCustomerId);
  const validRows = rows.filter(r => r.errors.length === 0 && r.matchedCustomerId && !r.isDuplicate);
  const errorCount = errorRows.length;
  const duplicateCount = duplicateRows.length;
  const unmatchedCount = unmatchedRows.length;
  const validCount = validRows.length;
  const importableCount = validCount + duplicateRows.filter(r => !excludedRows.has(r.rowIndex)).length;

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

  // ── UPLOAD STEP ──
  if (step === 'upload') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="font-heading text-2xl font-bold">Import CA mensuel</h1>
          <p className="text-sm text-muted-foreground">Importez le chiffre d'affaires mensuel par client depuis CSV ou Excel</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card
            className={`border-dashed border-2 transition-colors ${dragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragEnter={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <CardContent className="p-8 text-center">
              <Upload className={`mx-auto h-12 w-12 mb-4 transition-colors ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
              <h3 className="font-medium mb-2">{dragging ? 'Déposez le fichier ici' : 'Importer un fichier'}</h3>
              <p className="text-xs text-muted-foreground mb-4">Glissez-déposez ou cliquez · .csv, .xlsx</p>
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
              <p className="text-xs text-muted-foreground mb-4">Téléchargez le modèle Excel avec les colonnes attendues</p>
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
                <p className="text-xs">* champs obligatoires · Correspondance : customer_id {'>'} entreprise+ville {'>'} entreprise+code_postal</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── MAPPING STEP ──
  if (step === 'mapping') {
    const mappingFields: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
      { key: 'customer_id', label: 'ID Client', required: false },
      { key: 'entreprise', label: 'Entreprise', required: false },
      { key: 'ville', label: 'Ville', required: false },
      { key: 'code_postal', label: 'Code postal', required: false },
      { key: 'month', label: 'Mois', required: true },
      { key: 'year', label: 'Année', required: true },
      { key: 'monthly_revenue', label: 'CA mensuel', required: true },
    ];

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-heading text-2xl font-bold">Correspondance des colonnes</h1>
            <p className="text-sm text-muted-foreground">{fileName} · {rawHeaders.length} colonnes détectées · {rawData.length} lignes</p>
          </div>
          <Button variant="ghost" onClick={() => { setStep('upload'); setRawHeaders([]); setRawData([]); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
          </Button>
        </div>

        {/* File preview */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <Eye className="h-4 w-4" /> Aperçu du fichier (3 premières lignes)
            </p>
            <div className="relative w-full overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    {rawHeaders.map(h => (
                      <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rawData.slice(0, 3).map((row, i) => (
                    <TableRow key={i}>
                      {rawHeaders.map(h => (
                        <TableCell key={h} className="whitespace-nowrap text-xs py-2">
                          {String(row[h] ?? '').substring(0, 60) || <span className="text-muted-foreground italic">vide</span>}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Column mapping */}
        <Card>
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Associez les colonnes de votre fichier aux champs attendus</p>
              <Button variant="outline" size="sm" onClick={handleAutoDetect}>
                <Wand2 className="h-4 w-4 mr-1" /> Détecter automatiquement
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mappingFields.map(({ key, label, required }) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-sm">
                    {label} {required && <span className="text-destructive">*</span>}
                  </Label>
                  <Select value={columnMapping[key]} onValueChange={v => updateMapping(key, v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="— Sélectionner —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Non mappé —</SelectItem>
                      {rawHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground mb-2">Colonnes détectées dans le fichier :</p>
              <div className="flex flex-wrap gap-1.5">
                {rawHeaders.map(h => (
                  <Badge key={h} variant="secondary" className="text-xs">{h}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setStep('upload'); setRawHeaders([]); setRawData([]); }}>Annuler</Button>
          <Button onClick={handleMappingNext}>
            <Eye className="h-4 w-4 mr-1" /> Suivant — Aperçu des données
          </Button>
        </div>
      </div>
    );
  }

  // ── PREVIEW STEP ──
  if (step === 'preview') {
    const currentRows = previewTab === 'valid' ? validRows
      : previewTab === 'duplicates' ? duplicateRows
      : previewTab === 'unmatched' ? unmatchedRows
      : errorRows;

    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-heading text-2xl font-bold">Aperçu de l'import CA</h1>
            <p className="text-sm text-muted-foreground">{fileName} · {rows.length} lignes</p>
          </div>
          <Button variant="ghost" onClick={() => { setStep('mapping'); setRows([]); setExcludedRows(new Set()); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour au mapping
          </Button>
        </div>

        {/* Import mode */}
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

        {/* Summary badges */}
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant="secondary" className="gap-1 py-1 px-3">
            <CheckCircle2 className="h-3 w-3" /> {validCount} valides
          </Badge>
          <Badge variant="secondary" className="gap-1 py-1 px-3">
            <AlertTriangle className="h-3 w-3" /> {duplicateCount} doublons
          </Badge>
          {unmatchedCount > 0 && (
            <Badge variant="secondary" className="gap-1 py-1 px-3 bg-destructive/15 text-destructive">
              <XCircle className="h-3 w-3" /> {unmatchedCount} non matchés
            </Badge>
          )}
          {errorCount > 0 && !dismissedErrors && (
            <Badge
              variant="destructive"
              className="gap-1 py-1 px-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setShowErrorPanel(true)}
            >
              <Edit3 className="h-3 w-3" /> {errorCount} invalides — Voir
            </Badge>
          )}
          {dismissedErrors && (
            <Badge variant="outline" className="gap-1 py-1 px-3 text-muted-foreground">
              <XCircle className="h-3 w-3" /> Invalides ignorées
            </Badge>
          )}
        </div>

        <Tabs value={previewTab} onValueChange={v => setPreviewTab(v as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="valid" className="flex-1 text-xs gap-1">
              <CheckCircle2 className="h-3 w-3" /> Valides ({validCount})
            </TabsTrigger>
            <TabsTrigger value="duplicates" className="flex-1 text-xs gap-1">
              <AlertTriangle className="h-3 w-3" /> Doublons ({duplicateCount})
            </TabsTrigger>
            <TabsTrigger value="unmatched" className="flex-1 text-xs gap-1">
              <XCircle className="h-3 w-3" /> Non matchés ({unmatchedCount})
            </TabsTrigger>
            <TabsTrigger value="errors" className="flex-1 text-xs gap-1">
              <XCircle className="h-3 w-3" /> Invalides ({errorCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>

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
                {previewTab === 'duplicates' && <TableHead className="w-[140px]">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentRows.map((row) => (
                <TableRow
                  key={row.rowIndex}
                  className={
                    row.errors.length > 0 ? 'bg-destructive/5' :
                    row.isDuplicate ? (excludedRows.has(row.rowIndex) ? 'bg-muted/50 opacity-50' : 'bg-warning/5') :
                    !row.matchedCustomerId ? 'bg-destructive/5' : ''
                  }
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
                    ) : !row.matchedCustomerId ? (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <XCircle className="h-3 w-3 shrink-0" /> Client introuvable
                      </p>
                    ) : (
                      <p className="text-xs text-accent flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 shrink-0" /> OK
                      </p>
                    )}
                  </TableCell>
                  {previewTab === 'duplicates' && (
                    <TableCell>
                      {excludedRows.has(row.rowIndex) ? (
                        <Button variant="outline" size="sm" className="h-7 text-[10px]"
                          onClick={() => setExcludedRows(prev => { const next = new Set(prev); next.delete(row.rowIndex); return next; })}>
                          Réintégrer
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 text-[10px]"
                          onClick={() => setExcludedRows(prev => new Set(prev).add(row.rowIndex))}>
                          <SkipForward className="h-3 w-3 mr-0.5" /> Ignorer
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {currentRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={previewTab === 'duplicates' ? 9 : 8} className="text-center text-sm text-muted-foreground py-8">
                    Aucune ligne dans cette catégorie
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setStep('upload'); setRows([]); setExcludedRows(new Set()); setRawHeaders([]); setRawData([]); }}>
            Annuler
          </Button>
          <Button onClick={handleImport} disabled={importing || importableCount === 0}>
            {importing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Import en cours...</>
            ) : (
              <><DollarSign className="h-4 w-4 mr-2" /> Importer {importableCount} lignes</>
            )}
          </Button>
        </div>

        {/* Error panel */}
        <Sheet open={showErrorPanel} onOpenChange={setShowErrorPanel}>
          <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                Lignes invalides ({errorCount})
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-3">
              {errorCount > 0 && (
                <Button variant="outline" size="sm"
                  className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={handleDismissAllErrors}>
                  <SkipForward className="h-4 w-4 mr-1" /> Ignorer toutes les invalides
                </Button>
              )}
              {errorRows.map(row => (
                <Card key={row.rowIndex} className="border-destructive/20">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Ligne {row.rowIndex + 1}</span>
                      <div className="flex flex-wrap gap-1">
                        {row.errors.map((err, j) => (
                          <Badge key={j} variant="destructive" className="text-[10px]">{err}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Entreprise:</span> {row.data.entreprise || '—'}</div>
                      <div><span className="text-muted-foreground">Ville:</span> {row.data.ville || '—'}</div>
                      <div><span className="text-muted-foreground">Mois:</span> {row.data.month || '—'}</div>
                      <div><span className="text-muted-foreground">Année:</span> {row.data.year || '—'}</div>
                      <div><span className="text-muted-foreground">CA:</span> {row.data.monthly_revenue || '—'}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // ── RESULT STEP ──
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

      {result && result.errorDetails.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <Button
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => setShowResultErrors(!showResultErrors)}
            >
              <XCircle className="h-4 w-4 mr-2" />
              {showResultErrors ? 'Masquer' : 'Voir'} les {result.errorDetails.length} erreur{result.errorDetails.length > 1 ? 's' : ''}
            </Button>

            {showResultErrors && (
              <div className="relative w-full overflow-x-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Ligne</TableHead>
                      <TableHead className="whitespace-nowrap">Entreprise</TableHead>
                      <TableHead className="whitespace-nowrap">Ville</TableHead>
                      <TableHead className="whitespace-nowrap">Erreur</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.errorDetails.map((err, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{err.rowIndex + 1}</TableCell>
                        <TableCell className="whitespace-nowrap">{err.entreprise || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{err.ville || '—'}</TableCell>
                        <TableCell className="text-destructive text-xs">{err.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => { setStep('upload'); setRows([]); setResult(null); setRawHeaders([]); setRawData([]); }}>
          Nouvel import
        </Button>
        <Button asChild variant="default"><a href="/admin/historique-ca">Voir l'historique</a></Button>
      </div>
    </div>
  );
}
