-- Supabase Schema for Election Results

-- 1. Create the election_results table
CREATE TABLE IF NOT EXISTS public.election_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    polling_unit_id TEXT NOT NULL,
    election_type TEXT NOT NULL,
    results_json JSONB NOT NULL,
    total_valid INTEGER NOT NULL DEFAULT 0,
    total_rejected INTEGER NOT NULL DEFAULT 0,
    total_cast INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    agent_id UUID,
    tags TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'verified',
    state_id INTEGER,
    local_governments_id INTEGER,
    wards_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Add some indexes for performance
CREATE INDEX IF NOT EXISTS idx_election_results_polling_unit_id ON public.election_results (polling_unit_id);
CREATE INDEX IF NOT EXISTS idx_election_results_election_type ON public.election_results (election_type);
CREATE INDEX IF NOT EXISTS idx_election_results_status ON public.election_results (status);

-- 3. Setup Row Level Security (RLS)
ALTER TABLE public.election_results ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (agents) to insert their own results
CREATE POLICY insert_own_results ON public.election_results
    FOR INSERT
    WITH CHECK (auth.uid() = agent_id);

-- Allow users to read results
CREATE POLICY read_all_results ON public.election_results
    FOR SELECT
    USING (true);

-- 4. Create the storage bucket for form images
-- Run this manually in Supabase SQL Editor if storage RPC fails:
INSERT INTO storage.buckets (id, name, public) 
VALUES ('election-results', 'election-results', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage Security Policies for election-results bucket
CREATE POLICY "Agents can upload form images" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'election-results');

CREATE POLICY "Anyone can view form images" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'election-results');
