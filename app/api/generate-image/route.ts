import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function mapSize(format?: string) {
  switch (format) {
    case "instagram-story":
    case "reel-cover":
      return "1024x1536";
    case "ad-creative":
      return "1536x1024";
    case "instagram-post":
    case "square-post":
    default:
      return "1024x1024";
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const format = typeof body.format === "string" ? body.format : "square-post";

    if (!prompt.trim()) {
      return NextResponse.json({ error: "Falta el prompt." }, { status: 400 });
    }

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: mapSize(format) as "1024x1024" | "1024x1536" | "1536x1024",
    });

    const imageBase64 = result.data?.[0]?.b64_json;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "No se recibió imagen del proveedor." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      imageBase64,
      executedModel: "gpt-image-1",
    });
  } catch (error) {
    console.error("generate-image error", error);

    return NextResponse.json(
      { error: "Error al generar la imagen." },
      { status: 500 },
    );
  }
}
