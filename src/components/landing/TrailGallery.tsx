import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Camera, Map } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

import gallerySunrise from '@/assets/gallery-sunrise.jpg';
import galleryJungle from '@/assets/gallery-jungle-trail.jpg';
import gallerySummit from '@/assets/gallery-summit-view.jpg';
import galleryWaterfall from '@/assets/gallery-waterfall.jpg';
import galleryHikers from '@/assets/gallery-hikers.jpg';
import galleryCampsite from '@/assets/gallery-campsite.jpg';

const galleryImages = [
  { src: gallerySunrise,  title: 'Sunrise at the Ridge', desc: 'Golden hour breaking through the clouds above the trail',       tag: 'Golden Hour' },
  { src: galleryJungle,   title: 'Jungle Trail Path',    desc: 'Dense tropical foliage along the lower trail sections',         tag: 'Trail'       },
  { src: gallerySummit,   title: 'Summit Panorama',      desc: 'Breathtaking 360° view from the peak at 622m',                  tag: 'Summit'      },
  { src: galleryWaterfall,title: 'Hidden Waterfall',     desc: 'A refreshing stop along the Scenic Loop trail',                 tag: 'Scenic'      },
  { src: galleryHikers,   title: 'Summit Celebration',   desc: 'Hikers celebrating at the summit marker',                       tag: 'Community'   },
  { src: galleryCampsite, title: 'Mountain Campsite',    desc: 'Overnight camping under the stars on the ridge',                tag: 'Camping'     },
];

export default function TrailGallery() {
  const [lightbox, setLightbox] = useState<number | null>(null);

  const navigate = (dir: number) => {
    if (lightbox === null) return;
    setLightbox((lightbox + dir + galleryImages.length) % galleryImages.length);
  };

  return (
    <section id="trail-gallery" className="py-24 px-4 relative overflow-hidden section-warm-overlay">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-primary/5 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-accent/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="container max-w-6xl mx-auto relative z-10">
        {/* Header — single simple fade, no nested animation */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="mb-12 text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm mb-5 border border-primary/20">
            <Camera className="h-4 w-4" />
            Trail Gallery
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">
            Discover the <span className="text-gradient">Beauty</span> of Kalisungan
          </h2>
          <p className="text-muted-foreground leading-relaxed text-center max-w-3xl mx-auto mt-3 text-base md:text-lg">
            Enjoy the stunning 360-degree summit view. From the top, hikers are rewarded with a full panorama of rolling hills, nearby mountains, and the distant waters of Laguna de Bay.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
          {galleryImages.map((img, i) => (
            <motion.div
              key={img.title}
              /* Pure opacity fade — no y/scale to prevent flicker */
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ delay: i * 0.05, duration: 0.35 }}
              className={`relative group cursor-pointer overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 ${
                i === 0 ? 'md:col-span-2 md:row-span-2' : ''
              }`}
              onClick={() => setLightbox(i)}
            >
              <img
                src={img.src}
                alt={img.title}
                /* eager loading — no lazy pop-in on reload */
                loading="eager"
                className={`w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                  i === 0 ? 'h-64 md:h-full' : 'h-48 md:h-56'
                }`}
              />

              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-50 group-hover:opacity-80 transition-opacity duration-400" />

              {/* Tag badge — always dark text on white bg */}
              <div className="absolute top-3 left-3 z-10">
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/90 text-gray-900 backdrop-blur-sm shadow-sm">
                  {img.tag}
                </span>
              </div>

              {/* Image info */}
              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5 z-10">
                <p className="text-sm md:text-base font-bold text-white drop-shadow-lg">{img.title}</p>
                <p className="text-xs md:text-sm text-white/80 mt-0.5 drop-shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  {img.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* View Trail Map button */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.35 }}
          className="flex justify-center mt-12"
        >
          <Button asChild size="lg" className="gap-2 px-8 shadow-lg hover:shadow-xl transition-shadow">
            <Link to="/map">
              <Map className="h-4 w-4" />
              View Trail Map
            </Link>
          </Button>
        </motion.div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 text-white hover:bg-white/10"
              onClick={() => setLightbox(null)}
              aria-label="Close lightbox"
            >
              <X className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/10"
              onClick={(e) => { e.stopPropagation(); navigate(-1); }}
              aria-label="Previous image"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/10"
              onClick={(e) => { e.stopPropagation(); navigate(1); }}
              aria-label="Next image"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>

            <motion.div
              key={lightbox}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="max-w-4xl max-h-[85vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={galleryImages[lightbox].src}
                alt={galleryImages[lightbox].title}
                className="max-h-[75vh] w-auto rounded-2xl object-contain shadow-2xl"
              />
              <div className="mt-4 text-center">
                <p className="font-bold text-lg text-white">{galleryImages[lightbox].title}</p>
                <p className="text-sm text-white/70">{galleryImages[lightbox].desc}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
