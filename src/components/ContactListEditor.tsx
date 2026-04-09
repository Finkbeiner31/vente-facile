import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Star } from 'lucide-react';

export interface ContactEntry {
  name: string;
  role: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

export const emptyContact = (isPrimary = false): ContactEntry => ({
  name: '',
  role: '',
  phone: '',
  email: '',
  isPrimary,
});

interface ContactListEditorProps {
  contacts: ContactEntry[];
  onChange: (contacts: ContactEntry[]) => void;
}

export function ContactListEditor({ contacts, onChange }: ContactListEditorProps) {
  const update = (index: number, field: keyof ContactEntry, value: string | boolean) => {
    const next = contacts.map((c, i) => (i === index ? { ...c, [field]: value } : c));
    onChange(next);
  };

  const setPrimary = (index: number) => {
    const next = contacts.map((c, i) => ({ ...c, isPrimary: i === index }));
    onChange(next);
  };

  const remove = (index: number) => {
    const next = contacts.filter((_, i) => i !== index);
    // Ensure at least one primary if we removed the primary
    if (next.length > 0 && !next.some(c => c.isPrimary)) {
      next[0].isPrimary = true;
    }
    onChange(next);
  };

  const add = () => {
    onChange([...contacts, emptyContact(contacts.length === 0)]);
  };

  return (
    <div className="space-y-3">
      {contacts.map((contact, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPrimary(i)}
              className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                contact.isPrimary
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Star className={`h-3.5 w-3.5 ${contact.isPrimary ? 'fill-primary' : ''}`} />
              {contact.isPrimary ? 'Contact principal' : 'Définir comme principal'}
            </button>
            {contacts.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-muted-foreground hover:text-destructive transition-colors p-1"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              value={contact.name}
              onChange={e => update(i, 'name', e.target.value)}
              placeholder="Nom du contact"
              className="h-10 text-sm"
            />
            <Input
              value={contact.role}
              onChange={e => update(i, 'role', e.target.value)}
              placeholder="Rôle (ex: Gérant)"
              className="h-10 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              type="tel"
              value={contact.phone}
              onChange={e => update(i, 'phone', e.target.value)}
              placeholder="Téléphone"
              className="h-10 text-sm"
            />
            <Input
              type="email"
              value={contact.email}
              onChange={e => update(i, 'email', e.target.value)}
              placeholder="Email"
              className="h-10 text-sm"
            />
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={add} className="w-full">
        <Plus className="h-4 w-4 mr-1.5" />
        Ajouter un contact
      </Button>
    </div>
  );
}
