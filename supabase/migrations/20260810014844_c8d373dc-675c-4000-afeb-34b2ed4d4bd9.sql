CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.kb_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  source text NOT NULL DEFAULT 'manual',
  content text NOT NULL,
  content_hash text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kb_chunks_hash_idx ON public.kb_chunks (content_hash);

GRANT SELECT ON public.kb_chunks TO authenticated;
GRANT SELECT ON public.kb_chunks TO anon;
GRANT ALL ON public.kb_chunks TO service_role;

ALTER TABLE public.kb_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Knowledge base is readable by everyone" ON public.kb_chunks;
CREATE POLICY "Knowledge base is readable by everyone"
ON public.kb_chunks FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage knowledge base" ON public.kb_chunks;
CREATE POLICY "Admins manage knowledge base"
ON public.kb_chunks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx
  ON public.kb_chunks USING hnsw (embedding vector_cosine_ops);

DROP TRIGGER IF EXISTS kb_chunks_updated ON public.kb_chunks;
CREATE TRIGGER kb_chunks_updated BEFORE UPDATE ON public.kb_chunks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.match_kb_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 6,
  min_similarity float DEFAULT 0.15
)
RETURNS TABLE (id uuid, title text, category text, content text, similarity float)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.title, c.category, c.content,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.kb_chunks c
  WHERE c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 12);
$$;

GRANT EXECUTE ON FUNCTION public.match_kb_chunks(vector, int, float) TO service_role;