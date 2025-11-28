// Supabase Edge Function for sending order confirmation emails via Resend
// Deploy this to Supabase: https://supabase.com/dashboard/project/gnjbkeagaephrllajddp/functions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "admin@skarduorganic.com";
const SITE_URL = Deno.env.get("SITE_URL") || "https://skarduorganic.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  image?: string;
}

interface ShippingAddress {
  firstName?: string;
  lastName?: string;
  address: string;
  city: string;
  postalCode: string;
  phone: string;
}

interface OrderEmailRequest {
  to: string;
  orderId: string;
  customerName: string;
  orderItems: OrderItem[];
  shippingAddress: ShippingAddress;
  shippingMethod: string;
  paymentMethod: string;
  subtotal: number;
  shippingCost: number;
  total: number;
  sendAdminCopy?: boolean;
}

// Retry helper function
async function sendEmailWithRetry(emailPayload: object, maxRetries = 3): Promise<{ success: boolean; data?: any; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify(emailPayload),
      });

      const data = await res.json();

      if (res.ok) {
        return { success: true, data };
      }

      // If rate limited, wait and retry
      if (res.status === 429 && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      return { success: false, error: data.message || 'Failed to send email' };
    } catch (err: any) {
      if (attempt === maxRetries) {
        return { success: false, error: err.message };
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}

// Generate customer email HTML
function generateCustomerEmailHtml(data: OrderEmailRequest): string {
  const { orderId, customerName, orderItems, shippingAddress, shippingMethod, paymentMethod, subtotal, shippingCost, total } = data;
  
  const orderDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Calculate estimated delivery
  const deliveryDays = shippingMethod.includes('Express') ? '1-2' : '4-5';
  const estimatedDelivery = new Date();
  estimatedDelivery.setDate(estimatedDelivery.getDate() + (shippingMethod.includes('Express') ? 2 : 5));
  const estimatedDeliveryStr = estimatedDelivery.toLocaleDateString('en-US', { 
    weekday: 'long',
    year: 'numeric', 
    month: 'long', 
    day: 'numeric'
  });

  const itemsHtml = orderItems.map(item => `
    <tr>
      <td style="padding: 16px 12px; border-bottom: 1px solid #e5e7eb;">
        <div style="display: flex; align-items: center;">
          <span style="font-weight: 500; color: #1A3C34;">${item.name}</span>
        </div>
      </td>
      <td style="padding: 16px 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #6b7280;">${item.quantity}</td>
      <td style="padding: 16px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151;">Rs ${item.price.toLocaleString()}</td>
      <td style="padding: 16px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #1A3C34;">Rs ${(item.price * item.quantity).toLocaleString()}</td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Order Confirmation - Skardu Organics</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1A3C34 0%, #2d5a4e 100%); padding: 40px 30px; text-align: center;">
      <h1 style="color: #C8A165; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">Skardu Organics</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0; font-size: 14px; font-weight: 400;">100% Natural & Organic Products from the Himalayas</p>
    </div>

    <!-- Success Banner -->
    <div style="background-color: #dcfce7; padding: 24px; text-align: center; border-bottom: 3px solid #22c55e;">
      <div style="width: 64px; height: 64px; background-color: #22c55e; border-radius: 50%; margin: 0 auto 16px; line-height: 64px;">
        <span style="color: white; font-size: 32px;">✓</span>
      </div>
      <h2 style="color: #166534; margin: 0; font-size: 24px; font-weight: 700;">Thanks for your order!</h2>
      <p style="color: #15803d; margin: 8px 0 0 0; font-size: 15px;">We've received your order and will begin processing it right away.</p>
    </div>

    <!-- Content -->
    <div style="padding: 40px 30px;">
      
      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        Hi <strong>${customerName}</strong>,<br><br>
        Thank you for shopping with Skardu Organics! Your order has been confirmed and will be on its way soon.
      </p>

      <!-- Order Info Cards -->
      <div style="display: flex; gap: 12px; margin-bottom: 32px;">
        <div style="flex: 1; background-color: #f8f9fa; border-radius: 12px; padding: 20px; border-left: 4px solid #C8A165;">
          <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px 0;">Order Number</p>
          <p style="color: #1A3C34; font-size: 18px; font-weight: 700; margin: 0;">#${orderId}</p>
        </div>
      </div>

      <!-- Order Details Table -->
      <div style="background-color: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <table style="width: 100%; border-spacing: 0;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Order Date:</td>
            <td style="padding: 8px 0; text-align: right; color: #1A3C34; font-weight: 500;">${orderDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Payment Method:</td>
            <td style="padding: 8px 0; text-align: right; color: #1A3C34; font-weight: 500;">${paymentMethod}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Shipping Method:</td>
            <td style="padding: 8px 0; text-align: right; color: #1A3C34; font-weight: 500;">${shippingMethod}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Estimated Delivery:</td>
            <td style="padding: 8px 0; text-align: right; color: #22c55e; font-weight: 600;">${estimatedDeliveryStr}</td>
          </tr>
        </table>
      </div>

      <!-- Order Items -->
      <h3 style="color: #1A3C34; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">Order Items</h3>
      <div style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #1A3C34;">
              <th style="padding: 14px 12px; text-align: left; color: #ffffff; font-weight: 600; font-size: 13px;">Product</th>
              <th style="padding: 14px 12px; text-align: center; color: #ffffff; font-weight: 600; font-size: 13px;">Qty</th>
              <th style="padding: 14px 12px; text-align: right; color: #ffffff; font-weight: 600; font-size: 13px;">Price</th>
              <th style="padding: 14px 12px; text-align: right; color: #ffffff; font-weight: 600; font-size: 13px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>

      <!-- Order Summary -->
      <div style="background: linear-gradient(135deg, #1A3C34 0%, #2d5a4e 100%); border-radius: 12px; padding: 24px; margin-bottom: 32px;">
        <table style="width: 100%;">
          <tr>
            <td style="padding: 8px 0; color: rgba(255,255,255,0.8); font-size: 14px;">Subtotal:</td>
            <td style="padding: 8px 0; text-align: right; color: #ffffff;">Rs ${subtotal.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: rgba(255,255,255,0.8); font-size: 14px;">Shipping:</td>
            <td style="padding: 8px 0; text-align: right; color: ${shippingCost === 0 ? '#22c55e' : '#ffffff'};">${shippingCost === 0 ? 'FREE' : `Rs ${shippingCost.toLocaleString()}`}</td>
          </tr>
          <tr style="border-top: 1px solid rgba(255,255,255,0.2);">
            <td style="padding: 16px 0 8px 0; color: #C8A165; font-size: 18px; font-weight: 700;">Total:</td>
            <td style="padding: 16px 0 8px 0; text-align: right; color: #C8A165; font-size: 20px; font-weight: 700;">Rs ${total.toLocaleString()}</td>
          </tr>
        </table>
      </div>

      <!-- Shipping Address -->
      <h3 style="color: #1A3C34; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">📦 Shipping Address</h3>
      <div style="background-color: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 32px; border-left: 4px solid #C8A165;">
        <p style="margin: 0; color: #374151; line-height: 1.8; font-size: 15px;">
          <strong>${shippingAddress.firstName || ''} ${shippingAddress.lastName || ''}</strong><br>
          ${shippingAddress.address}<br>
          ${shippingAddress.city}, ${shippingAddress.postalCode}<br>
          Pakistan<br>
          📞 ${shippingAddress.phone}
        </p>
      </div>

      <!-- What's Next -->
      <div style="background-color: #fef3c7; border-radius: 12px; padding: 24px; margin-bottom: 32px; border: 1px solid #fcd34d;">
        <h4 style="color: #92400e; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">📋 What happens next?</h4>
        <ol style="margin: 0; padding-left: 20px; color: #78350f; font-size: 14px; line-height: 1.8;">
          <li>We'll prepare your order for shipping</li>
          <li>You'll receive a shipping confirmation with tracking details</li>
          <li>Your order will arrive within ${deliveryDays} business days</li>
        </ol>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin-bottom: 32px;">
        <a href="${SITE_URL}/#/orders" style="display: inline-block; background-color: #C8A165; color: #1A3C34; padding: 16px 40px; border-radius: 50px; text-decoration: none; font-weight: 700; font-size: 16px; box-shadow: 0 4px 14px rgba(200,161,101,0.4);">
          Track Your Order
        </a>
      </div>

      <!-- Support -->
      <div style="text-align: center; padding-top: 24px; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0;">Need help with your order?</p>
        <p style="margin: 0;">
          <a href="mailto:support@skarduorganic.com" style="color: #C8A165; font-weight: 600; text-decoration: none;">support@skarduorganic.com</a>
          <span style="color: #d1d5db; margin: 0 8px;">|</span>
          <a href="https://wa.me/923488875456" style="color: #22c55e; font-weight: 600; text-decoration: none;">WhatsApp</a>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #1A3C34; padding: 32px; text-align: center;">
      <p style="color: #C8A165; margin: 0 0 8px 0; font-size: 18px; font-weight: 700;">Skardu Organics</p>
      <p style="color: rgba(255,255,255,0.6); margin: 0 0 16px 0; font-size: 13px;">
        Bringing nature's finest to your doorstep
      </p>
      <p style="color: rgba(255,255,255,0.5); margin: 0 0 16px 0; font-size: 12px; line-height: 1.6;">
        Office 403, 4th floor, Building Park Lane<br>
        E 11/2 Islamabad, Pakistan
      </p>
      <div style="margin-bottom: 16px;">
        <a href="${SITE_URL}" style="color: #C8A165; text-decoration: none; font-size: 13px; margin: 0 8px;">Website</a>
        <span style="color: rgba(255,255,255,0.3);">|</span>
        <a href="https://instagram.com/skarduorganics" style="color: #C8A165; text-decoration: none; font-size: 13px; margin: 0 8px;">Instagram</a>
        <span style="color: rgba(255,255,255,0.3);">|</span>
        <a href="https://facebook.com/skarduorganics" style="color: #C8A165; text-decoration: none; font-size: 13px; margin: 0 8px;">Facebook</a>
      </div>
      <p style="color: rgba(255,255,255,0.4); margin: 0; font-size: 11px;">
        © ${new Date().getFullYear()} Skardu Organics. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
`;
}

// Generate admin notification email HTML
function generateAdminEmailHtml(data: OrderEmailRequest): string {
  const { orderId, customerName, to, orderItems, shippingAddress, shippingMethod, paymentMethod, subtotal, shippingCost, total } = data;
  
  const orderDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const itemsHtml = orderItems.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">Rs ${item.price.toLocaleString()}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">Rs ${(item.price * item.quantity).toLocaleString()}</td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Order Received - #${orderId}</title>
</head>
<body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <div style="background-color: #1A3C34; padding: 24px; text-align: center;">
      <h1 style="color: #C8A165; margin: 0; font-size: 20px;">🛒 New Order Received!</h1>
    </div>

    <div style="padding: 30px;">
      <div style="background-color: #dcfce7; padding: 16px; border-radius: 8px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; color: #166534; font-size: 24px; font-weight: bold;">Order #${orderId}</p>
        <p style="margin: 8px 0 0 0; color: #15803d;">${orderDate}</p>
      </div>

      <!-- Customer Info -->
      <h3 style="color: #1A3C34; margin: 0 0 12px 0; border-bottom: 2px solid #C8A165; padding-bottom: 8px;">Customer Details</h3>
      <table style="width: 100%; margin-bottom: 24px;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Name:</td>
          <td style="padding: 8px 0; font-weight: bold;">${customerName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Email:</td>
          <td style="padding: 8px 0;"><a href="mailto:${to}" style="color: #1A3C34;">${to}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Phone:</td>
          <td style="padding: 8px 0;"><a href="tel:${shippingAddress.phone}" style="color: #1A3C34;">${shippingAddress.phone}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Address:</td>
          <td style="padding: 8px 0;">${shippingAddress.address}, ${shippingAddress.city}, ${shippingAddress.postalCode}</td>
        </tr>
      </table>

      <!-- Order Info -->
      <h3 style="color: #1A3C34; margin: 0 0 12px 0; border-bottom: 2px solid #C8A165; padding-bottom: 8px;">Order Information</h3>
      <table style="width: 100%; margin-bottom: 24px;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Payment:</td>
          <td style="padding: 8px 0; font-weight: bold;">${paymentMethod}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Shipping:</td>
          <td style="padding: 8px 0; font-weight: bold;">${shippingMethod}</td>
        </tr>
      </table>

      <!-- Items -->
      <h3 style="color: #1A3C34; margin: 0 0 12px 0; border-bottom: 2px solid #C8A165; padding-bottom: 8px;">Order Items</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="padding: 12px; text-align: left;">Product</th>
            <th style="padding: 12px; text-align: center;">Qty</th>
            <th style="padding: 12px; text-align: right;">Price</th>
            <th style="padding: 12px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- Totals -->
      <div style="background-color: #1A3C34; padding: 20px; border-radius: 8px; color: white;">
        <table style="width: 100%;">
          <tr>
            <td style="padding: 4px 0;">Subtotal:</td>
            <td style="padding: 4px 0; text-align: right;">Rs ${subtotal.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0;">Shipping:</td>
            <td style="padding: 4px 0; text-align: right;">${shippingCost === 0 ? 'FREE' : `Rs ${shippingCost.toLocaleString()}`}</td>
          </tr>
          <tr style="border-top: 1px solid rgba(255,255,255,0.3);">
            <td style="padding: 12px 0 0 0; font-size: 20px; font-weight: bold; color: #C8A165;">TOTAL:</td>
            <td style="padding: 12px 0 0 0; text-align: right; font-size: 20px; font-weight: bold; color: #C8A165;">Rs ${total.toLocaleString()}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f3f4f6; padding: 16px; text-align: center;">
      <p style="margin: 0; color: #6b7280; font-size: 12px;">
        This is an automated notification from Skardu Organics
      </p>
    </div>
  </div>
</body>
</html>
`;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const requestData: OrderEmailRequest = await req.json();
    const { to, orderId, customerName } = requestData;

    // Validate required fields
    if (!to || !orderId || !customerName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, orderId, customerName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { customer?: any; admin?: any; errors: string[] } = { errors: [] };

    // Send customer confirmation email
    const customerEmailHtml = generateCustomerEmailHtml(requestData);
    const customerResult = await sendEmailWithRetry({
      from: "Skardu Organics <orders@skarduorganic.com>",
      to: [to],
      subject: `Order Confirmed! 🎉 #${orderId} | Skardu Organics`,
      html: customerEmailHtml,
    });

    if (customerResult.success) {
      results.customer = customerResult.data;
      console.log(`✅ Customer email sent to ${to} for order #${orderId}`);
    } else {
      results.errors.push(`Customer email failed: ${customerResult.error}`);
      console.error(`❌ Customer email failed for order #${orderId}:`, customerResult.error);
    }

    // Send admin notification email
    if (ADMIN_EMAIL && requestData.sendAdminCopy !== false) {
      const adminEmailHtml = generateAdminEmailHtml(requestData);
      const adminResult = await sendEmailWithRetry({
        from: "Skardu Organics Orders <orders@skarduorganic.com>",
        to: [ADMIN_EMAIL],
        subject: `🛒 New Order #${orderId} - Rs ${requestData.total.toLocaleString()} | ${customerName}`,
        html: adminEmailHtml,
      });

      if (adminResult.success) {
        results.admin = adminResult.data;
        console.log(`✅ Admin notification sent for order #${orderId}`);
      } else {
        results.errors.push(`Admin email failed: ${adminResult.error}`);
        console.error(`❌ Admin email failed for order #${orderId}:`, adminResult.error);
      }
    }

    // Return response
    const success = results.customer !== undefined;
    return new Response(
      JSON.stringify({
        success,
        message: success ? "Order confirmation email sent successfully" : "Failed to send emails",
        data: results,
      }),
      {
        status: success ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Edge function error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
