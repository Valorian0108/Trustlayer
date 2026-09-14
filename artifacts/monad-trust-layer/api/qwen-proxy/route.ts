import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const { message, tools, model } = await req.json();

    // Get API key from environment variables
    const apiKey = process.env.BITGET_QWEN_API_KEY || process.env.VITE_BITGET_QWEN_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'BITGET_QWEN_API_KEY not configured in environment variables' },
        { status: 500 }
      );
    }

    // Call Bitget Qwen API from server-side (no CORS)
    const response = await fetch('https://hackathon.bitgetops.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'qwen3.8-max',
        messages: message,
        tools: tools,
        tool_choice: 'auto',
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bitget API error:', response.status, errorText);
      return NextResponse.json(
        { error: `Bitget API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error('Qwen proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to call Qwen API', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}