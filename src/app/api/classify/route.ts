import { NextResponse } from "next/server";
import { classifyMail } from "@/lib/classifier";

export async function POST(request: Request) {
  const body = await request.json();
  const result = classifyMail({
    sender: body.sender ?? "",
    email: body.email ?? "",
    subject: body.subject ?? "",
    snippet: body.snippet ?? "",
  });

  return NextResponse.json(result);
}
