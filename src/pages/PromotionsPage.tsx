import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { PromotionDetailSheet } from '@/components/PromotionDetailSheet';
import {
  Tag, Search, Calendar, Percent, Package, Gift,
  Share2, Mail, MessageCircle, Copy, ExternalLink,
} from 'lucide-react';
import { format, isAfter, isBefore, isToday, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

export type Promotion = {
  id: string;
  title: string;
  description: string | null;
  product_or_category: string | null;
  start_date: string;
  end_date: string;
  promotion_type: string;
  discount_value: number | null;
  image_url: string | null;
  pdf_url: string | null;
  target_customer_type: string | null;
  target_region: string | null;
  created_by: string;
  created_at: string;
};

function getPromotionStatus(promo: Promotion): 'active' | 'upcoming' | 'expired' {
  const now = new Date();
  const start = parseISO(promo.start_date);
  const end = parseISO(promo.end_date);
  if (isBefore(now, start)) return 'upcoming';
  if (isAfter(now, end)) return 'expired';
  return 'active';
}

const statusConfig = {
  active: { label: 'Active', className: 'bg-success/15 text-success border-success/30' },
  upcoming: { label: 'À venir', className: 'bg-primary/15 text-primary border-primary/30' },
  expired: { label: 'Expirée', className: 'bg-muted text-muted-foreground border-border' },
};

const typeConfig: Record<string, { label: string; icon: typeof Percent }> = {
  discount_percent: { label: 'Remise %', icon: Percent },
  special_price: { label: 'Prix spécial', icon: Tag },
  bundle: { label: 'Offre groupée', icon: Package },
};

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('active');
  const [selectedPromo, setSelectedPromo] = useState<Promotion | null>(null);

  useEffect(() => {
    loadPromotions();
  }, []);

  const loadPromotions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .order('start_date', { ascending: false });
    if (data) setPromotions(data as Promotion[]);
    if (error) toast.error('Erreur chargement promotions');
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let list = promotions;
    if (tab !== 'all') {
      list = list.filter(p => getPromotionStatus(p) === tab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.product_or_category?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [promotions, tab, search]);

  const counts = useMemo(() => ({
    active: promotions.filter(p => getPromotionStatus(p) === 'active').length,
    upcoming: promotions.filter(p => getPromotionStatus(p) === 'upcoming').length,
    expired: promotions.filter(p => getPromotionStatus(p) === 'expired').length,
    all: promotions.length,
  }), [promotions]);

  const handleShare = async (promo: Promotion, method: 'email' | 'whatsapp' | 'copy') => {
    const text = `${promo.title}\n${promo.description || ''}\nValable du ${format(parseISO(promo.start_date), 'dd/MM/yyyy')} au ${format(parseISO(promo.end_date), 'dd/MM/yyyy')}`;
    if (method === 'copy') {
      await navigator.clipboard.writeText(text);
      toast.success('Copié dans le presse-papiers');
    } else if (method === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    } else if (method === 'email') {
      window.open(`mailto:?subject=${encodeURIComponent(promo.title)}&body=${encodeURIComponent(text)}`, '_blank');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in pb-20 md:pb-0">
      <div>
        <h1 className="font-heading text-xl md:text-2xl font-bold">Promotions</h1>
        <p className="text-xs text-muted-foreground">Offres commerciales à présenter en visite</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Rechercher une promotion..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-11" />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-4 h-10">
          <TabsTrigger value="active" className="text-xs">Actives ({counts.active})</TabsTrigger>
          <TabsTrigger value="upcoming" className="text-xs">À venir ({counts.upcoming})</TabsTrigger>
          <TabsTrigger value="expired" className="text-xs">Expirées ({counts.expired})</TabsTrigger>
          <TabsTrigger value="all" className="text-xs">Toutes ({counts.all})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* List */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <Gift className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">Aucune promotion trouvée</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(promo => {
            const status = getPromotionStatus(promo);
            const sc = statusConfig[status];
            const tc = typeConfig[promo.promotion_type] || typeConfig.discount_percent;
            const TypeIcon = tc.icon;
            return (
              <Card key={promo.id} className={`transition-all ${status === 'expired' ? 'opacity-60' : 'hover:shadow-md'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {promo.image_url ? (
                      <img src={promo.image_url} alt={promo.title} className="h-16 w-16 rounded-lg object-cover shrink-0 cursor-pointer" onClick={() => setSelectedPromo(promo)} />
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 cursor-pointer" onClick={() => setSelectedPromo(promo)}>
                        <TypeIcon className="h-7 w-7 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold truncate cursor-pointer" onClick={() => setSelectedPromo(promo)}>{promo.title}</h3>
                        <Badge className={`text-[9px] h-5 shrink-0 ${sc.className}`}>{sc.label}</Badge>
                      </div>
                      {promo.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">{promo.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(parseISO(promo.start_date), 'dd MMM', { locale: fr })} — {format(parseISO(promo.end_date), 'dd MMM yyyy', { locale: fr })}
                        </span>
                        {promo.discount_value && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            {promo.promotion_type === 'discount_percent' ? `${promo.discount_value}%` : `${promo.discount_value}€`}
                          </Badge>
                        )}
                        {promo.product_or_category && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{promo.product_or_category}</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Share actions */}
                  {status === 'active' && (
                    <div className="flex gap-2 mt-3 pt-3 border-t">
                      <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-1.5" onClick={() => handleShare(promo, 'email')}>
                        <Mail className="h-3.5 w-3.5" /> Email
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-1.5" onClick={() => handleShare(promo, 'whatsapp')}>
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </Button>
                      <Button variant="outline" size="sm" className="h-9 px-3 text-xs" onClick={() => handleShare(promo, 'copy')}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PromotionDetailSheet
        promotion={selectedPromo}
        onClose={() => setSelectedPromo(null)}
        onShare={handleShare}
      />
    </div>
  );
}
