-- AI access audit metadata. Values are deliberately limited to authorization
-- facts; tool parameters are redacted by the edge functions before logging.
ALTER TABLE public.ai_tool_logs
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS row_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denied_reason text,
  ADD COLUMN IF NOT EXISTS location_scope jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS ai_tool_logs_user_created_idx
  ON public.ai_tool_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_tool_logs_tool_created_idx
  ON public.ai_tool_logs(tool_name, created_at DESC);
