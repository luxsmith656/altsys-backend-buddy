import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Send, Bot, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

type Msg = { role: 'user' | 'assistant'; content: string };

export default function OpsAIPage() {
  const { user, role } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ops-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ message: text, conversation_id: conversationId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Request failed');
      setConversationId(j.conversation_id);
      setMessages((m) => [...m, { role: 'assistant', content: j.reply }]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return <div className="min-h-screen pt-20 px-4 text-center text-muted-foreground">Please sign in.</div>;
  }

  return (
    <div className="min-h-screen pt-20 px-4 pb-6 max-w-3xl mx-auto flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" /> Operations Assistant
        </h1>
        <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          Role-aware ({role}). Reads only filtered operational data — no payments or PII.
        </p>
      </div>

      <Card className="glass-card flex-1 flex flex-col">
        <CardHeader>
          <CardTitle className="text-base">Ask about today's bookings, capacity, weather, schedules</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-3 min-h-[60vh]">
          <div ref={scroller} className="flex-1 overflow-y-auto space-y-3 pr-1">
            {messages.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8">
                Try: "How full are we tomorrow?" • "Will weather impact today's hikes?" • "Which location has spare capacity this week?"
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`rounded-xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-primary/15 ml-auto max-w-[85%]' : 'bg-secondary/40 max-w-[90%]'}`}>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {loading && (
              <div className="bg-secondary/40 rounded-xl px-3 py-2 text-sm max-w-[60%] flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Ask about operations…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
              disabled={loading}
            />
            <Button onClick={send} disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
