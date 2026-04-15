import { useState, useCallback, useRef, DragEvent } from 'react';
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
  XCircle, Loader2, ArrowLeft, ArrowRight, Info, Wand2,
} from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { generateTemplate } from '@/lib/importUtils';

type Step = 'upload' | 'mapping' | 'preview' | 'result';
type StatutMode = 'column' | 'client_actif' | 'prospect';

interface CrmField {
  key: string;
  label: string;
  required: boolean;
  hint?: string;
}

const CRM_FIELDS: CrmField[] = [
  { key: 'entreprise', label: 'Entreprise', required: true },
  { key: 'ville', label: 'Ville', required: true },
  { key: 'statut', label: 'Statut', required: true, hint: 'client_actif ou prospect' },
  { key: 'code_postal', label: 'Code postal', required: false },
  { key: 'telephone', label: 'Téléphone', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'metier', label: 'Métier', required: false, hint: 'ATELIER / NEGOCE / MIXTE / AUTRE' },
  { key: 'nb_vehicules', label: 'Nombre de véhicules', required: false },
  { key: 'potentiel', label: 'Potentiel commercial', required: false, hint: 'A / B / C' },
  { key: 'commercial_code', label: 'Code commercial', required: false, hint: 'COM01 / COM02 / COM03 / COM04' },
  { key: 'adresse', label: 'Adresse', required: false },
  { key: 'siret', label: 'SIRET', required: false },
  { key: 'contact_nom', label: 'Contact principal', required: false },
  { key: 'notes', label: 'Notes', required: false },
];

// Auto-detect mapping aliases
const ALIASES: Record<string, string[]> = {
  entreprise: ['entreprise', 'raison sociale', 'raison_sociale', 'societe', 'société', 'nom', 'company', 'company_name', 'nom_entreprise'],
  ville: ['ville', 'city', 'commune', 'localite', 'localité'],
  statut: ['statut', 'status', 'type', 'type_client', 'customer_type'],
  code_postal: ['code_postal', 'code postal', 'cp', 'postal_code', 'zip', 'zipcode', 'codepostal'],
  telephone: ['telephone', 'téléphone', 'tel', 'tél', 'phone', 'tel1', 'tel_1', 'mobile', 'portable'],
  email: ['email', 'e-mail', 'mail', 'courriel', 'adresse_email'],
  metier: ['metier', 'métier', 'activite', 'activité', 'type_activite', 'activity', 'activity_type', 'secteur'],
  nb_vehicules: ['nb_vehicules', 'nb vehicules', 'vehicules', 'véhicules', 'nombre_vehicules', 'nb_vh', 'flotte', 'fleet', 'vehicles'],
  potentiel: ['potentiel', 'potential', 'sales_potential', 'niveau', 'categorie', 'catégorie'],
  commercial_code: ['commercial_code', 'commercial', 'code_commercial', 'rep', 'rep_code', 'vendeur', 'assigned'],
  adresse: ['adresse', 'address', 'rue', 'adresse_complete', 'street'],
  siret: ['siret', 'siren', 'siret_number', 'n_siret', 'numero_siret'],
  contact_nom: ['contact_nom', 'contact', 'contact_principal', 'interlocuteur', 'nom_contact', 'contact_name', 'responsable'],
  notes: ['notes', 'note', 'commentaire', 'commentaires', 'remarque', 'observations', 'description'],
};

interface ImportResult {
  created: number;
  duplicates: number;
  errors: number;
  errorDetails: { row: number; reason: string }[];
}

interface MappedRow {
  [key: string]: string;
}

export default function BulkImportPage() {
  const { user, role } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [fileColumns, setFileColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [statutMode, setStatutMode] = useState<StatutMode>('client_actif');
  const [showInvalidPanel, setShowInvalidPanel] = useState(false);
  const [corrections, setCorrections] = useState<Record<number, { entreprise?: string; ville?: string }>>({});
  const [correctedIndices, setCorrectedIndices] = useState<Set<number>>(new Set());
  const [ignoredIndices, setIgnoredIndices] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback(async (file: File) => {
    setFileName(file.name);
    try {
      let data: Record<string, string>[];
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
        data = parsed.data;
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
      } else {
        toast.error('Format non supporté. Utilisez .csv ou .xlsx');
        return;
      }

      if (data.length === 0) {
        toast.error('Le fichier est vide ou mal formaté.');
        return;
      }

      const cols = Object.keys(data[0]);
      setFileColumns(cols);
      setRawData(data);
      setMapping({});
      setStep('mapping');
      toast.success(`${data.length} lignes détectées`);
    } catch {
      toast.error('Erreur lors de la lecture du fichier.');
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  }, [parseFile]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleAutoDetect = () => {
    const newMapping: Record<string, string> = {};
    const normalizedCols = fileColumns.map(c => c.trim().toLowerCase().replace(/[_\s]+/g, ' ').replace(/[éè]/g, 'e').replace(/[à]/g, 'a'));

    for (const field of CRM_FIELDS) {
      const aliases = ALIASES[field.key] || [field.key];
      const normalizedAliases = aliases.map(a => a.toLowerCase().replace(/[_\s]+/g, ' ').replace(/[éè]/g, 'e').replace(/[à]/g, 'a'));

      for (let i = 0; i < normalizedCols.length; i++) {
        if (normalizedAliases.includes(normalizedCols[i])) {
          newMapping[field.key] = fileColumns[i];
          break;
        }
      }
    }

    setMapping(newMapping);
    const matched = Object.keys(newMapping).length;
    toast.success(`${matched} champ${matched > 1 ? 's' : ''} détecté${matched > 1 ? 's' : ''} automatiquement`);
  };

  const getMappedRows = (): MappedRow[] => {
    return rawData.map((row, idx) => {
      const mapped: MappedRow = {};
      for (const field of CRM_FIELDS) {
        if (field.key === 'statut') {
          if (statutMode === 'client_actif') mapped.statut = 'client_actif';
          else if (statutMode === 'prospect') mapped.statut = 'prospect';
          else {
            const col = mapping['statut'];
            mapped.statut = col ? String(row[col] ?? '').trim() : '';
          }
          continue;
        }
        const col = mapping[field.key];
        mapped[field.key] = col ? String(row[col] ?? '').trim() : '';
      }
      // Apply corrections
      const corr = corrections[idx];
      if (corr) {
        if (corr.entreprise !== undefined) mapped.entreprise = corr.entreprise;
        if (corr.ville !== undefined) mapped.ville = corr.ville;
      }
      return mapped;
    });
  };

  const isRowInvalid = (row: MappedRow) => !row.entreprise || !row.ville;

  const handleImport = async () => {
    if (!user) return;
    setImporting(true);
    const mappedRows = getMappedRows();
    const res: ImportResult = { created: 0, duplicates: 0, errors: 0, errorDetails: [] };

    // Fetch existing customers for duplicate check
    const { data: existingCustomers } = await supabase
      .from('customers')
      .select('company_name, city');
    const existingSet = new Set(
      (existingCustomers || []).map(c => `${(c.company_name || '').toLowerCase()}|${(c.city || '').toLowerCase()}`)
    );

    for (let i = 0; i < mappedRows.length; i++) {
      const r = mappedRows[i];
      if (ignoredIndices.has(i)) continue;
      if (isRowInvalid(r)) {
        res.errors++;
        res.errorDetails.push({ row: i + 1, reason: 'Entreprise ou Ville manquante' });
        continue;
      }

      // Duplicate check
      const dupeKey = `${r.entreprise.toLowerCase()}|${r.ville.toLowerCase()}`;
      if (existingSet.has(dupeKey)) {
        res.duplicates++;
        continue;
      }

      const vehicles = parseInt(r.nb_vehicules) || 0;
      const statut = r.statut?.toLowerCase() || 'prospect';
      const customerData: Record<string, unknown> = {
        company_name: r.entreprise,
        city: r.ville,
        customer_type: ['client_actif', 'prospect'].includes(statut) ? statut : 'prospect',
        postal_code: r.code_postal || null,
        phone: r.telephone || null,
        email: r.email || null,
        activity_type: r.metier || null,
        number_of_vehicles: vehicles,
        sales_potential: ['A', 'B', 'C'].includes(r.potentiel?.toUpperCase()) ? r.potentiel.toUpperCase() : 'C',
        address: r.adresse || null,
        notes: r.notes || null,
        assigned_rep_id: user.id,
        account_status: 'active',
      };

      try {
        const { data: created, error } = await supabase
          .from('customers')
          .insert(customerData as any)
          .select('id')
          .single();

        if (error) {
          res.errors++;
          res.errorDetails.push({ row: i + 1, reason: error.message });
          continue;
        }
        res.created++;
        // Add to existing set to catch intra-file duplicates
        existingSet.add(dupeKey);

        if (r.contact_nom && created?.id) {
          const parts = r.contact_nom.trim().split(/\s+/);
          const first_name = parts[0] || '';
          const last_name = parts.slice(1).join(' ') || '';
          await supabase.from('contacts').insert({
            customer_id: created.id,
            first_name,
            last_name,
            phone: r.telephone || null,
            email: r.email || null,
            is_primary: true,
          });
        }
      } catch {
        res.errors++;
        res.errorDetails.push({ row: i + 1, reason: 'Erreur inattendue' });
      }
    }

    setResult(res);
    setStep('result');
    setImporting(false);
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

  // Guard: admin only
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

  // Step indicator
  const steps = [
    { key: 'upload', label: '1. Fichier', icon: Upload },
    { key: 'mapping', label: '2. Correspondance', icon: Wand2 },
    { key: 'preview', label: '3. Aperçu & Import', icon: CheckCircle2 },
  ];

  const renderStepper = () => (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((s, i) => {
        const isCurrent = s.key === step;
        const isDone = steps.findIndex(st => st.key === step) > i;
        return (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && <div className={`h-px w-8 ${isDone ? 'bg-primary' : 'bg-border'}`} />}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              isCurrent ? 'bg-primary text-primary-foreground' : isDone ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── ÉTAPE 1 : UPLOAD ──
  if (step === 'upload') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="font-heading text-2xl font-bold">Import clients / prospects</h1>
          <p className="text-sm text-muted-foreground">Importez en masse depuis un fichier CSV ou Excel</p>
        </div>
        {renderStepper()}

        <div className="grid gap-4 md:grid-cols-2">
          <Card
            className={`border-dashed border-2 transition-colors cursor-pointer ${
              dragOver ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <CardContent className="p-12 text-center">
              <Upload className={`mx-auto h-12 w-12 mb-4 transition-colors ${dragOver ? 'text-primary' : 'text-muted-foreground'}`} />
              <h3 className="font-medium mb-2">
                {dragOver ? 'Déposez le fichier ici' : 'Glissez-déposez votre fichier'}
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                ou cliquez pour sélectionner — Formats : .csv, .xlsx
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileInput}
                className="hidden"
              />
              <Button variant="default" onClick={(e) => e.stopPropagation()}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Choisir un fichier
              </Button>
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
      </div>
    );
  }

  // ── ÉTAPE 2 : MAPPING ──
  if (step === 'mapping') {
    const previewRows = rawData.slice(0, 3);
    const requiredMapped = CRM_FIELDS.filter(f => f.required).every(f => {
      if (f.key === 'statut') return statutMode !== 'column' || !!mapping['statut'];
      return !!mapping[f.key];
    });

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-heading text-2xl font-bold">Correspondance des colonnes</h1>
            <p className="text-sm text-muted-foreground">{fileName} · {rawData.length} lignes · {fileColumns.length} colonnes détectées</p>
          </div>
          <Button variant="ghost" onClick={() => { setStep('upload'); setRawData([]); setFileColumns([]); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
          </Button>
        </div>
        {renderStepper()}

        {/* Aperçu brut */}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" /> Aperçu des 3 premières lignes du fichier
            </p>
            <div className="overflow-auto max-h-[200px] border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    {fileColumns.map(col => (
                      <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow key={i}>
                      {fileColumns.map(col => (
                        <TableCell key={col} className="text-xs whitespace-nowrap max-w-[200px] truncate">
                          {String(row[col] ?? '')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Bouton auto-detect */}
        <div className="flex justify-end">
          <Button variant="outline" onClick={handleAutoDetect}>
            <Wand2 className="h-4 w-4 mr-2" />
            Détecter automatiquement
          </Button>
        </div>

        {/* Mapping form */}
        <Card>
          <CardContent className="p-4">
            <div className="grid gap-3">
              {CRM_FIELDS.map(field => {
                if (field.key === 'statut') {
                  return (
                    <div key="statut" className="space-y-2 border rounded-lg p-3 bg-muted/30">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{field.label}</span>
                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Obligatoire</Badge>
                      </div>
                      <RadioGroup
                        value={statutMode}
                        onValueChange={(v) => setStatutMode(v as StatutMode)}
                        className="space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="client_actif" id="statut-actif" />
                          <Label htmlFor="statut-actif" className="text-sm cursor-pointer">
                            Tous les clients sont des <strong>clients actifs</strong>
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="prospect" id="statut-prospect" />
                          <Label htmlFor="statut-prospect" className="text-sm cursor-pointer">
                            Tous les clients sont des <strong>prospects</strong>
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="column" id="statut-column" />
                          <Label htmlFor="statut-column" className="text-sm cursor-pointer">
                            Mapper une colonne du fichier
                          </Label>
                        </div>
                      </RadioGroup>
                      {statutMode === 'column' && (
                        <div className="ml-6 mt-1">
                          <Select
                            value={mapping['statut'] || '__none__'}
                            onValueChange={v => setMapping(prev => {
                              const next = { ...prev };
                              if (v === '__none__') delete next['statut'];
                              else next['statut'] = v;
                              return next;
                            })}
                          >
                            <SelectTrigger className={`text-sm ${mapping['statut'] ? '' : 'text-muted-foreground'}`}>
                              <SelectValue placeholder="— Non mappé —" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Non mappé —</SelectItem>
                              {fileColumns.map(col => (
                                <SelectItem key={col} value={col}>{col}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[10px] text-muted-foreground mt-1">Valeurs acceptées : client_actif ou prospect</p>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div key={field.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{field.label}</span>
                      {field.required && <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Obligatoire</Badge>}
                      {field.hint && <span className="text-[10px] text-muted-foreground">({field.hint})</span>}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Select
                      value={mapping[field.key] || '__none__'}
                      onValueChange={v => setMapping(prev => {
                        const next = { ...prev };
                        if (v === '__none__') delete next[field.key];
                        else next[field.key] = v;
                        return next;
                      })}
                    >
                      <SelectTrigger className={`text-sm ${mapping[field.key] ? '' : 'text-muted-foreground'}`}>
                        <SelectValue placeholder="— Non mappé —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Non mappé —</SelectItem>
                        {fileColumns.map(col => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => { setStep('upload'); setRawData([]); setFileColumns([]); }}>
            Annuler
          </Button>
          <Button
            onClick={() => setStep('preview')}
            disabled={!requiredMapped}
          >
            Aperçu de l'import
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  // ── ÉTAPE 3 : APERÇU & IMPORT ──
  if (step === 'preview') {
    const mappedRows = getMappedRows();
    const invalidRows = mappedRows.map((row, i) => ({ row, index: i })).filter(r => !ignoredIndices.has(r.index) && isRowInvalid(r.row));
    const invalidCount = invalidRows.length;
    const validCount = mappedRows.filter((row, i) => !ignoredIndices.has(i) && !isRowInvalid(row)).length;

    const handleCorrection = (idx: number, field: 'entreprise' | 'ville', value: string) => {
      setCorrections(prev => ({
        ...prev,
        [idx]: { ...prev[idx], [field]: value },
      }));
    };

    const handleValidateCorrection = (idx: number) => {
      const corr = corrections[idx];
      const row = getMappedRows()[idx];
      if (row.entreprise && row.ville) {
        setCorrectedIndices(prev => new Set(prev).add(idx));
        toast.success(`Ligne ${idx + 1} corrigée`);
      } else {
        toast.error('Entreprise et Ville doivent être remplies');
      }
    };

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-heading text-2xl font-bold">Aperçu avant import</h1>
            <p className="text-sm text-muted-foreground">{rawData.length} lignes au total</p>
          </div>
          <Button variant="ghost" onClick={() => setStep('mapping')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Modifier le mapping
          </Button>
        </div>
        {renderStepper()}

        {/* Stats */}
        <div className="flex gap-4 flex-wrap">
          <Badge variant="secondary" className="text-sm px-3 py-1">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            {validCount} valides
          </Badge>
          {invalidCount > 0 && (
            <Badge
              variant="destructive"
              className="text-sm px-3 py-1 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setShowInvalidPanel(!showInvalidPanel)}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              {invalidCount} invalides — cliquez pour corriger
            </Badge>
          )}
        </div>

        {/* Invalid rows correction panel */}
        {showInvalidPanel && invalidCount > 0 && (
          <Card className="border-destructive/30">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  {invalidCount} ligne{invalidCount > 1 ? 's' : ''} à corriger
                </p>
                <Button variant="ghost" size="sm" onClick={() => setShowInvalidPanel(false)}>
                  Fermer
                </Button>
              </div>

              <div className="overflow-auto max-h-[400px] space-y-3">
                {invalidRows.map(({ row, index }) => (
                  <div key={index} className="border rounded-lg p-3 bg-destructive/5 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Ligne {index + 1}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Entreprise {!row.entreprise && <span className="text-destructive">⚠ vide</span>}</label>
                        <input
                          type="text"
                          className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                          value={corrections[index]?.entreprise ?? row.entreprise}
                          onChange={(e) => handleCorrection(index, 'entreprise', e.target.value)}
                          placeholder="Nom de l'entreprise"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Ville {!row.ville && <span className="text-destructive">⚠ vide</span>}</label>
                        <input
                          type="text"
                          className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                          value={corrections[index]?.ville ?? row.ville}
                          onChange={(e) => handleCorrection(index, 'ville', e.target.value)}
                          placeholder="Ville"
                        />
                      </div>
                    </div>
                    {row.code_postal || row.telephone || row.email ? (
                      <p className="text-[10px] text-muted-foreground">
                        Données existantes : {[row.code_postal, row.telephone, row.email].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => handleValidateCorrection(index)}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Valider
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowInvalidPanel(false);
                    handleImport();
                  }}
                >
                  Ignorer toutes les invalides
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview table */}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-2">Aperçu des 5 premières lignes transformées</p>
            <div className="overflow-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Entreprise</TableHead>
                    <TableHead>Ville</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>CP</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Métier</TableHead>
                    <TableHead>Véh.</TableHead>
                    <TableHead>Pot.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, i) => {
                    const invalid = isRowInvalid(row);
                    return (
                      <TableRow key={i} className={invalid ? 'bg-destructive/5' : ''}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className={`text-sm font-medium ${!row.entreprise ? 'text-destructive' : ''}`}>
                          {row.entreprise || '⚠ Vide'}
                        </TableCell>
                        <TableCell className={`text-sm ${!row.ville ? 'text-destructive' : ''}`}>
                          {row.ville || '⚠ Vide'}
                        </TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{row.statut || 'prospect'}</Badge></TableCell>
                        <TableCell className="text-sm">{row.code_postal || '—'}</TableCell>
                        <TableCell className="text-sm">{row.telephone || '—'}</TableCell>
                        <TableCell className="text-sm">{row.email || '—'}</TableCell>
                        <TableCell className="text-sm">{row.metier || '—'}</TableCell>
                        <TableCell className="text-sm">{row.nb_vehicules || '—'}</TableCell>
                        <TableCell className="text-sm">{row.potentiel || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between items-center">
          <Button variant="outline" onClick={() => setStep('mapping')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing || validCount === 0}
            className="bg-green-600 hover:bg-green-700 text-white"
            size="lg"
          >
            {importing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Import en cours...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Lancer l'import ({validCount} lignes)</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── RÉSULTAT ──
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-2xl font-bold">Résultat de l'import</h1>
        <p className="text-sm text-muted-foreground">{fileName}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-accent mb-3" />
            <p className="text-3xl font-bold">{result?.created || 0}</p>
            <p className="text-sm text-muted-foreground">clients importés</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <XCircle className="mx-auto h-10 w-10 text-destructive mb-3" />
            <p className="text-3xl font-bold">{result?.errors || 0}</p>
            <p className="text-sm text-muted-foreground">erreurs</p>
          </CardContent>
        </Card>
      </div>

      {result && result.errorDetails.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Détail des erreurs
            </p>
            <div className="overflow-auto max-h-[200px] border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Ligne</TableHead>
                    <TableHead>Raison</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.errorDetails.map((err, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm font-mono">{err.row}</TableCell>
                      <TableCell className="text-sm text-destructive">{err.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => { setStep('upload'); setRawData([]); setFileColumns([]); setResult(null); }}>
          Nouvel import
        </Button>
        <Button asChild variant="default">
          <a href="/clients">Voir les clients</a>
        </Button>
      </div>
    </div>
  );
}
