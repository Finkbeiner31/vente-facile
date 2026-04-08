import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Mail, MessageCircle, Copy, Calendar, Percent, Tag, Package, Gift, ZoomIn } from 'lucide-react';
import { format, parseISO, isAfter, isBefore } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import type { Promotion } from '@/pages/PromotionsPage';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (promo: Promotion) => void;
  mode?: 'browse' | 'select';
}

const typeIcons: Record<string, typeof Percent> = {
  discount_percent: Percent,
  special_price: Tag,
  bundle: Package,
};

export function PromotionPickerSheet({ open, onOpenChange, onSelect, mode = 'browse' }: Props) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  useEffect(() => {
    if (open) loadPromotions();
  }, [open]);

  const loadPromotions = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('promotions')
      .select('*')
      .lte('start_date', today)
      .gte('end_date', today)
      .order('end_date', { ascending: true });
    if (data) setPromotions(data as Promotion[]);
    setLoading(false);
  };

  const handleShare = async (promo: Promotion, method: 'email' | 'whatsapp' | 'copy') => {
    const text = `${promo.title}\n${promo.description || ''}\nValable jusqu'au ${format(parseISO(promo.end_date), 'dd/MM/yyyy')}`;
    if (method === 'copy') {
      await navigator.clipboard.writeText(text);
      toast.success('Copié');
    } else if (method === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    } else {
      window.open(`mailto:?subject=${encodeURIComponent(promo.title)}&body=${encodeURIComponent(text)}`, '_blank');
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl px-4 pb-8 overflow-y-auto">
          <SheetHeader className="pb-3">
            <SheetTitle className="font-heading text-lg text-left">
              {mode === 'select' ? 'Sélectionner une promotion' : 'Promotions actives'}
            </SheetTitle>
          </SheetHeader>

          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-8">Chargement...</p>
          ) : promotions.length === 0 ? (
            <div className="py-12 text-center">
              <Gift className="mx-auto h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">Aucune promotion active</p>
            </div>
          ) : (
            <div className="space-y-3">
              {promotions.map(promo => {
                const TypeIcon = typeIcons[promo.promotion_type] || Percent;
                return (
                  <div key={promo.id} className="rounded-xl border p-3">
                    <div className="flex items-start gap-3">
                      {promo.image_url ? (
                        <div className="relative shrink-0">
                          <img src={promo.image_url} alt={promo.title} className="h-14 w-14 rounded-lg object-cover cursor-pointer" onClick={() => setZoomedImage(promo.image_url)} />
                          <button onClick={() => setZoomedImage(promo.image_url)} className="absolute -bottom-1 -right-1 bg-background border rounded-full p-0.5">
                            <ZoomIn className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <TypeIcon className="h-6 w-6 text-primary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold truncate">{promo.title}</h3>
                        {promo.description && <p className="text-xs text-muted-foreground line-clamp-2">{promo.description}</p>}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {promo.discount_value && (
                            <Badge variant="outline" className="text-[10px] h-4">
                              {promo.promotion_type === 'discount_percent' ? `${promo.discount_value}%` : `${promo.discount_value}€`}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Calendar className="h-2.5 w-2.5" />
                            jusqu'au {format(parseISO(promo.end_date), 'dd MMM', { locale: fr })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2.5">
                      {mode === 'select' ? (
                        <Button size="sm" className="flex-1 h-9 text-xs font-semibold" onClick={() => { onSelect?.(promo); onOpenChange(false); }}>
                          Sélectionner
                        </Button>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-1" onClick={() => handleShare(promo, 'email')}>
                            <Mail className="h-3 w-3" /> Email
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-1" onClick={() => handleShare(promo, 'whatsapp')}>
                            <MessageCircle className="h-3 w-3" /> WhatsApp
                          </Button>
                          <Button variant="outline" size="sm" className="h-9 px-2 text-xs" onClick={() => handleShare(promo, 'copy')}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {zoomedImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setZoomedImage(null)}>
          <img src={zoomedImage} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </>
  );
}
