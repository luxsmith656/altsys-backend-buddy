import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mountain, ArrowUpRight, Wind, Trees, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import heroImage from '@/assets/mt-kalisungan-hero.jpg';
import logo from '@/assets/logo.png';
import TrailGallery from '@/components/landing/TrailGallery';
import HikerReviews from '@/components/landing/HikerReviews';
import GuideRatings from '@/components/landing/GuideRatings';
import TrailOverview from '@/components/landing/TrailOverview';
import ReservingGuide from '@/components/landing/ReservingGuide';
import { useAuth } from '@/hooks/useAuth';

type LiveWeather = {
  temperature: number;
  windSpeed: number;
  humidity: number;
  weatherLabel: string;
};

function useLiveWeather(): { weather: LiveWeather | null; loading: boolean; error: string | null } {
  const [weather, setWeather] = useState<LiveWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchWeather = async () => {
      try {
        const url =
          'https://api.open-meteo.com/v1/forecast?latitude=14.1475&longitude=121.3454&current=temperature_2m,wind_speed_10m,relative_humidity_2m,weather_code';
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Weather error ${resp.status}`);
        const data = await resp.json();
        if (cancelled || !data.current) return;

        const code: number | undefined = data.current.weather_code;
        let label = 'Clear';
        if (code === 0) label = 'Clear sky';
        else if ([1, 2, 3].includes(code)) label = 'Partly cloudy';
        else if ([45, 48].includes(code)) label = 'Foggy';
        else if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) label = 'Rainy';
        else if ([71, 73, 75, 77, 85, 86].includes(code)) label = 'Snow';
        else if ([95, 96, 99].includes(code)) label = 'Thunderstorm';
        else if ([56, 57, 66, 67].includes(code)) label = 'Freezing rain';

        setWeather({
          temperature: data.current.temperature_2m,
          windSpeed: data.current.wind_speed_10m,
          humidity: data.current.relative_humidity_2m,
          weatherLabel: label,
        });
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not load weather');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchWeather();
    const id = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { weather, loading, error };
}

function SummitPathOverlay() {
  return (
    <div className="hidden sm:block glass-card rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground/80">Summit path (preview)</div>
          <div className="text-sm font-semibold">Sample route line</div>
        </div>
        <div className="text-xs text-muted-foreground text-right">
          <div className="font-medium text-foreground/90">Start</div>
          <div>Trailhead</div>
        </div>
      </div>

      <div className="relative h-24 rounded-xl bg-background/50 border border-border/40 overflow-hidden">
        <svg viewBox="0 0 400 120" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id="pathGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
              <stop offset="55%" stopColor="rgba(255,255,255,0.65)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.25)" />
            </linearGradient>
          </defs>

          <motion.path
            d="M20,90 C70,50 120,60 165,40 C220,15 250,35 290,25 C330,15 350,30 380,18"
            fill="none"
            stroke="url(#pathGradient)"
            strokeWidth="3.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />

          <circle cx="20" cy="90" r="6" fill="rgba(34,197,94,0.9)" />
          <circle cx="20" cy="90" r="10" fill="rgba(34,197,94,0.18)" />

          <circle cx="380" cy="18" r="6" fill="rgba(239,68,68,0.9)" />
          <circle cx="380" cy="18" r="10" fill="rgba(239,68,68,0.18)" />
        </svg>

        <div className="absolute left-3 bottom-2 text-[11px] text-muted-foreground">
          <span className="text-foreground/90 font-medium">Start</span> • Trailhead
        </div>
        <div className="absolute right-3 top-2 text-[11px] text-muted-foreground text-right">
          <div>
            <span className="text-foreground/90 font-medium">Arrive</span> • Summit
          </div>
          <div className="text-[10px]">~622 m</div>
        </div>
      </div>
    </div>
  );
}

/* ── SVG Section Dividers ── */
function MountainDivider({ flip = false, className = '' }: { flip?: boolean; className?: string }) {
  return (
    <div className={`section-divider overflow-hidden ${flip ? 'rotate-180' : ''} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="w-full h-16 md:h-24">
        <path
          d="M0,80 C180,20 360,100 540,50 C720,0 900,60 1080,30 C1200,10 1350,70 1440,40 L1440,120 L0,120 Z"
          fill="hsl(var(--background))"
          opacity="0.5"
        />
        <path
          d="M0,90 C200,40 400,110 600,60 C800,10 1000,70 1200,40 C1320,20 1400,60 1440,50 L1440,120 L0,120 Z"
          fill="hsl(var(--background))"
        />
      </svg>
    </div>
  );
}

function WaveDivider({ className = '' }: { className?: string }) {
  return (
    <div className={`section-divider overflow-hidden ${className}`} aria-hidden="true">
      <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full h-12 md:h-20">
        <path
          d="M0,40 Q360,0 720,40 Q1080,80 1440,40 L1440,80 L0,80 Z"
          fill="hsl(var(--background))"
          opacity="0.4"
        />
        <path
          d="M0,50 Q360,20 720,50 Q1080,80 1440,50 L1440,80 L0,80 Z"
          fill="hsl(var(--background))"
        />
      </svg>
    </div>
  );
}

export default function Index() {
  const { weather, loading, error } = useLiveWeather();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLearnMore = () => {
    document.getElementById('learn-more')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleBookNow = () => {
    if (user) {
      navigate('/booking');
      return;
    }
    navigate('/login?redirect=/booking');
  };

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Mount Kalisungan panoramic view showing lush green trails and dramatic sunset clouds in Calauan, Laguna, Philippines"
            className="w-full h-full object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/10 dark:to-background" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 w-full px-4"
        >
          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-stretch gap-8 lg:gap-12 pt-20 sm:pt-24 pb-16">
            {/* Left: headline + CTAs */}
            <div className="flex-1 flex flex-col justify-center text-center lg:text-left">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black mb-4 leading-tight text-white drop-shadow-[0_10px_35px_rgba(0,0,0,0.55)]">
                Stunning <span className="text-gradient">High Treks</span>{' '}
                <span className="block text-white/90">On Mount Kalisungan</span>
              </h1>

              <p className="text-sm sm:text-base md:text-lg text-white/75 max-w-xl mx-auto lg:mx-0 mb-8 drop-shadow-[0_8px_28px_rgba(0,0,0,0.45)]">
                Experience the beauty of Mount Kalisungan from every angle - hike along scenic ridgelines,
                take in breathtaking 360-degree panoramic views, witness the sea of clouds at dawn, and
                capture moments you'll never forget.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center lg:justify-start">
                <Button size="lg" className="text-base px-8 glow-primary" onClick={handleBookNow}>
                  <span className="inline-flex items-center">
                    Book Now <ArrowUpRight className="ml-2 h-4 w-4" />
                  </span>
                </Button>
                <Button variant="outline" size="lg" className="text-base px-8" onClick={handleLearnMore}>
                  Learn More
                </Button>
              </div>

              <div className="hidden sm:flex mt-8 gap-6 text-xs sm:text-sm text-white/70 drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                <div>
                  <div className="text-xl font-semibold text-white">622 m</div>
                  <div>Summit elevation</div>
                </div>
                <div>
                  <div className="text-xl font-semibold text-white">3 trails</div>
                  <div>Summit • River • Ridge</div>
                </div>
                <div>
                  <div className="text-xl font-semibold text-white">AI</div>
                  <div>Trail assistant & offline KB</div>
                </div>
              </div>
            </div>

            {/* Right: live weather + elevation cards */}
            <div className="w-full max-w-md mx-auto lg:mx-0 flex flex-col justify-end gap-4">
              <SummitPathOverlay />

              <div className="glass-card rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-primary/80 mb-1">Weather now</div>
                    <div className="text-lg font-semibold">Mt. Kalisungan Conditions</div>
                    <div className="text-xs text-muted-foreground">
                      Auto-updated using local weather data for Calauan, Laguna.
                    </div>
                  </div>
                  <div className="flex flex-col items-end text-right text-xs text-muted-foreground">
                    <span>14.1475°N</span>
                    <span>121.3454°E</span>
                    <span>622 m</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs sm:text-sm">
                  <div className="rounded-xl bg-background/60 border border-border/40 px-3 py-2 flex flex-col justify-center">
                    <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                      <Mountain className="h-3 w-3" /> Temp
                    </div>
                    <div className="mt-1 text-lg font-semibold text-foreground leading-tight">
                      {loading && !weather && '—'}
                      {!loading && weather && `${Math.round(weather.temperature)}°C`}
                      {!loading && !weather && error && 'N/A'}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {weather?.weatherLabel ?? (loading ? 'Checking...' : error ?? 'No data')}
                    </div>
                  </div>

                  <div className="rounded-xl bg-background/60 border border-border/40 px-3 py-2 flex flex-col justify-center">
                    <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                      <Wind className="h-3 w-3" /> Wind
                    </div>
                    <div className="mt-1 text-lg font-semibold text-foreground leading-tight">
                      {weather ? `${Math.round(weather.windSpeed)} km/h` : '—'}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Ridge level</div>
                  </div>

                  <div className="rounded-xl bg-background/60 border border-border/40 px-3 py-2 flex flex-col justify-center">
                    <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                      <Wind className="h-3 w-3" /> Humidity
                    </div>
                    <div className="mt-1 text-lg font-semibold text-foreground leading-tight">
                      {weather ? `${Math.round(weather.humidity)}%` : '—'}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Current moisture</div>
                  </div>
                </div>
              </div>

              {/* Mobile stats strip */}
              <div className="sm:hidden glass-card rounded-xl px-4 py-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <div>
                  <div className="text-sm font-semibold text-foreground">622 m</div>
                  <div>Summit elevation</div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">3 trails</div>
                  <div>Summit • River • Ridge</div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">Live weather</div>
                  <div>{weather ? 'Auto-updating' : 'Checks on load'}</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <section id="learn-more" className="py-10 md:py-14 px-4 bg-background">
        <div className="container max-w-5xl mx-auto">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary/80 mb-3">
              <span className="h-px w-7 bg-primary/50" />
              About the Mountain
              <span className="h-px w-7 bg-primary/50" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
              <span className="text-gradient">Mt. Kalisungan</span>
            </h2>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              Mount Kalisungan is a well-known hiking destination in Calauan, Laguna, recognized for its
              open grassland trails and scenic summit views. The mountain features a mix of gentle slopes and
              gradual ascents, making it accessible for beginners while still enjoyable for experienced hikers.
              <br /><br />
              From the summit, hikers are rewarded with wide views of Laguna and nearby mountain ranges, especially
              during sunrise and sunset.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">Calauan, Laguna</span>
              <span className="px-3 py-1 rounded-full text-xs bg-secondary/60 text-foreground border border-border/40">Lamot - Nagcarlan routes</span>
              <span className="px-3 py-1 rounded-full text-xs bg-secondary/60 text-foreground border border-border/40">Sunrise ridge treks</span>
            </div>
          </div>
        </div>
      </section>

      {/* Divider: Hero → Gallery */}
      <MountainDivider />

      {/* About / Gallery */}
      <TrailGallery />

      {/* Divider: Gallery → Overview */}
      <WaveDivider />

      {/* Trail Overview */}
      <TrailOverview />

      {/* Divider: Overview → Guide */}
      <MountainDivider />

      {/* Reserving Guide */}
      <ReservingGuide />

      {/* Divider: Guide → Guide Ratings */}
      <WaveDivider />

      {/* Top 3 Guide Ratings */}
      <GuideRatings />

      {/* Divider: Guide Ratings → Hiker Reviews */}
      <MountainDivider />

      {/* Hiker Experience Reviews */}
      <HikerReviews />

      {/* CTA */}
      <section className="py-20 px-4 relative">
        <div className="container max-w-4xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative rounded-3xl overflow-hidden shadow-2xl"
          >
            {/* Background image */}
            <div className="absolute inset-0">
              <img
                src={heroImage}
                alt=""
                className="w-full h-full object-cover"
                aria-hidden="true"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/90 via-green-800/85 to-teal-900/90" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(38_90%_55%/0.15)_0%,_transparent_50%)]" />
            </div>

            <div className="relative z-10 p-10 md:p-16 text-center">
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1, duration: 0.4 }}
              >
                <Trees className="h-10 w-10 text-emerald-300/60 mx-auto mb-4" />
                <h2 className="text-3xl md:text-4xl font-bold mb-3 text-white">
                  Ready to <span className="text-emerald-300">Hike Mount Kalisungan?</span>
                </h2>
                <p className="text-lg text-white/80 mb-8 font-medium">Reserve your slot now and start your adventure.</p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button asChild size="lg" className="text-base px-8 bg-white text-emerald-900 hover:bg-white/90 shadow-lg">
                    <Link to="/register">Create Account</Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="text-base px-8 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                    <Link to="/login">Sign In</Link>
                  </Button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative overflow-hidden">
        {/* Mountain silhouette divider */}
        <div className="relative h-16 md:h-24" aria-hidden="true">
          <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="absolute bottom-0 w-full h-full">
            <path
              d="M0,60 L120,40 L240,55 L360,30 L480,50 L600,20 L720,45 L840,15 L960,35 L1080,10 L1200,30 L1320,20 L1440,40 L1440,120 L0,120 Z"
              fill="hsl(152 30% 12%)"
            />
            <path
              d="M0,80 L120,60 L240,75 L360,50 L480,70 L600,40 L720,65 L840,35 L960,55 L1080,30 L1200,50 L1320,40 L1440,60 L1440,120 L0,120 Z"
              fill="hsl(152 25% 8%)"
            />
          </svg>
        </div>

        <div className="bg-[hsl(152_25%_8%)] text-white/80 py-10 px-4">
          <div className="container max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
              {/* Brand */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <img src={logo} alt="Mt. Kalisungan logo" className="h-8 w-8 rounded-full object-cover bg-white/5" />
                  <span className="text-lg font-bold text-white">Mt. Kalisungan</span>
                </div>
                <p className="text-sm text-white/50 leading-relaxed">
                  Plan, book, and track your hike with live weather, AI guidance, and GPS navigation — all in one app.
                </p>
              </div>

              {/* Quick Links */}
              <div>
                <h4 className="text-sm font-semibold text-white mb-3 uppercase tracking-wider">Quick Links</h4>
                <ul className="space-y-2 text-sm">
                  <li><Link to="/map" className="hover:text-white transition-colors">Trail Map</Link></li>
                  <li><Link to="/booking" className="hover:text-white transition-colors">Book a Hike</Link></li>
                  <li><Link to="/chat" className="hover:text-white transition-colors">AI Assistant</Link></li>
                  <li><Link to="/register" className="hover:text-white transition-colors">Create Account</Link></li>
                </ul>
              </div>

              {/* Contact */}
              <div>
                <h4 className="text-sm font-semibold text-white mb-3 uppercase tracking-wider">Location</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-emerald-400" /> Calauan, Laguna, Philippines</li>
                  <li className="flex items-center gap-2"><Mountain className="h-3.5 w-3.5 text-emerald-400" /> Elevation: 622 meters</li>
                  <li className="flex items-center gap-2"><Trees className="h-3.5 w-3.5 text-emerald-400" /> 3 Trail Routes Available</li>
                </ul>
              </div>
            </div>

            <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-white/40">
              <div>© 2026 Mt. Kalisungan • Thesis Project</div>
              <div>Built with ❤️ for adventurers and rangers alike</div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
