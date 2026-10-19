import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

type GalleryImage = { id: string; src: string; alt: string };

export default function TrailGallery() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    void supabase.from('reviews' as any)
      .select('id,reviewer_name,photo_url,review_type,is_approved,created_at')
      .eq('is_approved', true).eq('review_type', 'trail').not('photo_url', 'is', null)
      .order('created_at', { ascending: false }).limit(24)
      .then(({ data }) => {
        if (!mounted || !Array.isArray(data)) return;
        setImages(data.filter((item: any) => typeof item.photo_url === 'string' && item.photo_url.trim()).map((item: any) => ({
          id: item.id, src: item.photo_url, alt: `Published trail experience by ${item.reviewer_name || 'a Kalisungan hiker'}`,
        })));
      });
    return () => { mounted = false; };
  }, []);

  if (!images.length) return null;
  const move = (delta: number) => setActive((current) => current === null ? current : (current + delta + images.length) % images.length);

  return (
    <section id="trail-gallery" className="px-4 py-12 sm:py-16">
      <div className="container mx-auto grid max-w-6xl grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {images.map((image, index) => (
          <motion.button key={image.id} type="button" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} onClick={() => setActive(index)} className="group relative aspect-[4/3] min-w-0 overflow-hidden rounded-xl border border-border/30 bg-secondary/20 shadow-sm" aria-label={`Open ${image.alt}`}>
            <img src={image.src} alt={image.alt} loading="lazy" decoding="async" className="h-full w-full object-contain p-1 transition-transform duration-500 group-hover:scale-[1.03]" />
          </motion.button>
        ))}
      </div>
      <AnimatePresence>
        {active !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[2200] flex items-center justify-center bg-black/90 p-4" onClick={() => setActive(null)}>
            <Button variant="ghost" size="icon" className="absolute right-4 top-4 text-white" aria-label="Close gallery" onClick={() => setActive(null)}><X className="h-6 w-6" /></Button>
            <Button variant="ghost" size="icon" className="absolute left-3 top-1/2 -translate-y-1/2 text-white" aria-label="Previous gallery image" onClick={(event) => { event.stopPropagation(); move(-1); }}><ChevronLeft className="h-7 w-7" /></Button>
            <img src={images[active].src} alt={images[active].alt} className="max-h-[88vh] max-w-[92vw] object-contain" onClick={(event) => event.stopPropagation()} />
            <Button variant="ghost" size="icon" className="absolute right-3 top-1/2 -translate-y-1/2 text-white" aria-label="Next gallery image" onClick={(event) => { event.stopPropagation(); move(1); }}><ChevronRight className="h-7 w-7" /></Button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
