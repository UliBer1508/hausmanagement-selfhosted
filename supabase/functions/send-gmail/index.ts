import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  guestName?: string;
}

interface EmailSettings {
  email: string;
  display_name: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Gmail SMTP function called");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  // Require authenticated admin
  const authError = await requireAdmin(req, corsHeaders);
  if (authError) return authError;

  try {
    const { to, subject, html, text, guestName }: EmailRequest = await req.json();
    
    // Validate and normalize 'to' field
    if (!to || (Array.isArray(to) && to.length === 0)) {
      throw new Error("No recipients specified");
    }

    // Ensure 'to' is always an array
    const recipients = Array.isArray(to) ? to : [to];

    // Validate email addresses
    const validEmails = recipients.filter(email => 
      typeof email === 'string' && 
      email.includes('@') && 
      email.length > 3
    );

    if (validEmails.length === 0) {
      throw new Error("No valid email addresses found");
    }

    console.log(`Sending email to: ${validEmails.length} recipients. Subject: ${subject}`);

    const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gmailPassword) {
      console.error("Gmail app password not configured");
      throw new Error("Gmail app password not configured");
    }

    // Load email settings from database
    let emailAddress = "steinbockchalets@gmail.com";
    let displayName = "Steinbock Chalets";

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        const { data: settings, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'email_settings')
          .maybeSingle();
        
        if (!error && settings?.value) {
          const emailSettings = settings.value as EmailSettings;
          if (emailSettings.email) {
            emailAddress = emailSettings.email;
          }
          if (emailSettings.display_name) {
            displayName = emailSettings.display_name;
          }
          console.log(`Loaded email settings from DB: ${displayName} <${emailAddress}>`);
        } else {
          console.log("Using default email settings (not found in DB)");
        }
      }
    } catch (dbError) {
      console.warn("Could not load email settings from DB, using defaults:", dbError);
    }

    // Prepare email content
    let emailContent = html || text || "";
    
    // Replace template variables if guestName is provided
    if (guestName) {
      emailContent = emailContent.replace(/\{guestName\}/g, guestName);
      emailContent = emailContent.replace(/\{guest_name\}/g, guestName);
      emailContent = emailContent.replace(/\{GUEST_NAME\}/g, guestName);
    }

    console.log("Creating Gmail transporter...");
    
    // Create nodemailer transporter for Gmail
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // use TLS
      auth: {
        user: emailAddress,
        pass: gmailPassword,
      },
    });

    console.log("Sending emails...");

    // Send email to all recipients
    for (const recipient of validEmails) {
      try {
        const info = await transporter.sendMail({
          from: `"${displayName}" <${emailAddress}>`,
          replyTo: emailAddress,
          to: recipient,
          subject: subject,
          text: html ? undefined : emailContent,
          html: html ? emailContent : undefined,
        });
        console.log(`Email sent successfully to: ${recipient}`, info.messageId);
      } catch (error) {
        console.error(`Failed to send email to ${recipient}:`, error);
        throw error;
      }
    }

    // Nodemailer doesn't need explicit close
    console.log("All emails sent successfully");

    const emailResults = {
      success: true, 
      messageId: `msg_${Date.now()}`,
      method: "Gmail SMTP",
      recipients: validEmails.length,
      from: emailAddress,
      displayName: displayName,
      subject: subject,
      timestamp: new Date().toISOString()
    };

    console.log("Email sent successfully:", emailResults);

    return new Response(JSON.stringify(emailResults), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Error sending email:", error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
