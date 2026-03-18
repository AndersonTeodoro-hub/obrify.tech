import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://ufolqxrxiiiygcosucft.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmb2xxeHJ4aWlpeWdjb3N1Y2Z0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NzQ4OTMsImV4cCI6MjA4OTM1MDg5M30.UCHBO7lPd2aw0iynGi32ESax_1OCDvrG5H7uswdrlVk";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
