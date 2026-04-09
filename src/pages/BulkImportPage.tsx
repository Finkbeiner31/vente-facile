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
  XCircle, Loader2, ArrowLeft, Info,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  parseCSV, parseXLSX, validateRows, generateTemplate,
  type ImportRow, type ValidatedRow,
} from '@/lib/importUtils';

type ImportMode = 'create_only' | 'update_only' | 'create_and_update';
type Step = 'upload' | 'preview' | 'result';

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

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

  // Fetch existing customers for duplicate detection
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

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    try {
      let parsed: ImportRow[];
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        parsed = parseCSV(text);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        parsed = parseXLSX(buffer);
      } else {
        toast.error('Format non supporté. Utilisez .csv ou .xlsx');
        return;
      }

      if (parsed.length === 0) {
        toast.error('Le fichier est vide ou mal formaté.');
        return;
      }

      const validated = validateRows(parsed, existingCustomers);
      setRows(validated);
      setStep('preview');
    } catch {
      toast.error('Erreur lors de la lecture du fichier.');
    }

    // Reset input for re-upload
    e.target.value = '';
  }, [existingCustomers]);

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
    const res: ImportResult = { created: 0, updated: 0, skipped: 0, errors: 0 };

    for (const row of rows) {
      // Skip rows with errors
      if (row.errors.length > 0) { res.errors++; continue; }

      const d = row.data;
      const isExisting = row.isDuplicate && row.duplicateOf?.includes('existant en base');

      // Mode logic
      if (mode === 'create_only' && isExisting) { res.skipped++; continue; }
      if (mode === 'update_only' && !isExisting) { res.skipped++; continue; }

      const vehicles = parseInt(d.nb_vehicules) || 0;
      const customerData = {
        company_name: d.entreprise.trim(),
        city: d.ville.trim(),
        address: d.adresse.trim() || null,
        postal_code: d.code_postal.trim() || null,
        phone: d.telephone.trim() || null,
        email: d.email.trim() || null,
        notes: d.notes.trim() || null,
        customer_type: d.statut.toLowerCase(),
        number_of_vehicles: vehicles,
        visit_frequency: d.frequence_visite.toLowerCase() || 'mensuelle',
        sales_potential: vehicles * 3500 >= 60000 ? 'A' : vehicles * 3500 >= 24000 ? 'B' : 'C',
      };

      try {
        if (isExisting && (mode === 'update_only' || mode === 'create_and_update')) {
          // Find existing customer
          const existing = existingCustomers.find(c =>
            c.company_name.toLowerCase() === d.entreprise.trim().toLowerCase() &&
            c.city.toLowerCase() === d.ville.trim().toLowerCase()
          );
          if (existing) {
            const { error } = await supabase
              .from('customers')
              .update(customerData)
              .eq('id', existing.id);
            if (error) { res.errors++; } else { res.updated++; }
          } else { res.skipped++; }
        } else {
          // Create
          const { data: created, error } = await supabase
            .from('customers')
            .insert({ ...customerData, assigned_rep_id: user.id })
            .select('id')
            .single();

          if (error) { res.errors++; continue; }
          res.created++;

          // Create primary contact if provided
          if (d.contact_principal.trim() && created?.id) {
            const { first_name, last_name } = splitName(d.contact_principal);
            await supabase.from('contacts').insert({
              customer_id: created.id,
              first_name,
              last_name,
              phone: d.telephone.trim() || null,
              email: d.email.trim() || null,
              is_primary: true,
            });
          }
        }
      } catch {
        res.errors++;
      }
    }

    setResult(res);
    setStep('result');
    setImporting(false);
  };

  const errorCount = rows.filter(r => r.errors.length > 0).length;
  const duplicateCount = rows.filter(r => r.isDuplicate).length;
  const validCount = rows.filter(r => r.errors.length === 0).length;

  // ── UPLOAD STEP ──
  if (step === 'upload') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="font-heading text-2xl font-bold">Import clients / prospects</h1>
          <p className="text-sm text-muted-foreground">Importez en masse depuis un fichier CSV ou Excel</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-dashed border-2 hover:border-primary/50 transition-colors">
            <CardContent className="p-8 text-center">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">Importer un fichier</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Formats acceptés : .csv, .xlsx
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

  // ── PREVIEW STEP ──
  if (step === 'preview') {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-heading text-2xl font-bold">Aperçu de l'import</h1>
            <p className="text-sm text-muted-foreground">{fileName} · {rows.length} lignes détectées</p>
          </div>
          <Button variant="ghost" onClick={() => { setStep('upload'); setRows([]); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
          </Button>
        </div>

        {/* Summary badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3 text-accent" /> {validCount} valides
          </Badge>
          {errorCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" /> {errorCount} erreurs
            </Badge>
          )}
          {duplicateCount > 0 && (
            <Badge variant="secondary" className="gap-1 bg-warning/15 text-warning">
              <AlertTriangle className="h-3 w-3" /> {duplicateCount} doublons
            </Badge>
          )}
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

        {/* Preview table */}
        <div className="border rounded-lg overflow-auto max-h-[50vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Entreprise</TableHead>
                <TableHead>Ville</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Véhicules</TableHead>
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
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]">{row.data.statut || '—'}</Badge>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{row.data.entreprise || '—'}</TableCell>
                  <TableCell className="text-sm">{row.data.ville || '—'}</TableCell>
                  <TableCell className="text-sm">{row.data.contact_principal || '—'}</TableCell>
                  <TableCell className="text-sm">{row.data.telephone || '—'}</TableCell>
                  <TableCell className="text-sm">{row.data.nb_vehicules || '—'}</TableCell>
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
                        <AlertTriangle className="h-3 w-3 shrink-0" /> Doublon: {row.duplicateOf}
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

        {/* Import button */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setStep('upload'); setRows([]); }}>
            Annuler
          </Button>
          <Button onClick={handleImport} disabled={importing || validCount === 0}>
            {importing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Import en cours...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Importer {validCount} lignes</>
            )}
          </Button>
        </div>
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

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => { setStep('upload'); setRows([]); setResult(null); }}>
          Nouvel import
        </Button>
        <Button asChild variant="default">
          <a href="/clients">Voir les clients</a>
        </Button>
      </div>
    </div>
  );
}
