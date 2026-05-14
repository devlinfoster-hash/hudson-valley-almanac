import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://cntafkasuhnpdlhdwajm.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_rV-JfhGjoG1s0XEu4_7Mog_Ct2bVLeI'

export const supabase = createClient(supabaseUrl, supabaseKey)
