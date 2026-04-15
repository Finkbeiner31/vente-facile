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
  XCircle, Loader2, ArrowLeft, Info, Eye, SkipForward,
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
  const [previewTab, setPreviewTab] = useState<'new' | 'duplicates' | 'errors'>('new');
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());

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
    const XLSX = await import('xlsx');
    void 0; // replaced below
  };

  const handleDownloadTemplateReal = () => {
    import('xlsx').then(XLSX => {
      const wb = XLSX.utils.book_new();

      // ── Feuille 1 : Import Clients ──
      const headers = [
        'entreprise', 'ville', 'statut', 'code_postal', 'telephone', 'email',
        'metier', 'nb_vehicules', 'potentiel', 'commercial_code',
        'adresse', 'siret', 'contact_nom', 'notes',
      ];
      const descriptions = [
        'Nom de l\'entreprise', 'Ville du site', 'client_actif ou prospect',
        'Code postal', 'N° téléphone', 'Adresse email',
        'ATELIER / NEGOCE / MIXTE / AUTRE', 'Nombre de véhicules', 'A / B / C',
        'Code commercial', 'Adresse complète', 'N° SIRET', 'Nom du contact principal',
        'Notes libres',
      ];
      const examples = [
        ['TRANSPORTS DUPONT', 'TOULOUSE', 'client_actif', '31000', '0561234567', 'contact@dupont.fr', 'ATELIER', 12, 'A', 'COM01', '', '', '', ''],
        ['GARAGE MARTIN', 'MURET', 'client_actif', '31600', '0561987654', 'martin@garage.fr', 'MIXTE', 5, 'B', 'COM03', '', '', '', ''],
        ['TRANSPORTS NOUVEAUX', 'CARCASSONNE', 'prospect', '11000', '0468123456', '', 'NEGOCE', 8, 'B', 'COM03', '', '', '', ''],
      ];

      const wsData: (string | number)[][] = [
        ['VENTE FACILE — Modèle import clients'],
        ['Colonnes ORANGES = obligatoires'],
        headers,
        descriptions,
        ...examples,
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Merge title row
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }];

      // Column widths
      ws['!cols'] = [
        { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 22 },
        { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 16 },
        { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 20 },
      ];

      // Styles (requires bookType xlsb won't work, but SheetJS community supports basic cell styling)
      // Title row style
      const titleCell = ws['A1'];
      if (titleCell) {
        titleCell.s = { font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1F2937' } }, alignment: { horizontal: 'center' } };
      }
      // Subtitle
      const subCell = ws['A2'];
      if (subCell) {
        subCell.s = { font: { italic: true, sz: 10, color: { rgb: '92400E' } }, fill: { fgColor: { rgb: 'FEF3C7' } } };
      }

      // Header styles
      const orangeCols = [0, 1, 2]; // obligatoires
      const greenCols = [3, 4, 5, 6, 7, 8, 9]; // recommandées
      const greyCols = [10, 11, 12, 13]; // optionnelles

      headers.forEach((_, ci) => {
        const cellRef = XLSX.utils.encode_cell({ r: 2, c: ci });
        const cell = ws[cellRef];
        if (!cell) return;
        let fillColor = 'D1D5DB'; // grey
        if (orangeCols.includes(ci)) fillColor = 'F97316';
        else if (greenCols.includes(ci)) fillColor = '22C55E';
        cell.s = {
          font: { bold: true, sz: 11, color: { rgb: orangeCols.includes(ci) ? 'FFFFFF' : '000000' } },
          fill: { fgColor: { rgb: fillColor } },
          alignment: { horizontal: 'center' },
        };
      });

      // Description row style
      descriptions.forEach((_, ci) => {
        const cellRef = XLSX.utils.encode_cell({ r: 3, c: ci });
        const cell = ws[cellRef];
        if (cell) {
          cell.s = { font: { italic: true, sz: 9, color: { rgb: '6B7280' } }, fill: { fgColor: { rgb: 'F9FAFB' } } };
        }
      });

      XLSX.utils.book_append_sheet(wb, ws, 'Import Clients');

      // ── Feuille 2 : Valeurs acceptées ──
      const refData = [
        ['Champ', 'Valeur', 'Description'],
        ['statut', 'client_actif', 'Client actif avec CA'],
        ['statut', 'prospect', 'Prospect à convertir'],
        ['', '', ''],
        ['metier', 'ATELIER', 'Atelier mécanique'],
        ['metier', 'NEGOCE', 'Négoce pièces'],
        ['metier', 'MIXTE', 'Atelier + Négoce'],
        ['metier', 'AUTRE', 'Autre activité'],
        ['', '', ''],
        ['potentiel', 'A', 'Fort potentiel (≥5k€/mois)'],
        ['potentiel', 'B', 'Potentiel moyen (2-5k€/mois)'],
        ['potentiel', 'C', 'Faible potentiel (<2k€/mois)'],
        ['', '', ''],
        ['commercial_code', 'COM01', 'Commercial 1'],
        ['commercial_code', 'COM02', 'Commercial 2'],
        ['commercial_code', 'COM03', 'Commercial 3'],
        ['commercial_code', 'COM04', 'Commercial 4'],
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(refData);
      ws2['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 28 }];

      // Header style for ref sheet
      ['A1', 'B1', 'C1'].forEach(ref => {
        const cell = ws2[ref];
        if (cell) {
          cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '3B82F6' } } };
        }
      });

      XLSX.utils.book_append_sheet(wb, ws2, 'Valeurs acceptées');

      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modele_import_clients.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleImport = async () => {
    if (!user) return;
    setImporting(true);
    const res: ImportResult = { created: 0, updated: 0, skipped: 0, errors: 0 };

    for (const row of rows) {
      // Skip rows with errors or excluded by user
      if (row.errors.length > 0) { res.errors++; continue; }
      if (excludedRows.has(row.rowIndex)) { res.skipped++; continue; }

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

  const errorRows = rows.filter(r => r.errors.length > 0);
  const duplicateRows = rows.filter(r => r.isDuplicate && r.errors.length === 0);
  const newRows = rows.filter(r => !r.isDuplicate && r.errors.length === 0);
  const errorCount = errorRows.length;
  const duplicateCount = duplicateRows.length;
  const newCount = newRows.length;
  const importableCount = newCount + duplicateRows.filter(r => !excludedRows.has(r.rowIndex)).length;
  const validCount = rows.filter(r => r.errors.length === 0).length;

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
          <Button variant="ghost" onClick={() => { setStep('upload'); setRows([]); setExcludedRows(new Set()); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
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

        {/* 3-tab classification */}
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
                  <TableCell className="text-sm">{row.data.contact_principal || '—'}</TableCell>
                  <TableCell className="text-sm">{row.data.telephone || '—'}</TableCell>
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
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px]"
                              onClick={() => setExcludedRows(prev => new Set(prev).add(row.rowIndex))}
                            >
                              <SkipForward className="h-3 w-3 mr-0.5" /> Ignorer
                            </Button>
                          </>
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

        {/* Import button */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setStep('upload'); setRows([]); setExcludedRows(new Set()); }}>
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
