import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

  try {
    const { to, subject, html, text, guestName }: EmailRequest = await req.json();
    
    console.log("Sending email to:", to.length, "recipients. Subject:", subject);

    const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gmailPassword) {
      console.error("Gmail app password not configured");
      throw new Error("Gmail app password not configured");
    }

    // Prepare email content
    let emailContent = html || text || "";
    
    // Replace template variables if guestName is provided
    if (guestName) {
      emailContent = emailContent.replace(/\{guestName\}/g, guestName);
      emailContent = emailContent.replace(/\{guest_name\}/g, guestName);
      emailContent = emailContent.replace(/\{GUEST_NAME\}/g, guestName);
    }

    console.log("Connecting to Gmail SMTP server...");

    // Initialize SMTP client
    const client = new SMTPClient();

    // Connect to Gmail SMTP
    await client.connectTLS({
      hostname: "smtp.gmail.com",
      port: 587,
      username: "steinbockchalets@gmail.com",
      password: gmailPassword,
    });

    console.log("Connected to Gmail SMTP. Sending email...");

    // Send email to all recipients
    for (const recipient of to) {
      try {
        await client.send({
          from: "steinbockchalets@gmail.com",
          to: recipient,
          subject: subject,
          content: text || emailContent,
          html: html ? emailContent : undefined,
        });
        console.log(`Email sent successfully to: ${recipient}`);
      } catch (error) {
        console.error(`Failed to send email to ${recipient}:`, error);
        throw error;
      }
    }

    // Close connection
    await client.close();
    console.log("SMTP connection closed");

    const emailResults = {
      success: true, 
      messageId: `msg_${Date.now()}`,
      method: "Gmail SMTP",
      recipients: to.length,
      from: "steinbockchalets@gmail.com",
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
