import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import CertificateCom from "@/app/members/components/MemberPdf/CertificateCom";
import { getTrustServer } from "../db/trustServer";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(req) {
  try {
    const { memberData,memberProgram } = await req.json();

    // Trust header / logos come from Settings → Trust Details
    const trust = await getTrustServer({ withImages: true });

    // ✅ CORRECT BUFFER
    const buffer = await renderToBuffer(
      <CertificateCom
        data={memberData}
        memberProgram={memberProgram}
        trust={trust}
      />
    );

    // 🔍 Debug (optional)
    console.log("PDF buffer size:", buffer.length);

    return NextResponse.json(
      {
        base64: buffer.toString("base64"),
      },
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    console.error("PDF generation error:", error);

    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500, headers: corsHeaders }
    );
  }
}
