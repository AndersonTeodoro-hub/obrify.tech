import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://xwodfkscsdcgpblbnxhd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3b2Rma3Njc2RjZ3BibGJueGhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwODMzNDUsImV4cCI6MjA4NDY1OTM0NX0.lH2vvh2n0UbRO8IxTlPSa224uksCRiJjjDBB8UsUVi8";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
