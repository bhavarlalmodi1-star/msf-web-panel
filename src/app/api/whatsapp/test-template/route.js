// POST /api/whatsapp/test-template
// Sends the Gupshup "thankyou_msg" template to a single test phone number.
// Body: { phone: "9876543210", params: ["val1", "val2", "val3"] }

import { NextResponse } from 'next/server';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';

const GUPSHUP_API_KEY   = process.env.WHATSAPP_API_KEY;
const SOURCE_NO         = process.env.SOURCE_NO_WHATSAPP;     // e.g. 919227105345
const SRC_NAME          = process.env.SRC_NAME_WHATSAPP;      // e.g. ssgmswhatsapp
const TEMPLATE_ID       = '793e49f8-143b-407f-9071-3dea44b8f407';
const TEMPLATE_NAME     = 'thankyou_msg';

export async function POST(req) {
  try {
    // Auth check
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const { phone, params = [] } = await req.json();

    if (!phone)
      return NextResponse.json({ success: false, message: 'Phone number is required' }, { status: 400 });

    // Normalise phone — strip non-digits, add 91 country code if not present
    const digits = phone.replace(/\D/g, '');
    const destination = digits.startsWith('91') ? digits : `91${digits}`;

    if (destination.length < 12)
      return NextResponse.json({ success: false, message: 'Invalid phone number (need 10-digit Indian mobile)' }, { status: 400 });

    // Build Gupshup template payload
    const templatePayload = JSON.stringify({
      id:     TEMPLATE_ID,
      params: params.map(p => String(p || '')),
    });

    const body = new URLSearchParams({
      channel:     'whatsapp',
      source:      SOURCE_NO,
      destination,
      'src.name':  SRC_NAME,
      template:    templatePayload,
    });

    console.log(`[TestTemplate] Sending ${TEMPLATE_NAME} to ${destination} with params:`, params);

    const gupshupRes = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
      method:  'POST',
      headers: {
        'apikey':       GUPSHUP_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control':'no-cache',
      },
      body: body.toString(),
    });

    const responseText = await gupshupRes.text();
    let responseData;
    try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }

    console.log(`[TestTemplate] Gupshup response (${gupshupRes.status}):`, responseData);

    if (!gupshupRes.ok || responseData?.status === 'error') {
      return NextResponse.json({
        success: false,
        message: responseData?.message || `Gupshup error (${gupshupRes.status})`,
        gupshupResponse: responseData,
      }, { status: 502 });
    }

    return NextResponse.json({
      success:          true,
      message:          `Test message sent to ${destination}`,
      templateName:     TEMPLATE_NAME,
      templateId:       TEMPLATE_ID,
      destination,
      params,
      gupshupResponse:  responseData,
    });

  } catch (error) {
    console.error('test-template error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
