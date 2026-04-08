import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GripVertical, ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
import type { PlannedVisit } from '@/lib/routeCycleEngine';

interface SortableRouteListProps {
  stops: PlannedVisit[];
  onReorder: (stops: PlannedVisit[]) => void;
  compact?: boolean;
}

function SortableItem({
  stop,
  index,
  total,
  onMoveUp,
  onMoveDown,
  compact,
}: {
  stop: PlannedVisit;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${stop.customer.id}-${index}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const getPriorityBadge = (priority: number) => {
    if (priority >= 60) return <Badge className="bg-accent/15 text-accent text-[9px] h-4 shrink-0">★ Top</Badge>;
    if (priority >= 30) return <Badge className="bg-warning/15 text-warning text-[9px] h-4 shrink-0">● Moyen</Badge>;
    return null;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border p-2.5 transition-shadow bg-card ${
        isDragging ? 'shadow-lg border-primary/40 ring-2 ring-primary/20' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="touch-none shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-muted active:bg-muted/80 cursor-grab active:cursor-grabbing"
          aria-label="Réordonner"
        >
          <GripVertical className="h-5 w-5" />
        </button>

        {/* Number */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
          {index + 1}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold truncate">{stop.customer.company_name}</p>
            {getPriorityBadge(stop.priority)}
          </div>
          {!compact && (
            <p className="text-[11px] text-muted-foreground truncate">{stop.customer.address}</p>
          )}
        </div>

        {/* Up/Down */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={index === 0}
            onClick={onMoveUp}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={index === total - 1}
            onClick={onMoveDown}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SortableRouteList({ stops, onReorder, compact }: SortableRouteListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const items = stops.map((s, i) => `${s.customer.id}-${i}`);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = items.indexOf(active.id as string);
      const newIndex = items.indexOf(over.id as string);
      onReorder(arrayMove(stops, oldIndex, newIndex));
    },
    [items, stops, onReorder],
  );

  const moveItem = useCallback(
    (from: number, to: number) => {
      onReorder(arrayMove([...stops], from, to));
    },
    [stops, onReorder],
  );

  const optimizeOrder = useCallback(() => {
    const sorted = [...stops].sort((a, b) => {
      // Group by city first, then by priority desc
      const cityA = a.customer.city || '';
      const cityB = b.customer.city || '';
      if (cityA !== cityB) return cityA.localeCompare(cityB);
      return b.priority - a.priority;
    });
    onReorder(sorted);
  }, [stops, onReorder]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium">
          {stops.length} visite{stops.length > 1 ? 's' : ''} · Glisser pour réordonner
        </p>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={optimizeOrder}>
          <Sparkles className="h-3.5 w-3.5" />
          Optimiser
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {stops.map((stop, i) => (
              <SortableItem
                key={`${stop.customer.id}-${i}`}
                stop={stop}
                index={i}
                total={stops.length}
                onMoveUp={() => moveItem(i, i - 1)}
                onMoveDown={() => moveItem(i, i + 1)}
                compact={compact}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
