import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QuickReportDialog } from '@/components/QuickReportDialog';
import {
  MapPin, Clock, CheckCircle, Play, Square, Phone, Navigation, Plus, Calendar,
  GripVertical, Sparkles, Route as RouteIcon,
} from 'lucide-react';

interface Stop {
  id: string;
  client: string;
  address: string;
  time: string;
  status: string;
  phone: string;
}

const initialStops: Stop[] = [
  { id: '1', client: 'Boulangerie Martin', address: '12 Rue de la Paix, Paris', time: '09:00', status: 'completed', phone: '01 42 33 44 55' },
  { id: '2', client: 'Café du Commerce', address: '45 Av. des Champs, Lyon', time: '10:30', status: 'completed', phone: '04 72 11 22 33' },
  { id: '3', client: 'Restaurant Le Gourmet', address: '8 Pl. Bellecour, Lyon', time: '14:00', status: 'planned', phone: '04 78 99 88 77' },
  { id: '4', client: 'Pharmacie du Centre', address: '22 Rue Nationale, Lyon', time: '15:30', status: 'planned', phone: '05 61 77 88 99' },
];

export default function RoutesPage() {
  const [stops, setStops] = useState(initialStops);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [activeClient, setActiveClient] = useState('');

  const handleDragStart = (i: number) => setDragIndex(i);
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) return;
    const updated = [...stops];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(i, 0, moved);
    setStops(updated);
    setDragIndex(i);
  };
  const handleDragEnd = () => setDragIndex(null);

  const handleOptimize = () => {
    // Simple optimization: completed first, then planned
    const completed = stops.filter(s => s.status === 'completed');
    const rest = stops.filter(s => s.status !== 'completed');
    setStops([...completed, ...rest]);
  };

  const handleStart = (id: string) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, status: 'in_progress' } : s));
  };

  const handleEnd = (id: string, client: string) => {
    setStops(prev => prev.map(s => s.id === id ? { ...s, status: 'completed' } : s));
    setActiveClient(client);
    setReportOpen(true);
  };

  const completedCount = stops.filter(s => s.status === 'completed').length;

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl md:text-2xl font-bold">Tournée du jour</h1>
          <p className="text-xs text-muted-foreground">{completedCount}/{stops.length} visites · ~85 km · ~2h15</p>
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={handleOptimize}>
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          Optimiser
        </Button>
      </div>

      {/* Progress */}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${(completedCount / stops.length) * 100}%` }}
        />
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="p-2.5 text-center">
          <p className="font-heading text-lg font-bold">{stops.length}</p>
          <p className="text-[10px] text-muted-foreground">Arrêts</p>
        </CardContent></Card>
        <Card><CardContent className="p-2.5 text-center">
          <p className="font-heading text-lg font-bold">85 km</p>
          <p className="text-[10px] text-muted-foreground">Distance</p>
        </CardContent></Card>
        <Card><CardContent className="p-2.5 text-center">
          <p className="font-heading text-lg font-bold">2h15</p>
          <p className="text-[10px] text-muted-foreground">Durée est.</p>
        </CardContent></Card>
      </div>

      {/* Stops - draggable */}
      <div className="space-y-2">
        {stops.map((stop, i) => {
          const isActive = stop.status === 'in_progress';
          return (
            <div
              key={stop.id}
              draggable={stop.status === 'planned'}
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDragEnd={handleDragEnd}
              className={`rounded-xl border p-3 transition-all ${
                isActive ? 'border-primary/40 bg-primary/5 shadow-sm' :
                stop.status === 'completed' ? 'opacity-60' : ''
              } ${dragIndex === i ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-2">
                {stop.status === 'planned' && (
                  <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab shrink-0 touch-none" />
                )}
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  stop.status === 'completed' ? 'bg-success/10 text-success' :
                  isActive ? 'bg-primary text-primary-foreground' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {stop.status === 'completed' ? '✓' : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{stop.client}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{stop.address}</p>
                </div>
                <span className="text-xs font-medium text-muted-foreground shrink-0">{stop.time}</span>
              </div>

              {/* Actions */}
              {stop.status !== 'completed' && (
                <div className="flex items-center gap-2 mt-2.5">
                  {stop.status === 'planned' && (
                    <Button size="sm" className="h-9 flex-1 font-semibold text-xs" onClick={() => handleStart(stop.id)}>
                      <Play className="h-3.5 w-3.5 mr-1" /> Démarrer
                    </Button>
                  )}
                  {isActive && (
                    <Button size="sm" variant="destructive" className="h-9 flex-1 font-semibold text-xs"
                      onClick={() => handleEnd(stop.id, stop.client)}>
                      <Square className="h-3.5 w-3.5 mr-1" /> Terminer
                    </Button>
                  )}
                  <a href={`tel:${stop.phone}`} className="shrink-0">
                    <Button variant="outline" size="icon" className="h-9 w-9">
                      <Phone className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`}
                    target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <Button variant="outline" size="icon" className="h-9 w-9">
                      <Navigation className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Week overview */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="font-heading text-sm">Cette semaine</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-5 gap-1.5">
            {['L', 'M', 'M', 'J', 'V'].map((day, i) => (
              <div key={i} className={`rounded-lg p-2 text-center ${i === 2 ? 'bg-primary/10 border border-primary/20' : 'border'}`}>
                <p className={`text-xs font-bold ${i === 2 ? 'text-primary' : ''}`}>{day}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{3 + i}v</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <QuickReportDialog open={reportOpen} onOpenChange={setReportOpen} clientName={activeClient} />
    </div>
  );
}
