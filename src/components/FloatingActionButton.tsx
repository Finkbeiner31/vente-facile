import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, UserPlus, X } from 'lucide-react';
import { QuickProspectSheet } from './QuickProspectSheet';

interface FloatingActionButtonProps {
  onProspectCreated?: (data: any) => void;
}

export function FloatingActionButton({ onProspectCreated }: FloatingActionButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [prospectOpen, setProspectOpen] = useState(false);

  const handleProspectSubmit = (data: any) => {
    onProspectCreated?.(data);
    setProspectOpen(false);
    setMenuOpen(false);
  };

  return (
    <>
      {/* Backdrop */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-black/20 pointer-events-auto" onClick={() => setMenuOpen(false)} />
      )}

      {/* Menu items */}
      {menuOpen && (
        <div className="fixed bottom-24 right-4 z-50 flex flex-col gap-2 items-end animate-fade-in">
          <button
            onClick={() => { setProspectOpen(true); setMenuOpen(false); }}
            className="flex items-center gap-2 rounded-full bg-card border shadow-lg pl-4 pr-5 py-3 text-sm font-semibold">
            <UserPlus className="h-4 w-4 text-primary" />
            Ajouter un prospect
          </button>
        </div>
      )}

      {/* FAB */}
      <Button
        onClick={() => setMenuOpen(!menuOpen)}
        className="fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full shadow-xl md:bottom-6"
        size="icon">
        {menuOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </Button>

      <QuickProspectSheet
        open={prospectOpen}
        onOpenChange={setProspectOpen}
        onSubmit={handleProspectSubmit}
      />
    </>
  );
}
