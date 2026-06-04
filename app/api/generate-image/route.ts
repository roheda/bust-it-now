import { NextResponse } from "next/server";

export const maxDuration = 300;

type ReferenceImageInput = {
  url?: string;
  name?: string;
};

type SupportedGeminiAspectRatio = "1:1" | "4:5" | "9:16" | "16:9";

type GeminiReferencePart = {
  inline_data: {
    mime_type: string;
    data: string;
  };
};

const geminiModelLabels: Record<string, string> = {
  "gemini-3-pro-image": "Gemini Pro Imagen · profesional · aprox $2.50 MXN/img",
  "gemini-3.1-flash-image": "Gemini 3.1 Flash Imagen · balanceado · aprox $1.90 MXN/img",
  "gemini-2.5-flash-image": "Gemini 2.5 Flash Imagen · rápido · aprox $1.20 MXN/img",
  "nano-banana": "Gemini Pro Imagen · profesional · aprox $2.50 MXN/img",
  "draft-mini-low": "Gemini Pro Imagen · profesional · aprox $2.50 MXN/img",
  "gpt-image": "Gemini Pro Imagen · profesional · aprox $2.50 MXN/img",
};

function mapGeminiAspectRatio(format?: string): SupportedGeminiAspectRatio {
  switch (format) {
    case "instagram-post":
      return "4:5";
    case "instagram-story":
    case "reel-cover":
      return "9:16";
    case "ad-creative":
      return "16:9";
    case "square-post":
    default:
      return "1:1";
  }
}

function normalizeVariantCount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (parsed === 2 || parsed === 4) return parsed;
  return 1;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (error && typeof error === "object") {
    const possibleMessage = (error as { message?: unknown }).message;
    if (typeof possibleMessage === "string") return possibleMessage;

    try {
      return JSON.stringify(error);
    } catch {
      return "Error desconocido del proveedor.";
    }
  }

  return "Error desconocido del proveedor.";
}

function normalizeSelectedGeminiModel(model?: string) {
  switch (model) {
    case "gemini-3-pro-image":
    case "gemini-3.1-flash-image":
    case "gemini-2.5-flash-image":
      return model;
    case "nano-banana":
    case "draft-mini-low":
    case "gpt-image":
    default:
      return "gemini-3-pro-image";
  }
}

async function fetchReferenceImagesForGemini(referenceImages: ReferenceImageInput[]) {
  const referenceParts: GeminiReferencePart[] = [];

  for (const referenceImage of referenceImages.slice(0, 6)) {
    const url = typeof referenceImage.url === "string" ? referenceImage.url : "";
    if (!url) continue;

    const response = await fetch(url);
    if (!response.ok) {
      console.warn("Skipping Gemini reference image that could not be fetched", url);
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    const isSupportedImage =
      contentType.includes("image/png") ||
      contentType.includes("image/jpeg") ||
      contentType.includes("image/jpg") ||
      contentType.includes("image/webp");

    if (!isSupportedImage) {
      console.warn("Skipping unsupported Gemini reference image type", contentType);
      continue;
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());

    referenceParts.push({
      inline_data: {
        mime_type: contentType,
        data: imageBuffer.toString("base64"),
      },
    });
  }

  return referenceParts;
}

function buildGeminiPrompt(prompt: string) {
  const trimmedPrompt = prompt.trim();
  const maxPromptLength = 12000;
  const safePrompt = trimmedPrompt.length > maxPromptLength
    ? trimmedPrompt.slice(0, maxPromptLength)
    : trimmedPrompt;

  return `Generate exactly one finished commercial social media image.
Do not answer with text only.
Do not describe the image.
Return an actual generated image as the primary response.
Important: if the brief mentions a logo overlay, do not create the logo. Leave clean space only. The logo will be applied later by the system.
Follow this creative brief:

${safePrompt}`;
}

function extractGeminiText(parts: unknown[]) {
  return parts
    .map((part) => {
      if (part && typeof part === "object" && "text" in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

async function generateOneGeminiImage({
  prompt,
  model,
  aspectRatio,
  referenceParts,
}: {
  prompt: string;
  model: string;
  aspectRatio: SupportedGeminiAspectRatio;
  referenceParts: GeminiReferencePart[];
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta configurar GEMINI_API_KEY en Vercel y en .env.local.");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildGeminiPrompt(prompt) }, ...referenceParts],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio,
            imageSize: "2K",
          },
        },
      }),
    },
  );

  const payload = await response.json();

  if (!response.ok) {
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : `Gemini no pudo generar la imagen con ${model}.`;
    throw new Error(message);
  }

  const parts = payload?.candidates?.[0]?.content?.parts;
  const normalizedParts = Array.isArray(parts) ? parts : [];
  const imagePart = normalizedParts.find((part) => part?.inlineData?.data || part?.inline_data?.data);
  const imageBase64 = imagePart?.inlineData?.data || imagePart?.inline_data?.data;

  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    const responseText = extractGeminiText(normalizedParts);
    const finishReason = payload?.candidates?.[0]?.finishReason;
    const shortResponseText = responseText ? ` Respuesta textual: ${responseText.slice(0, 240)}` : "";
    const finishReasonText = typeof finishReason === "string" ? ` Motivo: ${finishReason}.` : "";

    throw new Error(
      `Gemini respondió sin imagen utilizable con ${model}.${finishReasonText}${shortResponseText}`,
    );
  }

  return imageBase64;
}

async function generateWithGemini({
  prompt,
  format,
  variantCount,
  referenceImages,
  selectedModel,
}: {
  prompt: string;
  format?: string;
  variantCount: number;
  referenceImages: ReferenceImageInput[];
  selectedModel?: string;
}) {
  const referenceParts = await fetchReferenceImagesForGemini(referenceImages);
  const aspectRatio = mapGeminiAspectRatio(format);
  const imagesBase64: string[] = [];
  const model = normalizeSelectedGeminiModel(selectedModel);

  for (let index = 0; index < variantCount; index += 1) {
    const generatedImage = await generateOneGeminiImage({
      prompt,
      model,
      aspectRatio,
      referenceParts,
    });

    imagesBase64.push(generatedImage);
  }

  return {
    imagesBase64,
    executedModel: model,
    requestedModelLabel: geminiModelLabels[model] || model,
    generationMode: referenceParts.length > 0 ? "visual-references" : "text-only",
    usedReferenceImageCount: referenceParts.length,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const format = typeof body.format === "string" ? body.format : "square-post";
    const selectedModel = typeof body.model === "string" ? body.model : "gemini-3-pro-image";
    const variantCount = normalizeVariantCount(body.variantCount);
    const referenceImages = Array.isArray(body.referenceImages)
      ? (body.referenceImages as ReferenceImageInput[])
      : [];

    if (!prompt.trim()) {
      return NextResponse.json({ error: "Falta el prompt." }, { status: 400 });
    }

    const result = await generateWithGemini({
      prompt,
      format,
      variantCount,
      referenceImages,
      selectedModel,
    });

    if (!result.imagesBase64.length) {
      return NextResponse.json(
        { error: "No se recibió ninguna imagen del proveedor." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ...result,
      logoOverlayApplied: false,
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    console.error("generate-image error", error);

    return NextResponse.json(
      { error: errorMessage || "Error al generar la imagen." },
      { status: 500 },
    );
  }
}
