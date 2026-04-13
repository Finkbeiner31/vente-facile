import { AlertTriangle, ShieldAlert, Eye, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import type { DuplicateCandidate } from '@/lib/duplicateDetection';

interface DuplicateWarningProps {
  duplicates: DuplicateCandidate[];
  onForceCreate: () => void;
  isExact: boolean;
}

const confidenceConfig = {
  exact: { label: 'Doublon exact', class: 'bg-destructive/15 text-destructive', icon: ShieldAlert },
  strong: { label: 'Forte similarité', class: 'bg-warning/15 text-warning', icon: AlertTriangle },
  probable: { label: 'Similaire', class: 'bg-muted text-muted-foreground', icon: AlertTriangle },
};

const statusLabels: Record<string, string> = {
  prospect: 'Prospect',
  prospect_qualifie: 'Prospect qualifié',
  client_actif: 'Client actif',
  client_inactif: 'Inactif',
  pending_conversion: 'En attente',
};

export function DuplicateWarning({ duplicates, onForceCreate, isExact }: DuplicateWarningProps) {
  return (
    <div className={`rounded-lg border p-4 space-y-3 ${isExact ? 'border-destructive/50 bg-destructive/5' : 'border-warning/50 bg-warning/5'}`}>
      <div className="flex items-center gap-2">
        {isExact ? (
          <ShieldAlert className="h-5 w-5 text-destructive" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-warning" />
        )}
        <span className="font-semibold text-sm">
          {isExact ? 'Doublon exact détecté' : 'Comptes similaires détectés'}
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {duplicates.length} résultat{duplicates.length > 1 ? 's' : ''}
        </Badge>
      </div>

      {isExact && (
        <p className="text-xs text-destructive">
          Un compte avec les mêmes identifiants existe déjà. Il est recommandé de ne pas créer de doublon.
        </p>
      )}

      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        {duplicates.map(d => {
          const conf = confidenceConfig[d.confidence];
          return (
            <div key={d.id} className="flex items-center gap-3 rounded-md border bg-background p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{d.company_name}</span>
                  <Badge variant="secondary" className={`text-[10px] ${conf.class}`}>
                    {conf.label}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {statusLabels[d.customer_type] || d.customer_type}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {[d.city, d.phone, d.email].filter(Boolean).join(' · ')}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {d.matchReasons.join(' · ')}
                </p>
              </div>
              <Link to={`/clients/${d.id}`} target="_blank">
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  <span className="text-xs">Voir</span>
                </Button>
              </Link>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button
          variant={isExact ? 'destructive' : 'outline'}
          size="sm"
          onClick={onForceCreate}
          className="text-xs"
        >
          Créer quand même
        </Button>
      </div>
    </div>
  );
}
