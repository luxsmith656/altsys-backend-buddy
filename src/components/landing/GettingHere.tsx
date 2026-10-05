import { useState } from 'react';
import { MapPin, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function GettingHere() {
  const [origin, setOrigin] = useState('');
  const [entry, setEntry] = useState('Lamot 2');
  return <section aria-labelledby="getting-here-title" className="border-y border-border py-8 space-y-5">
    <div>
      <h2 id="getting-here-title" className="text-2xl font-bold">How to Get to Mt. Kalisungan</h2>
      <p className="mt-2 text-sm text-muted-foreground">Choose your jump-off in Calauan, Laguna: Lamot 1, Lamot 2, or Sto. Tomas. Travel to the entry point on your confirmed booking and meet your guide there.</p>
    </div>
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('open-global-ai-assistant', { detail: {
        prompt: `Help me get to the ${entry} jump-off for Mt. Kalisungan from ${origin.trim()}. Ask whether I am driving or commuting before suggesting directions. Use the registered jump-off information, cite sources for transport advice, and do not invent roads, fares or timetables.`,
      } }));
    }}>
      <div className="space-y-2"><Label htmlFor="travel-origin">Where are you coming from?</Label><Input id="travel-origin" required maxLength={200} placeholder="City, address, or nearby landmark" value={origin} onChange={(e) => setOrigin(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="travel-entry">Preferred jump-off</Label><select id="travel-entry" value={entry} onChange={(e) => setEntry(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{['Lamot 1', 'Lamot 2', 'Sto. Tomas'].map((name) => <option key={name}>{name}</option>)}</select></div>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!origin.trim()}><MessageCircle className="mr-2 h-4 w-4" />Need more information? Ask Kali</Button>
        <a className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-4" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${entry}, Calauan, Laguna, Philippines`)}${origin.trim() ? `&origin=${encodeURIComponent(origin.trim())}` : ''}`}><MapPin className="h-4 w-4" />Open directions</a>
      </div>
    </form>
  </section>;
}
