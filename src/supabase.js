
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = "https://afbgcdasawgfjqrezrak.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmYmdjZGFzYXdnZmpxcmV6cmFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NjExNTQsImV4cCI6MjA4OTUzNzE1NH0.BbTNl1M12D26dcjT3B5ZnZJ7GthuimGUB-iHrU6Jfvw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);