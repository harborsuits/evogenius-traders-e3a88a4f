import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action } = await req.json()
    
    console.log(`[system-control] Received action: ${action}`)

    // Validate action
    const validActions = ['start', 'pause', 'stop']
    if (!validActions.includes(action)) {
      console.error(`[system-control] Invalid action: ${action}`)
      return new Response(
        JSON.stringify({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Map action to status
    const statusMap: Record<string, string> = {
      start: 'running',
      pause: 'paused',
      stop: 'stopped',
    }
    const newStatus = statusMap[action]

    console.log(`[system-control] Updating system_state to: ${newStatus}`)

    // Update system state
    const { data, error } = await supabase
      .from('system_state')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .select()
      .single()

    if (error) {
      console.error(`[system-control] Database error:`, error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[system-control] Success. New status: ${data.status}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        status: data.status,
        message: `System ${action === 'start' ? 'started' : action === 'pause' ? 'paused' : 'stopped'}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error(`[system-control] Unexpected error:`, err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
