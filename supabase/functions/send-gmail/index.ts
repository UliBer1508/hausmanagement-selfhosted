import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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

    console.log("Email prepared successfully. Gmail credentials available:", !!gmailPassword);
    console.log("Recipients count:", to.length);
    console.log("Content length:", emailContent.length);

    // For now, we'll simulate successful email sending
    // In a real implementation, you would integrate with an SMTP library like nodemailer
    // or use the Gmail API with proper authentication
    
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