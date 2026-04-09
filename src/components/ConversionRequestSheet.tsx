import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Truck, Building2, Wrench, ArrowRightCircle, AlertTriangle } from 'lucide-react';
import { FLEET_KEYS, FLEET_LABELS } from '@/hooks/useVehiclePotentials';

interface ConversionRequestSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: any;
  onSubmit: (comment: string) => void;
  isPending: boolean;
}

export function ConversionRequestSheet({ open, onOpenChange, customer, onSubmit, isPending }: ConversionRequestSheetProps) {
  const [comment, setComment] = useState('');

  const fleetData = {
    fleet_pl: customer?.fleet_pl || 0,
    fleet_vu: customer?.fleet_vu || 0,
    fleet_remorque: customer?.fleet_remorque || 0,
    fleet_car_bus: customer?.fleet_car_bus || 0,
  };
  const totalVehicles = fleetData.fleet_pl + fleetData.fleet_vu + fleetData.fleet_remorque + fleetData.fleet_car_bus;

  const missingOptional: string[] = [];
  if (!customer?.activity_type) missingOptional.push('Type de client');
  if (!customer?.equipment_type) missingOptional.push('Équipement principal');

  const handleSubmit = () => {
    onSubmit(comment);
    setComment('');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="font-heading flex items-center gap-2">
            <ArrowRightCircle className="h-5 w-5 text-primary" />
            Demander la conversion
          </SheetTitle>
          <SheetDescription>
            Soumettez une demande pour convertir ce prospect en client actif. Un administrateur devra valider.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Summary */}
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-semibold">{customer?.company_name}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{customer?.activity_type || 'Non renseigné'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{customer?.equipment_type || 'Non renseigné'}</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Flotte</p>
              <div className="flex flex-wrap gap-1.5">
                {FLEET_KEYS.map(key => (
                  fleetData[key] > 0 && (
                    <Badge key={key} variant="secondary" className="text-[10px]">
                      {fleetData[key]} {FLEET_LABELS[key]}
                    </Badge>
                  )
                ))}
                {totalVehicles === 0 && (
                  <span className="text-xs text-muted-foreground italic">Aucune flotte</span>
                )}
              </div>
            </div>
          </div>

          {/* Warnings */}
          {missingOptional.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/20 p-3">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-warning">Informations incomplètes</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Certaines informations commerciales sont encore incomplètes : {missingOptional.join(', ')}.
                </p>
              </div>
            </div>
          )}

          {/* Comment */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Pourquoi convertir ce prospect ? (optionnel)</label>
            <Textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Ex: Client régulier depuis 3 mois, commandes récurrentes..."
              className="mt-1 text-sm"
              rows={3}
            />
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Envoi...' : 'Soumettre la demande de conversion'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
