import { Link } from 'react-router-dom';
import { Mountain, MapPin, Compass, ShieldAlert, Trees, Sun, Clock, Users, ArrowRight, CheckCircle2, History, AlertTriangle, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import heroImage from '@/assets/mt-kalisungan-hero.jpg';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pt-16 pb-16">
      {/* Hero Banner */}
      <section className="relative overflow-hidden py-16 sm:py-24 px-4 bg-muted/20 border-b border-border/40">
        <div className="absolute inset-0 z-0">
          <img
            src={heroImage}
            alt="Mount Kalisungan view"
            className="w-full h-full object-cover opacity-20 filter blur-[1px]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/95 to-background" />
        </div>

        <div className="container max-w-5xl mx-auto relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold uppercase tracking-wider mb-4">
            <Mountain className="h-3.5 w-3.5" />
            Official Mountain Profile & Facts
          </div>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-4">
            About <span className="text-gradient">Mount Kalisungan</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Rising prominently in Calauan, Laguna, Mount Kalisungan (622 MASL) offers scenic agricultural trails,
            an expansive cogon ridge, and sweeping 360-degree panoramic views of Southern Tagalog and the Seven Crater Lakes.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="glow-primary">
              <Link to="/booking">
                Book a Hike <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/map">Explore 3D Map</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Quick Specs Grid */}
      <section className="py-12 px-4 container max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="glass-card text-center p-4 border-primary/20">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Elevation</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground mt-1">622 MASL</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">2,041 feet above sea level</div>
          </Card>

          <Card className="glass-card text-center p-4 border-primary/20">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Difficulty</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground mt-1">Minor (3/9)</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Trail Class 1–2 • Beginner-friendly</div>
          </Card>

          <Card className="glass-card text-center p-4 border-primary/20">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Trek Duration</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground mt-1">2.5 – 4 hrs</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Average time to summit</div>
          </Card>

          <Card className="glass-card text-center p-4 border-emerald-500/30 bg-emerald-500/5">
            <div className="text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">River Crossings</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">Strictly 0</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">100% dry land & ridge trail</div>
          </Card>
        </div>
      </section>

      {/* Main Content Sections */}
      <section className="py-8 px-4 container max-w-6xl mx-auto space-y-12">
        {/* Geographic Location & Jump-Offs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-1 space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
              <MapPin className="h-4 w-4" />
              Geography & Access
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold">Location & Jump-Offs</h2>
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
              Mount Kalisungan is situated in the municipality of <strong>Calauan, Laguna</strong> (approximately 14.1378° N, 121.3283° E).
              It forms an iconic natural landmark visible from the highway between San Pablo City and Calauan.
            </p>
            <div className="p-4 rounded-xl bg-secondary/50 border border-border/50 text-xs text-muted-foreground space-y-1.5">
              <div className="font-semibold text-foreground">Official LGU Jurisdiction:</div>
              <div>Municipality of Calauan, Province of Laguna</div>
              <div>Barangays: Lamot 1, Lamot 2, and Sto. Tomas</div>
            </div>
          </div>

          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="glass-card border-border/60 hover:border-primary/40 transition-colors">
              <CardHeader className="p-4 pb-2">
                <span className="text-xs font-bold text-primary">Trailhead 1</span>
                <CardTitle className="text-lg">Sitio Lamot 1</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-muted-foreground space-y-2">
                <p>The primary and traditional jump-off point. Features the central registration post, parking area, and guide briefing terminal.</p>
                <div className="font-medium text-foreground text-[11px]">Highlights: Farm orchards, coconut plantations, main summit ridge.</div>
              </CardContent>
            </Card>

            <Card className="glass-card border-border/60 hover:border-primary/40 transition-colors">
              <CardHeader className="p-4 pb-2">
                <span className="text-xs font-bold text-primary">Trailhead 2</span>
                <CardTitle className="text-lg">Sitio Lamot 2</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-muted-foreground space-y-2">
                <p>A tranquil alternative route passing through quiet local communities, lush banana groves, and fruit farms before merging with the upper ridge.</p>
                <div className="font-medium text-foreground text-[11px]">Highlights: Gentle ascent, shaded plantation walks.</div>
              </CardContent>
            </Card>

            <Card className="glass-card border-border/60 hover:border-primary/40 transition-colors">
              <CardHeader className="p-4 pb-2">
                <span className="text-xs font-bold text-primary">Trailhead 3</span>
                <CardTitle className="text-lg">Brgy. Sto. Tomas</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-muted-foreground space-y-2">
                <p>The southern approach preferred by hikers seeking cross-country views or traverse routes towards Nagcarlan and San Pablo borders.</p>
                <div className="font-medium text-foreground text-[11px]">Highlights: Expansive agricultural landscapes, traverse option.</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 0 River Crossing Fact Callout */}
        <Card className="border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-background to-teal-500/10 p-6 rounded-2xl">
          <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <div className="space-y-1 flex-1">
              <h3 className="text-lg sm:text-xl font-bold text-foreground">Strict 0 River Crossings Guarantee</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Unlike mountains that require traversing dangerous river beds or wading through flash-flood prone currents during wet weather,
                <strong> Mount Kalisungan has strictly ZERO river crossings</strong>. The trail follows dry agricultural footpaths,
                shaded orchard trails, and elevated grassland ridges all the way to the 622 MASL summit.
              </p>
            </div>
          </div>
        </Card>

        {/* 360-Degree Panoramic View & The 7 Crater Lakes */}
        <div className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <Compass className="h-4 w-4" />
              Summit Vistas
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold">Panoramic Summit Views</h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              Standing at 622 MASL on the Kalisungan summit grassland provides an unobstructed 360° vantage point over Southern Tagalog.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="glass-card p-6 border-border/60">
              <h3 className="text-lg font-bold flex items-center gap-2 mb-3 text-foreground">
                <Sun className="h-5 w-5 text-amber-500" />
                The Seven Crater Lakes of San Pablo
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-4">
                On clear mornings, hikers can spot several of the renowned crater lakes nestled in the volcanic landscape of San Pablo City:
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Lake Sampaloc</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Lake Bunot</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Lake Pandin</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Lake Yambo</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Lake Mohicap</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Lake Calibato</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Lake Palakpakin</div>
                <div className="flex items-center gap-1.5 text-muted-foreground">Laguna de Bay horizon</div>
              </div>
            </Card>

            <Card className="glass-card p-6 border-border/60">
              <h3 className="text-lg font-bold flex items-center gap-2 mb-3 text-foreground">
                <Mountain className="h-5 w-5 text-sky-500" />
                Surrounding Mountain Peaks
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-4">
                From the summit, you are surrounded by the giant volcanic guardians of Region IV-A:
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-foreground min-w-28">Mt. Makiling:</span>
                  <span className="text-muted-foreground">Visible to the west with its iconic sleeping maiden silhouette.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-foreground min-w-28">Mt. Banahaw:</span>
                  <span className="text-muted-foreground">Towering sacred stratovolcano visible to the southeast.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-foreground min-w-28">Mt. Cristobal:</span>
                  <span className="text-muted-foreground">The dramatic "Devil's Mountain" paired beside Banahaw.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-foreground min-w-28">Mt. Sembrano:</span>
                  <span className="text-muted-foreground">Visible northwards across the calm waters of Laguna de Bay.</span>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* History and Ecology */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="glass-card p-6 border-border/60">
            <div className="flex items-center gap-2 text-primary font-bold mb-3">
              <History className="h-5 w-5" />
              <h3 className="text-lg text-foreground">World War II History</h3>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Mount Kalisungan holds historical importance from the Second World War. In May 1945, during the closing stages of the liberation
              of the Philippines, Japanese imperial forces established defensive retreat posts on the mountain slopes as part of the Yamashita Line.
              Filipino guerrilla fighters alongside the US Army 1st Cavalry and 11th Airborne Divisions engaged forces in Calauan and restored peace to the region.
            </p>
          </Card>

          <Card className="glass-card p-6 border-border/60">
            <div className="flex items-center gap-2 text-emerald-500 font-bold mb-3">
              <Trees className="h-5 w-5" />
              <h3 className="text-lg text-foreground">Flora & Fauna</h3>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              The lower mountain trail is rich in fertile volcanic soil supporting rambutan, lanzones, coffee, and coconut trees.
              As you ascend into mid-elevation, native bamboo clusters give way to high cogon grasslands (*Imperata cylindrica*).
              Birdwatchers regularly observe Philippine bulbuls, kingfishers, crested serpent eagles, and nocturnal owls.
            </p>
          </Card>
        </div>

        {/* Trail Etiquette & Safety Regulations */}
        <Card className="glass-card p-6 sm:p-8 border-border/60">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Visitor Guidelines & Leave No Trace Principles
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs sm:text-sm">
            <div className="space-y-1 p-3 rounded-xl bg-background/50 border border-border/40">
              <div className="font-semibold text-foreground">1. Mandatory Guide</div>
              <p className="text-muted-foreground text-xs leading-relaxed">For safety and ecological preservation, all groups must be accompanied by an accredited local guide (1 guide : 5 hikers).</p>
            </div>
            <div className="space-y-1 p-3 rounded-xl bg-background/50 border border-border/40">
              <div className="font-semibold text-foreground">2. Carry Your Trash</div>
              <p className="text-muted-foreground text-xs leading-relaxed">Pack it in, pack it out. Strictly no littering along the orchards, trails, or campsite ridge.</p>
            </div>
            <div className="space-y-1 p-3 rounded-xl bg-background/50 border border-border/40">
              <div className="font-semibold text-foreground">3. No Open Campfires</div>
              <p className="text-muted-foreground text-xs leading-relaxed">Because the ridge consists of dry cogon grass, open bonfires are strictly prohibited to prevent bushfires.</p>
            </div>
            <div className="space-y-1 p-3 rounded-xl bg-background/50 border border-border/40">
              <div className="font-semibold text-foreground">4. Respect Private Farms</div>
              <p className="text-muted-foreground text-xs leading-relaxed">The lower trail traverses active agricultural lands. Do not pick coconuts, bananas, or fruits without permission.</p>
            </div>
            <div className="space-y-1 p-3 rounded-xl bg-background/50 border border-border/40">
              <div className="font-semibold text-foreground">5. Stay on Marked Trails</div>
              <p className="text-muted-foreground text-xs leading-relaxed">Avoid creating shortcuts that cause soil erosion on steep slopes. Use the system GPS tracker for guidance.</p>
            </div>
            <div className="space-y-1 p-3 rounded-xl bg-background/50 border border-border/40">
              <div className="font-semibold text-foreground">6. Sun & Rain Protection</div>
              <p className="text-muted-foreground text-xs leading-relaxed">The upper cogon ridge has minimal shade. Bring 2+ liters of water, sun protection, and a raincoat.</p>
            </div>
          </div>
        </Card>

        {/* Frequently Asked Questions (FAQ) */}
        <div className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <HelpCircle className="h-4 w-4" />
              Frequently Asked Questions
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold">Everything You Need to Know</h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              Official answers to common questions about climbing Mt. Kalisungan, permits, guides, and trail safety.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="glass-card p-5 border-border/60 space-y-2">
              <h4 className="text-sm sm:text-base font-bold text-foreground flex items-start gap-2">
                <span className="text-primary font-black">Q:</span>
                Are there any river crossings on Mt. Kalisungan?
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-5">
                <strong className="text-emerald-500">Strictly ZERO.</strong> Mt. Kalisungan has 0 river crossings. The entire route is dry land consisting of orchard trails, dirt paths, and ridge grasslands with no river flash flood hazard.
              </p>
            </Card>

            <Card className="glass-card p-5 border-border/60 space-y-2">
              <h4 className="text-sm sm:text-base font-bold text-foreground flex items-start gap-2">
                <span className="text-primary font-black">Q:</span>
                Is a local guide mandatory for all hikers?
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-5">
                <strong>Yes.</strong> By municipal tourism ordinance, every group must be accompanied by an accredited local guide (1 guide per 5 hikers) to ensure hiker safety, proper navigation, and environmental preservation.
              </p>
            </Card>

            <Card className="glass-card p-5 border-border/60 space-y-2">
              <h4 className="text-sm sm:text-base font-bold text-foreground flex items-start gap-2">
                <span className="text-primary font-black">Q:</span>
                How does guide assignment work during booking?
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-5">
                Manual guide picking from a list is disabled to ensure fair livelihood rotation among local guides. You may enter a guide&apos;s <strong>referral code or referral link</strong>. If none is entered, or if your group needs 2+ guides, the system automatically assigns certified guides on rotation.
              </p>
            </Card>

            <Card className="glass-card p-5 border-border/60 space-y-2">
              <h4 className="text-sm sm:text-base font-bold text-foreground flex items-start gap-2">
                <span className="text-primary font-black">Q:</span>
                What is the difficulty rating and summit elevation?
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-5">
                The mountain stands at <strong>622 MASL</strong> (2,041 ft) and is classified as a <strong>Minor Hike (Difficulty 3/9, Trail Class 1–2)</strong>. It is beginner-friendly, typically taking 2.5 to 3.5 hours to reach the summit.
              </p>
            </Card>

            <Card className="glass-card p-5 border-border/60 space-y-2">
              <h4 className="text-sm sm:text-base font-bold text-foreground flex items-start gap-2">
                <span className="text-primary font-black">Q:</span>
                What are the available booking time slots?
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-5">
                To prevent overcrowding, slots follow fixed 2-hour intervals:
                <br />• <strong>Morning:</strong> 2:00 AM, 4:00 AM, 6:00 AM, 8:00 AM, 10:00 AM
                <br />• <strong>Afternoon:</strong> 2:00 PM, 4:00 PM
                <br />• <strong>Overnight:</strong> 2:00 PM, 3:00 PM, 4:00 PM
              </p>
            </Card>

            <Card className="glass-card p-5 border-border/60 space-y-2">
              <h4 className="text-sm sm:text-base font-bold text-foreground flex items-start gap-2">
                <span className="text-primary font-black">Q:</span>
                Can we camp overnight at the summit?
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-5">
                <strong>Yes!</strong> Overnight slots are available on the summit grassland. Campers must bring their own wind-resistant tents, warm clothing, and drinking water. Open bonfires are strictly prohibited to protect the cogon grass.
              </p>
            </Card>

            <Card className="glass-card p-5 border-border/60 space-y-2">
              <h4 className="text-sm sm:text-base font-bold text-foreground flex items-start gap-2">
                <span className="text-primary font-black">Q:</span>
                What trailhead entry points can I choose from?
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-5">
                Three jump-offs are registered in Calauan, Laguna: <strong>Sitio Lamot 1</strong> (the main terminal with complete registration and parking), <strong>Sitio Lamot 2</strong> (plantation trail), and <strong>Brgy. Sto. Tomas</strong> (cross-country trail).
              </p>
            </Card>

            <Card className="glass-card p-5 border-border/60 space-y-2">
              <h4 className="text-sm sm:text-base font-bold text-foreground flex items-start gap-2">
                <span className="text-primary font-black">Q:</span>
                How do we get to the trailhead via commute?
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-5">
                Take any provincial bus bound for Sta. Cruz, Laguna from Buendia, Pasay, or Cubao. Disembark at Duck Junction / Calauan highway, then hire a local tricycle directly to the <strong>Lamot 1 Barangay Hall / Trailhead Terminal</strong>.
              </p>
            </Card>
          </div>
        </div>

        {/* CTA Banner */}
        <div className="rounded-3xl p-8 sm:p-12 text-center bg-gradient-to-br from-emerald-950/80 via-emerald-900/60 to-slate-900/90 border border-emerald-500/30 shadow-2xl relative overflow-hidden">
          <Mountain className="h-12 w-12 text-emerald-400 mx-auto mb-4 opacity-80" />
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white mb-3">
            Ready to Hike Mount Kalisungan?
          </h2>
          <p className="text-sm sm:text-base text-white/80 max-w-xl mx-auto mb-6">
            Book your hike online, receive instant permit verification, and be assigned a licensed local guide.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button asChild size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg">
              <Link to="/booking">Reserve Slot Now</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/30 text-white hover:bg-white/10">
              <Link to="/chat">Ask Kali AI About the Mountain</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
