import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, MessageCircle, Copy, Calendar, Percent, Tag, Package, ExternalLink, ZoomIn } from 'lucide-react';
import { format, parseISO, isAfter, isBefore } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Promotion } from '@/pages/PromotionsPage';
import { useState } from 'react';

interface Props {
  promotion: Promotion | null;
  onClose: () => void;
  onShare: (promo: Promotion, method: 'email' | 'whatsapp' | 'copy') => void;
}

function getStatus(p: Promotion) {
  const now = new Date();
  if (isBefore(now, parseISO(p.start_date))) return 'upcoming';
  if (isAfter(now, parseISO(p.end_date))) return 'expired';
  return 'active';
}

const statusConfig = {
  active: { label: 'Active', className: 'bg-success/15 text-success' },
  upcoming: { label: 'À venir', className: 'bg-primary/15 text-primary' },
  expired: { label: 'Expirée', className: 'bg-muted text-muted-foreground' },
};

export function PromotionDetailSheet({ promotion, onClose, onShare }: Props) {
  const [zoomed, setZoomed] = useState(false);

  if (!promotion) return null;

  const status = getStatus(promotion);
  const sc = statusConfig[status];

  return (
    <>
      <Sheet open={!!promotion} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl px-5 pb-8 overflow-y-auto">
          <SheetHeader className="pb-3">
            <SheetTitle className="font-heading text-lg text-left">{promotion.title}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge className={`${sc.className}`}>{sc.label}</Badge>
              {promotion.discount_value && (
                <Badge variant="outline">
                  {promotion.promotion_type === 'discount_percent' ? `${promotion.discount_value}%` : `${promotion.discount_value}€`}
                </Badge>
              )}
              {promotion.product_or_category && (
                <Badge variant="secondary">{promotion.product_or_category}</Badge>
              )}
            </div>

            {/* Image */}
            {promotion.image_url && (
              <div className="relative">
                <img
                  src={promotion.image_url}
                  alt={promotion.title}
                  className="w-full rounded-xl object-contain max-h-64 bg-muted cursor-pointer"
                  onClick={() => setZoomed(true)}
                />
                <button
                  onClick={() => setZoomed(true)}
                  className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm rounded-full p-2"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* PDF link */}
            {promotion.pdf_url && (
              <a href={promotion.pdf_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full h-11 gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Voir le document PDF
                </Button>
              </a>
            )}

            {/* Description */}
            {promotion.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-sm leading-relaxed">{promotion.description}</p>
              </div>
            )}

            {/* Dates */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                Du {format(parseISO(promotion.start_date), 'dd MMMM yyyy', { locale: fr })} au{' '}
                {format(parseISO(promotion.end_date), 'dd MMMM yyyy', { locale: fr })}
              </span>
            </div>

            {/* Targeting */}
            {(promotion.target_customer_type || promotion.target_region) && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Ciblage</p>
                <div className="flex flex-wrap gap-2">
                  {promotion.target_customer_type && (
                    <Badge variant="outline" className="text-xs">{promotion.target_customer_type}</Badge>
                  )}
                  {promotion.target_region && (
                    <Badge variant="outline" className="text-xs">{promotion.target_region}</Badge>
                  )}
                </div>
              </div>
            )}

            {/* Share */}
            {status === 'active' && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-medium text-muted-foreground">Partager</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" className="h-12 flex-col gap-1 text-xs" onClick={() => onShare(promotion, 'email')}>
                    <Mail className="h-5 w-5 text-primary" /> Email
                  </Button>
                  <Button variant="outline" className="h-12 flex-col gap-1 text-xs" onClick={() => onShare(promotion, 'whatsapp')}>
                    <MessageCircle className="h-5 w-5 text-success" /> WhatsApp
                  </Button>
                  <Button variant="outline" className="h-12 flex-col gap-1 text-xs" onClick={() => onShare(promotion, 'copy')}>
                    <Copy className="h-5 w-5 text-muted-foreground" /> Copier
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Zoom overlay */}
      {zoomed && promotion.image_url && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomed(false)}
        >
          <img
            src={promotion.image_url}
            alt={promotion.title}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </>
  );
}
