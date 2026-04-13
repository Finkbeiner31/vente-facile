import { useCallback, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Flame, Star, Clock } from 'lucide-react';
import { useVisitDurationDefaults, getVisitDurationWithDefaults } from '@/hooks/useVisitDurationDefaults';
import { formatDuration } from '@/lib/tourneeOptimizer';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  GripVertical, MapPin, Plus, Minus, ChevronUp, ChevronDown,
  Calendar, TrendingUp, Building2,
} from 'lucide-react';
import type { CustomerForRouting } from '@/lib/routeCycleEngine';
import { computeVisitStatus } from '@/lib/visitFrequencyUtils';

interface TourStop {
  customer: CustomerForRouting;
  priority: number;
  customerType?: string;
  lastVisitDate?: string | null;
}

interface TourneeDualListProps {
  plannedStops: TourStop[];
  availableCustomers: any[]; // raw customer rows from DB
  onUpdatePlanned: (stops: TourStop[]) => void;
}

// ─── Helpers ───
function getTypeBadge(type?: string) {
  switch (type) {
    case 'client_actif': return <Badge variant="secondary" className="text-[9px] h-4 shrink-0">Client</Badge>;
    case 'prospect_qualifie': return <Badge className="bg-chart-4/15 text-chart-4 text-[9px] h-4 shrink-0">Prospect Q.</Badge>;
    case 'prospect': return <Badge className="bg-muted text-muted-foreground text-[9px] h-4 shrink-0">Prospect</Badge>;
    default: return null;
  }
}

function getVisitBadge(freq: string | null, lastVisit: string | null) {
  const vs = computeVisitStatus(freq, lastVisit);
  if (vs.status === 'en_retard') return <Badge className={`${vs.bgColor} ${vs.color} text-[9px] h-4 shrink-0`}>En retard</Badge>;
  if (vs.status === 'a_visiter') return <Badge className={`${vs.bgColor} ${vs.color} text-[9px] h-4 shrink-0`}>À visiter</Badge>;
  return null;
}

function customerToStop(c: any): TourStop {
  return {
    customer: {
      id: c.id,
      company_name: c.company_name,
      address: c.address,
      city: c.city,
      phone: c.phone,
      visit_frequency: c.visit_frequency,
      number_of_vehicles: c.number_of_vehicles || 0,
      annual_revenue_potential: Number(c.annual_revenue_potential || 0),
      latitude: c.latitude,
      longitude: c.longitude,
      sales_potential: c.sales_potential,
    },
    priority: calcPriority(c),
    customerType: c.customer_type,
    lastVisitDate: c.last_visit_date,
  };
}

function calcPriority(c: any): number {
  let p = 0;
  const rev = Number(c.annual_revenue_potential || 0);
  p += Math.min(rev / 1000, 100);
  if (c.sales_potential === 'A') p += 30;
  else if (c.sales_potential === 'B') p += 15;
  if (c.last_visit_date) {
    const days = Math.floor((Date.now() - new Date(c.last_visit_date).getTime()) / 86400000);
    if (days > 30) p += 25;
    else if (days > 14) p += 10;
  } else {
    p += 20;
  }
  if (c.customer_type === 'prospect_qualifie') p += 10;
  const vs = computeVisitStatus(c.visit_frequency, c.last_visit_date);
  if (vs.status === 'en_retard') p += 40;
  else if (vs.status === 'a_visiter') p += 20;
  return p;
}

// ─── Sortable item for planned list ───
function PlannedItem({ stop, index, total, onMoveUp, onMoveDown, onRemove, isMobile }: {
  stop: TourStop; index: number; total: number;
  onMoveUp: () => void; onMoveDown: () => void; onRemove: () => void; isMobile: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `planned-${stop.customer.id}`,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}
      className={`rounded-xl border p-2.5 bg-card transition-shadow ${isDragging ? 'shadow-lg border-primary/40 ring-2 ring-primary/20' : ''}`}
    >
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners}
          className="touch-none shrink-0 p-1 rounded-lg text-muted-foreground hover:bg-muted cursor-grab active:cursor-grabbing"
          aria-label="Réordonner">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <p className="text-sm font-semibold truncate">{stop.customer.company_name}</p>
            {getTypeBadge(stop.customerType)}
            {getVisitBadge(stop.customer.visit_frequency, stop.lastVisitDate ?? null)}
            {stop.priority >= 60 && <Badge className="bg-primary/15 text-primary text-[9px] h-4 shrink-0">★</Badge>}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">
            {stop.customer.city}{stop.customer.address ? ` · ${stop.customer.address}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {isMobile && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={onMoveUp}>
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === total - 1} onClick={onMoveDown}>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onRemove}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Available item ───
function AvailableItem({ customer, onAdd, isMobile }: { customer: any; onAdd: () => void; isMobile: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `available-${customer.id}`,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}
      className={`rounded-xl border border-dashed p-2.5 bg-card/50 transition-shadow ${isDragging ? 'shadow-lg border-primary/40 ring-2 ring-primary/20' : ''}`}
    >
      <div className="flex items-center gap-2">
        {!isMobile && (
          <button {...attributes} {...listeners}
            className="touch-none shrink-0 p-1 rounded-lg text-muted-foreground hover:bg-muted cursor-grab active:cursor-grabbing"
            aria-label="Glisser vers tournée">
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <p className="text-sm font-medium truncate">{customer.company_name}</p>
            {getTypeBadge(customer.customer_type)}
            {getVisitBadge(customer.visit_frequency, customer.last_visit_date)}
          </div>
          <p className="text-[10px] text-muted-foreground truncate flex items-center gap-0.5">
            <MapPin className="h-3 w-3 shrink-0" />
            {customer.city || customer.address || '—'}
            {customer.annual_revenue_potential > 0 && (
              <span className="ml-1.5 flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" />
                {(Number(customer.annual_revenue_potential) / 1000).toFixed(0)}k€
              </span>
            )}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:text-primary shrink-0" onClick={onAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Droppable wrapper ───
function DroppableZone({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? 'ring-2 ring-primary/30 rounded-xl' : ''}`}>
      {children}
    </div>
  );
}

// ─── Main component ───
export function TourneeDualList({ plannedStops, availableCustomers, onUpdatePlanned }: TourneeDualListProps) {
  const [isMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [showAllAvailable, setShowAllAvailable] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const toggleFilter = useCallback((filter: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
    setShowAllAvailable(false);
  }, []);

  const plannedIds = useMemo(() => new Set(plannedStops.map(s => s.customer.id)), [plannedStops]);

  const available = useMemo(() => {
    return availableCustomers
      .filter(c => !plannedIds.has(c.id))
      .sort((a, b) => calcPriority(b) - calcPriority(a));
  }, [availableCustomers, plannedIds]);

  const filteredAvailable = useMemo(() => {
    let list = available;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(c =>
        (c.company_name || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        (c.postal_code || '').toLowerCase().includes(q)
      );
    }
    if (activeFilters.size > 0) {
      list = list.filter(c => {
        if (activeFilters.has('clients') && c.customer_type !== 'client_actif') return false;
        if (activeFilters.has('prospects') && c.customer_type !== 'prospect' && c.customer_type !== 'prospect_qualifie') return false;
        if (activeFilters.has('en_retard')) {
          const vs = computeVisitStatus(c.visit_frequency, c.last_visit_date);
          if (vs.status !== 'en_retard') return false;
        }
        if (activeFilters.has('prioritaires') && calcPriority(c) < 60) return false;
        return true;
      });
    }
    return list;
  }, [available, searchQuery, activeFilters]);

  const displayedAvailable = showAllAvailable ? filteredAvailable : filteredAvailable.slice(0, 10);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const plannedItemIds = plannedStops.map(s => `planned-${s.customer.id}`);
  const availableItemIds = displayedAvailable.map(c => `available-${c.id}`);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const isActivePlanned = activeId.startsWith('planned-');
    const isActiveAvailable = activeId.startsWith('available-');

    // Case 1: Reorder within planned
    if (isActivePlanned && overId.startsWith('planned-')) {
      const oldIdx = plannedItemIds.indexOf(activeId);
      const newIdx = plannedItemIds.indexOf(overId);
      if (oldIdx !== newIdx) {
        onUpdatePlanned(arrayMove([...plannedStops], oldIdx, newIdx));
      }
      return;
    }

    // Case 2: Drag from available to planned area
    if (isActiveAvailable && (overId === 'planned-zone' || overId.startsWith('planned-'))) {
      const custId = activeId.replace('available-', '');
      const cust = availableCustomers.find(c => c.id === custId);
      if (cust) {
        const newStop = customerToStop(cust);
        // Insert at drop position or at end
        if (overId.startsWith('planned-')) {
          const insertIdx = plannedItemIds.indexOf(overId);
          const newStops = [...plannedStops];
          newStops.splice(insertIdx, 0, newStop);
          onUpdatePlanned(newStops);
        } else {
          onUpdatePlanned([...plannedStops, newStop]);
        }
      }
      return;
    }

    // Case 3: Drag from planned to available area (remove)
    if (isActivePlanned && (overId === 'available-zone' || overId.startsWith('available-'))) {
      const custId = activeId.replace('planned-', '');
      onUpdatePlanned(plannedStops.filter(s => s.customer.id !== custId));
      return;
    }
  }, [plannedStops, plannedItemIds, availableCustomers, onUpdatePlanned]);

  const addToPlanned = useCallback((custId: string) => {
    const cust = availableCustomers.find(c => c.id === custId);
    if (cust) {
      onUpdatePlanned([...plannedStops, customerToStop(cust)]);
    }
  }, [availableCustomers, plannedStops, onUpdatePlanned]);

  const removeFromPlanned = useCallback((custId: string) => {
    onUpdatePlanned(plannedStops.filter(s => s.customer.id !== custId));
  }, [plannedStops, onUpdatePlanned]);

  const moveItem = useCallback((from: number, to: number) => {
    onUpdatePlanned(arrayMove([...plannedStops], from, to));
  }, [plannedStops, onUpdatePlanned]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      onDragStart={handleDragStart} onDragEnd={handleDragEnd}>

      {/* ─── PLANNED LIST ─── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Tournée du jour
            <Badge variant="secondary" className="text-[10px] h-4 ml-1">{plannedStops.length}</Badge>
          </h3>
        </div>

        <DroppableZone id="planned-zone" className="min-h-[60px]">
          <SortableContext items={plannedItemIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {plannedStops.length === 0 ? (
                <div className="py-8 text-center border-2 border-dashed rounded-xl">
                  <Calendar className="mx-auto h-8 w-8 text-muted-foreground/30" />
                  <p className="mt-2 text-sm text-muted-foreground">Aucune visite planifiée pour cette journée</p>
                  <p className="text-[11px] text-muted-foreground">Glissez des comptes depuis la liste ci-dessous</p>
                </div>
              ) : (
                plannedStops.map((stop, i) => (
                  <PlannedItem
                    key={stop.customer.id}
                    stop={stop}
                    index={i}
                    total={plannedStops.length}
                    onMoveUp={() => moveItem(i, i - 1)}
                    onMoveDown={() => moveItem(i, i + 1)}
                    onRemove={() => removeFromPlanned(stop.customer.id)}
                    isMobile={isMobile}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </DroppableZone>
      </div>

      {/* ─── AVAILABLE LIST ─── */}
      <div className="space-y-1.5 mt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Disponibles dans la zone
            <Badge variant="outline" className="text-[10px] h-4 ml-1">{filteredAvailable.length}</Badge>
          </h3>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Rechercher un client ou une ville..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setShowAllAvailable(false); }}
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-1">
          {([
            { key: 'clients', label: 'Clients' },
            { key: 'prospects', label: 'Prospects' },
            { key: 'en_retard', label: 'En retard', icon: <Flame className="h-3 w-3" /> },
            { key: 'prioritaires', label: 'Prioritaires', icon: <Star className="h-3 w-3" /> },
          ] as const).map(f => {
            const active = activeFilters.has(f.key);
            return (
              <button
                key={f.key}
                onClick={() => toggleFilter(f.key)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                {'icon' in f && f.icon}
                {f.label}
              </button>
            );
          })}
        </div>

        <DroppableZone id="available-zone" className="min-h-[40px]">
          <SortableContext items={availableItemIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {filteredAvailable.length === 0 ? (
                <div className="py-6 text-center border border-dashed rounded-xl">
                  <p className="text-sm text-muted-foreground">
                    {available.length === 0
                      ? 'Aucun autre client ou prospect disponible dans cette zone'
                      : 'Aucun résultat avec ces filtres'}
                  </p>
                </div>
              ) : (
                <>
                  {displayedAvailable.map(c => (
                    <AvailableItem
                      key={c.id}
                      customer={c}
                      onAdd={() => addToPlanned(c.id)}
                      isMobile={isMobile}
                    />
                  ))}
                  {!showAllAvailable && filteredAvailable.length > 10 && (
                    <Button
                      variant="ghost"
                      className="w-full text-xs text-muted-foreground h-8"
                      onClick={() => setShowAllAvailable(true)}
                    >
                      Afficher les {filteredAvailable.length - 10} restants
                    </Button>
                  )}
                </>
              )}
            </div>
          </SortableContext>
        </DroppableZone>
      </div>
    </DndContext>
  );
}
