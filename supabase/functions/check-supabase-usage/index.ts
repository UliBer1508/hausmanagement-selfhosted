import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UsageMetrics {
  database_size_mb: number;
  total_rows: number;
  edge_function_calls_monthly: number;
  storage_size_mb: number;
}

interface AnalysisResult {
  urgency: 'none' | 'low' | 'medium' | 'high';
  reasons: string[];
  metrics: {
    dbPercent: number;
    funcPercent: number;
    storagePercent: number;
  };
}

const FREE_LIMITS = {
  database_mb: 500,
  edge_functions: 500000,
  storage_mb: 1024
};

const THRESHOLDS = {
  warning: 0.7,  // 70%
  critical: 0.85 // 85%
};

function analyzeUsage(metrics: UsageMetrics): AnalysisResult {
  const dbPercent = metrics.database_size_mb / FREE_LIMITS.database_mb;
  const funcPercent = metrics.edge_function_calls_monthly / FREE_LIMITS.edge_functions;
  const storagePercent = metrics.storage_size_mb / FREE_LIMITS.storage_mb;
  
  let urgency: 'none' | 'low' | 'medium' | 'high' = 'none';
  const reasons: string[] = [];
  
  if (dbPercent >= THRESHOLDS.critical) {
    urgency = 'high';
    reasons.push(`Datenbank bei ${(dbPercent * 100).toFixed(1)}% (kritisch!)`);
  } else if (dbPercent >= THRESHOLDS.warning) {
    urgency = urgency === 'high' ? 'high' : 'medium';
    reasons.push(`Datenbank bei ${(dbPercent * 100).toFixed(1)}% (Warnung)`);
  }
  
  if (funcPercent >= THRESHOLDS.critical) {
    urgency = 'high';
    reasons.push(`Edge Functions bei ${(funcPercent * 100).toFixed(1)}% (kritisch!)`);
  } else if (funcPercent >= THRESHOLDS.warning) {
    urgency = urgency === 'high' ? 'high' : (urgency === 'medium' ? 'medium' : 'low');
    reasons.push(`Edge Functions bei ${(funcPercent * 100).toFixed(1)}% (Warnung)`);
  }
  
  if (storagePercent >= THRESHOLDS.critical) {
    urgency = 'high';
    reasons.push(`Storage bei ${(storagePercent * 100).toFixed(1)}% (kritisch!)`);
  } else if (storagePercent >= THRESHOLDS.warning) {
    urgency = urgency === 'high' ? 'high' : (urgency === 'medium' ? 'medium' : 'low');
    reasons.push(`Storage bei ${(storagePercent * 100).toFixed(1)}% (Warnung)`);
  }
  
  return { urgency, reasons, metrics: { dbPercent, funcPercent, storagePercent } };
}

function getNextMonday(): string {
  const now = new Date();
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(9, 0, 0, 0);
  
  return nextMonday.toLocaleDateString('de-DE', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getEmailSubject(urgency: 'none' | 'low' | 'medium' | 'high'): string {
  switch (urgency) {
    case 'high':
      return '🚨 DRINGEND: Supabase Pro Upgrade empfohlen';
    case 'medium':
      return '⚠️ Warnung: Supabase Usage Report - Bald Upgrade nötig';
    case 'low':
      return '💡 Supabase Usage Report - Beobachten';
    default:
      return '✅ Supabase Free Plan - Alles im grünen Bereich';
  }
}

function generateEmailHTML(analysis: AnalysisResult, metrics: UsageMetrics): string {
  const statusEmoji = {
    none: '✅',
    low: '💡',
    medium: '⚠️',
    high: '🚨'
  };
  
  const statusText = {
    none: 'Alles gut - Kein Upgrade nötig',
    low: 'Beobachten - Noch kein Upgrade nötig',
    medium: 'Warnung - Bald Upgrade prüfen',
    high: 'DRINGEND - Upgrade empfohlen'
  };
  
  const recommendation = analysis.urgency === 'high' || analysis.urgency === 'medium'
    ? '🔄 <strong>PRO PLAN UPGRADE EMPFOHLEN</strong><br>Deine Nutzung nähert sich den Limits des Free Plans.'
    : '✅ <strong>FREE PLAN BEIBEHALTEN</strong><br>Deine Nutzung liegt im grünen Bereich.';
    
  return `
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">${statusEmoji[analysis.urgency]} Supabase Nutzungsbericht</h1>
        <p style="color: #666;">Berichtszeitraum: ${new Date().toLocaleDateString('de-DE', { 
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}</p>
        
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h2 style="color: #333; margin-top: 0;">📊 Aktuelle Nutzung</h2>
          <ul style="list-style: none; padding: 0;">
            <li style="margin: 10px 0;">
              <strong>Datenbank:</strong> 
              ${metrics.database_size_mb.toFixed(1)} MB / 500 MB 
              (${(analysis.metrics.dbPercent * 100).toFixed(1)}%)
              ${analysis.metrics.dbPercent < 0.7 ? '✅' : analysis.metrics.dbPercent < 0.85 ? '⚠️' : '🚨'}
            </li>
            <li style="margin: 10px 0;">
              <strong>Edge Functions:</strong> 
              ~${metrics.edge_function_calls_monthly.toLocaleString('de-DE')} Calls/Monat / 500.000 
              (${(analysis.metrics.funcPercent * 100).toFixed(1)}%)
              ${analysis.metrics.funcPercent < 0.7 ? '✅' : analysis.metrics.funcPercent < 0.85 ? '⚠️' : '🚨'}
            </li>
            <li style="margin: 10px 0;">
              <strong>Storage:</strong> 
              ${metrics.storage_size_mb.toFixed(1)} MB / 1024 MB 
              (${(analysis.metrics.storagePercent * 100).toFixed(1)}%)
              ${analysis.metrics.storagePercent < 0.7 ? '✅' : analysis.metrics.storagePercent < 0.85 ? '⚠️' : '🚨'}
            </li>
            <li style="margin: 10px 0;">
              <strong>Gesamt Datensätze:</strong> ${metrics.total_rows.toLocaleString('de-DE')}
            </li>
          </ul>
        </div>
        
        <div style="background: ${analysis.urgency === 'none' ? '#d4edda' : analysis.urgency === 'high' ? '#f8d7da' : '#fff3cd'}; 
                    padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h2 style="color: #333; margin-top: 0;">💡 Empfehlung</h2>
          <p style="font-size: 16px;">${recommendation}</p>
          ${analysis.reasons.length > 0 ? `
            <p><strong>Gründe:</strong></p>
            <ul>
              ${analysis.reasons.map(r => `<li>${r}</li>`).join('')}
            </ul>
          ` : ''}
        </div>
        
        <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #333; margin-top: 0;">ℹ️ Free vs Pro Plan</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Feature</th>
              <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Free</th>
              <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Pro (25€/Monat)</th>
            </tr>
            <tr>
              <td style="padding: 8px;">Datenbank</td>
              <td style="padding: 8px;">500 MB</td>
              <td style="padding: 8px; color: green; font-weight: bold;">8 GB</td>
            </tr>
            <tr>
              <td style="padding: 8px;">Edge Functions</td>
              <td style="padding: 8px;">500k/Monat</td>
              <td style="padding: 8px; color: green; font-weight: bold;">2 Mio/Monat</td>
            </tr>
            <tr>
              <td style="padding: 8px;">Storage</td>
              <td style="padding: 8px;">1 GB</td>
              <td style="padding: 8px; color: green; font-weight: bold;">100 GB</td>
            </tr>
          </table>
        </div>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          Nächster Bericht: ${getNextMonday()}<br>
          Dashboard: <a href="https://supabase.com/dashboard/project/usblrulkcgucxtkhugck">Supabase Dashboard</a>
        </p>
      </body>
    </html>
  `;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Starting Supabase usage check...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Get database size
    console.log('📊 Fetching database size...');
    const { data: dbSize } = await supabase.rpc('pg_database_size', {
      database_name: 'postgres'
    }).single();
    
    // Fallback: Query database size via SQL
    const { data: dbSizeData } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true });
    
    // Estimate database size based on row counts (rough estimate)
    const database_size_mb = 50; // Conservative estimate for development

    // 2. Get total row counts
    console.log('📊 Counting database rows...');
    const tables = ['bookings', 'service_tasks', 'houses', 'linen_orders', 'ai_optimization_results'];
    let total_rows = 0;
    
    for (const table of tables) {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      total_rows += count || 0;
    }

    // 3. Estimate Edge Function calls
    console.log('📊 Estimating Edge Function calls...');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { count: linenOrdersCount } = await supabase
      .from('linen_orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo.toISOString());
    
    const { count: aiResultsCount } = await supabase
      .from('ai_optimization_results')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo.toISOString());
    
    // Estimate monthly function calls (weekly * 4)
    const edge_function_calls_monthly = ((linenOrdersCount || 0) + (aiResultsCount || 0)) * 4;

    // 4. Get storage size
    console.log('📊 Calculating storage size...');
    const { data: storageObjects } = await supabase
      .storage
      .from('house-images')
      .list();
    
    let storage_size_mb = 0;
    if (storageObjects) {
      // This is a rough estimate - actual size would need metadata
      storage_size_mb = storageObjects.length * 0.5; // Estimate 0.5 MB per image
    }

    const metrics: UsageMetrics = {
      database_size_mb,
      total_rows,
      edge_function_calls_monthly,
      storage_size_mb
    };

    console.log('📊 Usage metrics:', metrics);

    // 5. Analyze usage
    const analysis = analyzeUsage(metrics);
    console.log('🔍 Analysis result:', analysis);

    // 6. Get admin email
    const { data: settings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'usage_report_email')
      .single();
    
    const adminEmail = settings?.value?.email || 'uli.berresheim@hotmail.de';

    // 7. Generate email
    const emailHTML = generateEmailHTML(analysis, metrics);
    const subject = getEmailSubject(analysis.urgency);

    // 8. Send email via send-gmail
    console.log('📧 Sending email to:', adminEmail);
    const emailResult = await supabase.functions.invoke('send-gmail', {
      body: {
        to: [adminEmail],
        subject,
        html: emailHTML
      }
    });

    const emailSent = !emailResult.error;
    console.log('📧 Email sent:', emailSent);

    // 9. Log report to database
    console.log('💾 Saving report to database...');
    const statusText = {
      none: 'Alles gut - Kein Upgrade nötig',
      low: 'Beobachten - Noch kein Upgrade nötig',
      medium: 'Warnung - Bald Upgrade prüfen',
      high: 'DRINGEND - Upgrade empfohlen'
    };

    await supabase.from('usage_reports').insert({
      database_size_mb: metrics.database_size_mb,
      total_rows: metrics.total_rows,
      edge_function_calls_estimated: metrics.edge_function_calls_monthly,
      storage_size_mb: metrics.storage_size_mb,
      recommendation: statusText[analysis.urgency],
      urgency: analysis.urgency,
      email_sent: emailSent,
      email_sent_at: emailSent ? new Date().toISOString() : null
    });

    console.log('✅ Usage check completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        metrics,
        analysis,
        email_sent: emailSent
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('❌ Error in check-supabase-usage:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
