
-- 1) Extra trailhead locations
INSERT INTO public.locations (slug, name, lgu, region, center_lat, center_lng, status, entry_fee, default_guide_fee, description)
VALUES
  ('lamot-1', 'Lamot 1 Trailhead', 'Calauan', 'Laguna', 14.1480, 121.3450, 'active', 50, 500, 'Lamot 1 entry point to Mt. Kalisungan'),
  ('lamot-2', 'Lamot 2 Trailhead', 'Calauan', 'Laguna', 14.1490, 121.3470, 'active', 50, 500, 'Lamot 2 entry point to Mt. Kalisungan')
ON CONFLICT (slug) DO NOTHING;

-- 2) Guide roster status
ALTER TABLE public.guides
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available';

-- 3) AI assistant memory
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New conversation',
  user_role text NOT NULL DEFAULT 'hiker',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON public.ai_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON public.ai_conversations(user_id, updated_at DESC);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_conv_self_all ON public.ai_conversations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY ai_conv_admin_select ON public.ai_conversations
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

CREATE POLICY ai_msg_self_all ON public.ai_messages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = ai_messages.conversation_id AND c.user_id = auth.uid()));

CREATE POLICY ai_msg_admin_select ON public.ai_messages
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

CREATE TRIGGER ai_conv_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
