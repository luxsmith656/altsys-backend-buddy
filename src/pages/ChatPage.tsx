import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, Send, Loader2, Sparkles, WifiOff } from 'lucide-react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '@/types';
import { getOfflineAnswer, learnFromResponse, getCacheSize } from '@/lib/trail-offline-kb';
import logo from '@/assets/logo.png';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trail-chat`;
const QUICK_QUESTIONS = [
  'What trails are available on Mt. Kalisungan?',
  'What should I bring for a day hike?',
  'Is it safe to hike during rainy season?',
  'What wildlife can I expect to see?',
  'Where are the nearest emergency services?',
];

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Offline fallback
    if (!navigator.onLine) {
      const answer = getOfflineAnswer(text.trim());
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
      setLoading(false);
      return;
    }

    let assistantSoFar = '';
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No stream');
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let ni: number;
        while ((ni = buf.indexOf('\n')) !== -1) {
          let line = buf.slice(0, ni);
          buf = buf.slice(ni + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsert(content);
          } catch { /* partial */ }
        }
      }
      // Learn from successful response for future offline use
      if (assistantSoFar.trim()) {
        learnFromResponse(text.trim(), assistantSoFar);
      }
    } catch (e: any) {
      // If network failed mid-request, try offline fallback
      if (!navigator.onLine) {
        const answer = getOfflineAnswer(text.trim());
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: answer } : m));
          }
          return [...prev, { role: 'assistant', content: answer }];
        });
      } else {
        upsert(`\n\n*Error: ${e.message}*`);
      }
    }
    setLoading(false);
  };

  return (
    <div className="h-screen pt-16 flex flex-col">
      <div className="glass-card-strong border-b border-border/30 px-4 py-3">
        <div className="container mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-bold">Trail Assistant</h1>
            <p className="text-xs text-muted-foreground">
              {isOnline ? 'Mount Kalisungan Expert' : '📴 Offline Mode • Local Knowledge Base'}
            </p>
          </div>
        </div>
      </div>

      {!isOnline && (
        <div className="bg-accent/30 border-b border-accent/40 px-4 py-2 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <WifiOff className="h-3 w-3" /> Offline — using local knowledge base
            {getCacheSize() > 0 && ` (${getCacheSize()} learned responses cached)`}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="container max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
              <img src={logo} alt="Mt. Kalisungan logo" className="h-16 w-16 rounded-full object-cover mx-auto mb-4 bg-white/5" />
              <h2 className="text-xl font-bold mb-2">Ask About Mount Kalisungan</h2>
              <p className="text-muted-foreground text-sm mb-8">Get trail info, safety tips, weather updates, and more.</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {QUICK_QUESTIONS.map((q) => (
                  <Button key={q} variant="outline" size="sm" className="text-xs" onClick={() => send(q)}>
                    <Sparkles className="h-3 w-3 mr-1" /> {q}
                  </Button>
                ))}
              </div>
            </motion.div>
          )}

          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'glass-card rounded-bl-sm'
                }`}
              >
                {m.role === 'assistant' ? (
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
              </div>
            </motion.div>
          ))}

          {loading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="glass-card-strong border-t border-border/30 px-4 py-3">
        <form
          className="container max-w-3xl mx-auto flex gap-2"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about trails, weather, safety..."
            className="flex-1"
            disabled={loading}
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
