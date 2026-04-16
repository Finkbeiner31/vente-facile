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
  XCircle, Loader2, ArrowLeft, Info, Eye, SkipForward, Wand2, Edit3, X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  parseCSV, parseXLSX, validateRows, generateTemplate,
  type ImportRow, type ValidatedRow,
} from '@/lib/importUtils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type ImportMode = 'create_only' | 'update_only' | 'create_and_update';
type Step = 'upload' | 'mapping' | 'preview' | 'result';
type StatutMode = 'all_active' | 'all_prospect' | 'map_column';

interface ColumnMapping {
  entreprise: string;
  ville: string;
  statut: string;
  code_postal: string;
  telephone: string;
  email: string;
}

interface ImportErrorDetail {
  rowIndex: number;
  entreprise: string;
  ville: string;
  message: string;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  errorDetails: ImportErrorDetail[];
  zoneAssigned: number;
}

const NONE = '__none__';

const AUTO_DETECT_MAP: Record<string, keyof ColumnMapping> = {
  'raison sociale': 'entreprise',
  'entreprise': 'entreprise',
  'société': 'entreprise',
  'societe': 'entreprise',
  'nom': 'entreprise',
  'company': 'entreprise',
  'ville': 'ville',
  'city': 'ville',
  'statut': 'statut',
  'status': 'statut',
  'code postal': 'code_postal',
  'code_postal': 'code_postal',
  'cp': 'code_postal',
  'zip': 'code_postal',
  'postal': 'code_postal',
  'téléphone': 'telephone',
  'telephone': 'telephone',
  'tél': 'telephone',
  'tel': 'telephone',
  'gsm': 'telephone',
  'mobile': 'telephone',
  'phone': 'telephone',
  'email': 'email',
  'e-mail': 'email',
  'mail': 'email',
  'courriel': 'email',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (raw: string): string | null => {
  const first = raw.split(/[;,]/)[0].trim();
  return first && EMAIL_RE.test(first) ? first : null;
};

const splitName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { first_name: parts[0] || '', last_name: '' };
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts[parts.length - 1] };
};

export default function BulkImportPage() {
  const { user, role } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<ValidatedRow[]>([]);
  const [mode, setMode] = useState<ImportMode>('create_only');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [previewTab, setPreviewTab] = useState<'new' | 'duplicates' | 'errors'>('new');
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [showResultErrors, setShowResultErrors] = useState(false);

  // Mapping step state
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    entreprise: NONE, ville: NONE, statut: NONE, code_postal: NONE, telephone: NONE, email: NONE,
  });
  const [statutMode, setStatutMode] = useState<StatutMode>('all_active');
  const [showErrorPanel, setShowErrorPanel] = useState(false);
  const [errorEdits, setErrorEdits] = useState<Record<number, { entreprise: string; ville: string }>>({});
  const [dismissedErrors, setDismissedErrors] = useState(false);

  const { data: existingCustomers = [] } = useQuery({
    queryKey: ['customers-for-import'],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, company_name, city, phone, email');
      return (data || []).map(c => ({
        id: c.id,
        company_name: c.company_name,
        city: c.city || '',
        phone: c.phone || '',
        email: c.email || '',
      }));
    },
  });

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
        if (jsonData.length > 0) {
          headers = Object.keys(jsonData[0]);
        }
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
      setColumnMapping({ entreprise: NONE, ville: NONE, statut: NONE, code_postal: NONE, telephone: NONE, email: NONE });
      setStatutMode('all_active');
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
      const normalized = header.trim().toLowerCase().replace(/[_\-]/g, ' ').replace(/é/g, 'e');
      const target = AUTO_DETECT_MAP[normalized];
      if (target && newMapping[target] === NONE && !used.has(target)) {
        newMapping[target] = header;
        used.add(target);
      }
    }

    setColumnMapping(newMapping);
    if (newMapping.statut !== NONE) {
      setStatutMode('map_column');
    }
    toast.success('Colonnes détectées automatiquement');
  };

  const handleMappingNext = () => {
    if (columnMapping.entreprise === NONE) {
      toast.error('La colonne "Entreprise" est obligatoire');
      return;
    }
    if (columnMapping.ville === NONE) {
      toast.error('La colonne "Ville" est obligatoire');
      return;
    }

    // Transform raw data using the mapping
    const mapped: ImportRow[] = rawData.map(raw => {
      let statut = '';
      if (statutMode === 'all_active') statut = 'client_actif';
      else if (statutMode === 'all_prospect') statut = 'prospect';
      else if (statutMode === 'map_column' && columnMapping.statut !== NONE) statut = String(raw[columnMapping.statut] ?? '').trim();

      return {
        statut,
        entreprise: columnMapping.entreprise !== NONE ? String(raw[columnMapping.entreprise] ?? '').trim() : '',
        adresse: '',
        code_postal: columnMapping.code_postal !== NONE ? String(raw[columnMapping.code_postal] ?? '').trim() : '',
        ville: columnMapping.ville !== NONE ? String(raw[columnMapping.ville] ?? '').trim() : '',
        nb_vehicules: '',
        frequence_visite: '',
        contact_principal: '',
        telephone: columnMapping.telephone !== NONE ? String(raw[columnMapping.telephone] ?? '').trim() : '',
        email: columnMapping.email !== NONE ? String(raw[columnMapping.email] ?? '').trim() : '',
        notes: '',
        commercial_assigne: '',
        zone: '',
      };
    });

    const validated = validateRows(mapped, existingCustomers);
    setRows(validated);
    setStep('preview');
  };

  const updateMapping = (field: keyof ColumnMapping, value: string) => {
    setColumnMapping(prev => ({ ...prev, [field]: value }));
  };

  const handleFixRow = (rowIndex: number) => {
    const edit = errorEdits[rowIndex];
    if (!edit) return;
    setRows(prev => prev.map(r => {
      if (r.rowIndex !== rowIndex) return r;
      const newData = { ...r.data };
      if (edit.entreprise) newData.entreprise = edit.entreprise;
      if (edit.ville) newData.ville = edit.ville;
      // Re-validate this single row
      const errors: string[] = [];
      if (!newData.entreprise) errors.push('Entreprise manquante');
      if (!newData.ville) errors.push('Ville manquante');
      return { ...r, data: newData, errors };
    }));
    setErrorEdits(prev => { const n = { ...prev }; delete n[rowIndex]; return n; });
    toast.success(`Ligne ${rowIndex + 1} corrigée`);
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
    const blob = generateTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele_import_clients.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!user) return;
    setImporting(true);
    const res: ImportResult = { created: 0, updated: 0, skipped: 0, errors: 0, errorDetails: [], zoneAssigned: 0 };

    for (const row of rows) {
      if (row.errors.length > 0) { res.errors++; res.errorDetails.push({ rowIndex: row.rowIndex, entreprise: row.data.entreprise, ville: row.data.ville, message: row.errors.join(', ') }); continue; }
      if (excludedRows.has(row.rowIndex)) { res.skipped++; continue; }

      const d = row.data;
      const companyName = d.entreprise.trim();
      const city = d.ville.trim();

      if (!companyName || !city) { res.errors++; res.errorDetails.push({ rowIndex: row.rowIndex, entreprise: companyName || '(vide)', ville: city || '(vide)', message: 'Entreprise ou ville manquante' }); continue; }

      try {
        // Real-time duplicate check against DB
        const { data: existingMatch } = await supabase
          .from('customers')
          .select('id')
          .ilike('company_name', companyName)
          .ilike('city', city)
          .maybeSingle();

        if (existingMatch) {
          if (mode === 'create_only') { res.skipped++; continue; }
          if (mode === 'update_only' || mode === 'create_and_update') {
            const { error } = await supabase
              .from('customers')
              .update({
                postal_code: d.code_postal.trim() || null,
                phone: d.telephone.trim() || null,
                email: cleanEmail(d.email),
                customer_type: d.statut.toLowerCase(),
              })
              .eq('id', existingMatch.id);
            if (error) { res.errors++; res.errorDetails.push({ rowIndex: row.rowIndex, entreprise: companyName, ville: city, message: error.message }); } else { res.updated++; }
            continue;
          }
        }

        if (mode === 'update_only') { res.skipped++; continue; }

        // Insert new customer
        const { error } = await supabase
          .from('customers')
          .insert({
            company_name: companyName,
            city,
            postal_code: d.code_postal.trim() || null,
            phone: d.telephone.trim() || null,
            email: cleanEmail(d.email),
            customer_type: d.statut.toLowerCase(),
            account_status: 'active',
            assigned_rep_id: user.id,
            visit_frequency: 'mensuelle',
          });

        if (error) { res.errors++; res.errorDetails.push({ rowIndex: row.rowIndex, entreprise: companyName, ville: city, message: error.message }); } else { res.created++; }
      } catch (err: any) {
        res.errors++;
        res.errorDetails.push({ rowIndex: row.rowIndex, entreprise: d.entreprise, ville: d.ville, message: err?.message || 'Erreur inconnue' });
      }
    }

    // ── Zone recalculation for imported clients ──
    try {
      const { data: allZones } = await (supabase as any)
        .from('commercial_zones')
        .select('*');
      const zonesParsed = (allZones || []).map((z: any) => ({
        ...z,
        cities: z.cities || [],
        postal_codes: z.postal_codes || [],
        polygon_coordinates: z.polygon_coordinates || null,
      }));

      if (zonesParsed.length > 0) {
        // Fetch freshly imported clients (by current user, created recently)
        const { data: importedClients } = await supabase
          .from('customers')
          .select('id, latitude, longitude, postal_code, city, assignment_mode, zone')
          .eq('assigned_rep_id', user.id)
          .is('zone', null);

        for (const c of importedClients || []) {
          const result = computeZoneAssignment(c, zonesParsed);
          if (result.zone) {
            await (supabase as any).from('customers').update({
              zone: result.zone,
              assignment_mode: 'automatic',
              assignment_source: result.assignment_source,
              zone_status: result.zone_status,
            }).eq('id', c.id);
            res.zoneAssigned++;
          }
        }
      }
    } catch (err) {
      console.error('Zone recalculation error:', err);
    }

    setResult(res);
    setStep('result');
    setImporting(false);
    toast.success(`${res.created} clients importés, ${res.skipped} doublons ignorés, ${res.errors} erreurs`);
  };

  const errorRows = rows.filter(r => r.errors.length > 0);
  const duplicateRows = rows.filter(r => r.isDuplicate && r.errors.length === 0);
  const newRows = rows.filter(r => !r.isDuplicate && r.errors.length === 0);
  const errorCount = errorRows.length;
  const duplicateCount = duplicateRows.length;
  const newCount = newRows.length;
  const importableCount = newCount + duplicateRows.filter(r => !excludedRows.has(r.rowIndex)).length;

  if (role !== 'admin') {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <XCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <h2 className="text-lg font-bold mb-2">Accès refusé</h2>
            <p className="text-sm text-muted-foreground">
              Cette fonctionnalité est réservée aux administrateurs.
            </p>
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
          <h1 className="font-heading text-2xl font-bold">Import clients / prospects</h1>
          <p className="text-sm text-muted-foreground">Importez en masse depuis un fichier CSV ou Excel</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card
            className={`border-dashed border-2 transition-colors ${
              dragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
            }`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragEnter={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <CardContent className="p-8 text-center">
              <Upload className={`mx-auto h-12 w-12 mb-4 transition-colors ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
              <h3 className="font-medium mb-2">{dragging ? 'Déposez le fichier ici' : 'Importer un fichier'}</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Glissez-déposez ou cliquez · .csv, .xlsx
              </p>
              <label>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFile}
                  className="hidden"
                />
                <Button asChild variant="default">
                  <span>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Choisir un fichier
                  </span>
                </Button>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-8 text-center">
              <Download className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">Modèle d'import</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Téléchargez le modèle Excel avec les colonnes attendues
              </p>
              <Button variant="outline" onClick={handleDownloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Télécharger le modèle
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
                <p>statut*, entreprise*, ville*, adresse, code_postal, nb_vehicules, frequence_visite, contact_principal, telephone, email, notes, commercial_assigne, zone</p>
                <p className="text-xs">* champs obligatoires</p>
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
      { key: 'entreprise', label: 'Entreprise', required: true },
      { key: 'ville', label: 'Ville', required: true },
      { key: 'code_postal', label: 'Code postal', required: false },
      { key: 'telephone', label: 'Téléphone', required: false },
      { key: 'email', label: 'Email', required: false },
    ];

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-heading text-2xl font-bold">Correspondance des colonnes</h1>
            <p className="text-sm text-muted-foreground">
              {fileName} · {rawHeaders.length} colonnes détectées · {rawData.length} lignes
            </p>
          </div>
          <Button variant="ghost" onClick={() => { setStep('upload'); setRawHeaders([]); setRawData([]); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
          </Button>
        </div>

        {/* Aperçu des 3 premières lignes */}
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

        <Card>
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Associez les colonnes de votre fichier aux champs attendus</p>
              <Button variant="outline" size="sm" onClick={handleAutoDetect}>
                <Wand2 className="h-4 w-4 mr-1" /> Détecter automatiquement
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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

            {/* Statut special handling */}
            <div className="space-y-2 border-t pt-4">
              <Label className="text-sm font-medium">Statut</Label>
              <RadioGroup value={statutMode} onValueChange={v => setStatutMode(v as StatutMode)} className="space-y-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all_active" id="stat_active" />
                  <Label htmlFor="stat_active" className="text-sm font-normal cursor-pointer">Tous clients actifs</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all_prospect" id="stat_prospect" />
                  <Label htmlFor="stat_prospect" className="text-sm font-normal cursor-pointer">Tous prospects</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="map_column" id="stat_map" />
                  <Label htmlFor="stat_map" className="text-sm font-normal cursor-pointer">Mapper une colonne</Label>
                </div>
              </RadioGroup>
              {statutMode === 'map_column' && (
                <Select value={columnMapping.statut} onValueChange={v => updateMapping('statut', v)}>
                  <SelectTrigger className="mt-1 w-full sm:w-[300px]">
                    <SelectValue placeholder="— Sélectionner la colonne statut —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Non mappé —</SelectItem>
                    {rawHeaders.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Preview of detected columns */}
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
          <Button variant="outline" onClick={() => { setStep('upload'); setRawHeaders([]); setRawData([]); }}>
            Annuler
          </Button>
          <Button onClick={handleMappingNext}>
            <Eye className="h-4 w-4 mr-1" /> Suivant — Aperçu des données
          </Button>
        </div>
      </div>
    );
  }

  // ── PREVIEW STEP ──
  if (step === 'preview') {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-heading text-2xl font-bold">Aperçu de l'import</h1>
            <p className="text-sm text-muted-foreground">{fileName} · {rows.length} lignes détectées</p>
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
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create_only">Créer uniquement les nouveaux</SelectItem>
                <SelectItem value="update_only">Mettre à jour les existants uniquement</SelectItem>
                <SelectItem value="create_and_update">Créer et mettre à jour</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Summary badges - error badge is clickable */}
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant="secondary" className="gap-1 py-1 px-3">
            <CheckCircle2 className="h-3 w-3" /> {newCount} nouveaux
          </Badge>
          <Badge variant="secondary" className="gap-1 py-1 px-3">
            <AlertTriangle className="h-3 w-3" /> {duplicateCount} doublons
          </Badge>
          {errorCount > 0 && !dismissedErrors && (
            <Badge
              variant="destructive"
              className="gap-1 py-1 px-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setShowErrorPanel(true)}
            >
              <Edit3 className="h-3 w-3" /> {errorCount} invalides — Corriger
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
            <TabsTrigger value="new" className="flex-1 text-xs gap-1">
              <CheckCircle2 className="h-3 w-3" /> Nouveaux ({newCount})
            </TabsTrigger>
            <TabsTrigger value="duplicates" className="flex-1 text-xs gap-1">
              <AlertTriangle className="h-3 w-3" /> Doublons ({duplicateCount})
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
                <TableHead>Statut</TableHead>
                <TableHead>Entreprise</TableHead>
                <TableHead>Ville</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="min-w-[200px]">Validation</TableHead>
                {previewTab === 'duplicates' && <TableHead className="w-[140px]">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(previewTab === 'new' ? newRows : previewTab === 'duplicates' ? duplicateRows : errorRows).map((row) => (
                <TableRow
                  key={row.rowIndex}
                  className={`${
                    row.errors.length > 0 ? 'bg-destructive/5' :
                    row.isDuplicate ? (excludedRows.has(row.rowIndex) ? 'bg-muted/50 opacity-50' : 'bg-warning/5') : ''
                  }`}
                >
                  <TableCell className="text-xs text-muted-foreground">{row.rowIndex + 1}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">{row.data.statut || '—'}</Badge>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{row.data.entreprise || '—'}</TableCell>
                  <TableCell className="text-sm">{row.data.ville || '—'}</TableCell>
                  <TableCell className="text-sm">{row.data.telephone || '—'}</TableCell>
                  <TableCell className="text-sm">{row.data.email || '—'}</TableCell>
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
                        <AlertTriangle className="h-3 w-3 shrink-0" /> {row.duplicateOf}
                      </p>
                    ) : (
                      <p className="text-xs text-accent flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 shrink-0" /> Prêt
                      </p>
                    )}
                  </TableCell>
                  {previewTab === 'duplicates' && (
                    <TableCell>
                      <div className="flex gap-1">
                        {excludedRows.has(row.rowIndex) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px]"
                            onClick={() => setExcludedRows(prev => { const next = new Set(prev); next.delete(row.rowIndex); return next; })}
                          >
                            Réintégrer
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[10px]"
                            onClick={() => setExcludedRows(prev => new Set(prev).add(row.rowIndex))}
                          >
                            <SkipForward className="h-3 w-3 mr-0.5" /> Ignorer
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {(previewTab === 'new' ? newRows : previewTab === 'duplicates' ? duplicateRows : errorRows).length === 0 && (
                <TableRow>
                  <TableCell colSpan={previewTab === 'duplicates' ? 8 : 7} className="text-center text-sm text-muted-foreground py-8">
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
              <><Upload className="h-4 w-4 mr-2" /> Importer {importableCount} lignes</>
            )}
          </Button>
        </div>

        {/* Error correction Sheet */}
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
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={handleDismissAllErrors}
                >
                  <SkipForward className="h-4 w-4 mr-1" /> Ignorer toutes les invalides
                </Button>
              )}
              {errorRows.map(row => (
                <Card key={row.rowIndex} className="border-destructive/20">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Ligne {row.rowIndex + 1}</span>
                      <div className="flex flex-wrap gap-1">
                        {row.errors.map((err, j) => (
                          <Badge key={j} variant="destructive" className="text-[10px]">{err}</Badge>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Statut:</span> {row.data.statut || '—'}</div>
                      <div><span className="text-muted-foreground">Tél:</span> {row.data.telephone || '—'}</div>
                      <div><span className="text-muted-foreground">Email:</span> {row.data.email || '—'}</div>
                      <div><span className="text-muted-foreground">CP:</span> {row.data.code_postal || '—'}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Entreprise <span className="text-destructive">*</span></Label>
                        <Input
                          className="h-8 text-sm"
                          placeholder="Nom de l'entreprise"
                          defaultValue={row.data.entreprise}
                          onChange={e => setErrorEdits(prev => ({
                            ...prev,
                            [row.rowIndex]: { ...prev[row.rowIndex], entreprise: e.target.value, ville: prev[row.rowIndex]?.ville ?? row.data.ville }
                          }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Ville <span className="text-destructive">*</span></Label>
                        <Input
                          className="h-8 text-sm"
                          placeholder="Ville"
                          defaultValue={row.data.ville}
                          onChange={e => setErrorEdits(prev => ({
                            ...prev,
                            [row.rowIndex]: { ...prev[row.rowIndex], ville: e.target.value, entreprise: prev[row.rowIndex]?.entreprise ?? row.data.entreprise }
                          }))}
                        />
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="w-full h-8"
                      disabled={
                        !(errorEdits[row.rowIndex]?.entreprise || row.data.entreprise) ||
                        !(errorEdits[row.rowIndex]?.ville || row.data.ville)
                      }
                      onClick={() => handleFixRow(row.rowIndex)}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Valider
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {errorRows.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-accent mb-2" />
                  Toutes les lignes sont valides !
                </div>
              )}
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
        <h1 className="font-heading text-2xl font-bold">Résultat de l'import</h1>
        <p className="text-sm text-muted-foreground">{fileName}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-5 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-accent mb-2" />
            <p className="text-2xl font-bold">{result?.created || 0}</p>
            <p className="text-xs text-muted-foreground">Créés</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <Info className="mx-auto h-8 w-8 text-primary mb-2" />
            <p className="text-2xl font-bold">{result?.updated || 0}</p>
            <p className="text-xs text-muted-foreground">Mis à jour</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-warning mb-2" />
            <p className="text-2xl font-bold">{result?.skipped || 0}</p>
            <p className="text-xs text-muted-foreground">Ignorés</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <XCircle className="mx-auto h-8 w-8 text-destructive mb-2" />
            <p className="text-2xl font-bold">{result?.errors || 0}</p>
            <p className="text-xs text-muted-foreground">Erreurs</p>
          </CardContent>
        </Card>
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
        <Button asChild variant="default">
          <a href="/clients">Voir les clients</a>
        </Button>
      </div>
    </div>
  );
}
