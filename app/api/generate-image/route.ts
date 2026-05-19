import OpenAI from "openai";
import { NextResponse } from "next/server";

export const maxDuration = 300;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ReferenceImageInput = {
  url?: string;
  name?: string;
};

type SupportedOpenAIImageSize = "1024x1024" | "1024x1536" | "1536x1024";
type SupportedGeminiAspectRatio = "1:1" | "4:5" | "9:16" | "16:9";

type GeminiReferencePart = {
  inline_data: {
    mime_type: string;
    data: string;
  };
};

function mapOpenAISize(format?: string): SupportedOpenAIImageSize {
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

function sanitizeFileName(name: string, index: number, mimeType: string) {
  const cleanBase = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (/\.(png|jpe?g|webp)$/i.test(cleanBase)) {
    return cleanBase;
  }

  const extension = mimeType.includes("webp")
    ? "webp"
    : mimeType.includes("jpeg") || mimeType.includes("jpg")
      ? "jpg"
      : "png";

  return `${cleanBase || `reference-${index + 1}`}.${extension}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const possibleMessage = (error as { message?: unknown }).message;
    if (typeof possibleMessage === "string") {
      return possibleMessage;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return "Error desconocido del proveedor.";
    }
  }

  return "Error desconocido del proveedor.";
}

async function fetchReferenceImagesForOpenAI(referenceImages: ReferenceImageInput[]) {
  const supportedUploads: File[] = [];

  for (const [index, referenceImage] of referenceImages.slice(0, 6).entries()) {
    const url = typeof referenceImage.url === "string" ? referenceImage.url : "";

    if (!url) continue;

    const response = await fetch(url);

    if (!response.ok) {
      console.warn("Skipping reference image that could not be fetched", url);
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    const isSupportedImage =
      contentType.includes("image/png") ||
      contentType.includes("image/jpeg") ||
      contentType.includes("image/jpg") ||
      contentType.includes("image/webp");

    if (!isSupportedImage) {
      console.warn("Skipping unsupported reference image type", contentType);
      continue;
    }

    const imageBuffer = await response.arrayBuffer();
    const fileName = sanitizeFileName(
      referenceImage.name || `reference-${index + 1}`,
      index,
      contentType,
    );

    supportedUploads.push(new File([imageBuffer], fileName, { type: contentType }));
  }

  return supportedUploads;
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

async function generateOpenAIReferenceBasedVariants({
  uploads,
  prompt,
  size,
  variantCount,
}: {
  uploads: File[];
  prompt: string;
  size: SupportedOpenAIImageSize;
  variantCount: number;
}) {
  const imagesBase64: string[] = [];

  for (let index = 0; index < variantCount; index += 1) {
    const editResult = await openai.images.edit({
      model: "gpt-image-1",
      image: uploads,
      prompt,
      size,
      n: 1,
      input_fidelity: "high",
    });

    const imageBase64 = editResult.data?.[0]?.b64_json;

    if (imageBase64) {
      imagesBase64.push(imageBase64);
    }
  }

  return imagesBase64;
}

async function generateWithOpenAI({
  prompt,
  format,
  variantCount,
  referenceImages,
}: {
  prompt: string;
  format?: string;
  variantCount: number;
  referenceImages: ReferenceImageInput[];
}) {
  const uploads = await fetchReferenceImagesForOpenAI(referenceImages);
  const size = mapOpenAISize(format);

  const imagesBase64 = uploads.length > 0
    ? await generateOpenAIReferenceBasedVariants({ uploads, prompt, size, variantCount })
    : (
        await openai.images.generate({
          model: "gpt-image-1",
          prompt,
          size,
          n: variantCount,
        })
      ).data
        ?.map((image) => image.b64_json)
        .filter((imageBase64): imageBase64 is string => Boolean(imageBase64)) ?? [];

  return {
    imagesBase64,
    executedModel: "gpt-image-1",
    generationMode: uploads.length > 0 ? "visual-references" : "text-only",
    usedReferenceImageCount: uploads.length,
  };
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

  if (!apiKey) {
    throw new Error("Falta configurar GEMINI_API_KEY en Vercel y en .env.local.");
  }

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
            parts: [{ text: prompt }, ...referenceParts],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
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
        : "Gemini no pudo generar la imagen.";
    throw new Error(message);
  }

  const parts = payload?.candidates?.[0]?.content?.parts;
  const imagePart = Array.isArray(parts)
    ? parts.find((part) => part?.inlineData?.data || part?.inline_data?.data)
    : null;

  const imageBase64 = imagePart?.inlineData?.data || imagePart?.inline_data?.data;

  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    throw new Error("Gemini respondió, pero no devolvió una imagen utilizable.");
  }

  return imageBase64;
}

async function generateWithNanoBananaPro({
  prompt,
  format,
  variantCount,
  referenceImages,
}: {
  prompt: string;
  format?: string;
  variantCount: number;
  referenceImages: ReferenceImageInput[];
}) {
  const referenceParts = await fetchReferenceImagesForGemini(referenceImages);
  const aspectRatio = mapGeminiAspectRatio(format);
  const imagesBase64: string[] = [];

  // The current UI option "Nano Banana" is intentionally routed to
  // Gemini 3 Pro Image Preview because it is the strongest Google image option for polished commercial artwork.
  const geminiModel = "gemini-3-pro-image-preview";

  for (let index = 0; index < variantCount; index += 1) {
    const imageBase64 = await generateOneGeminiImage({
      prompt,
      model: geminiModel,
      aspectRatio,
      referenceParts,
    });

    imagesBase64.push(imageBase64);
  }

  return {
    imagesBase64,
    executedModel: geminiModel,
    generationMode: referenceParts.length > 0 ? "visual-references" : "text-only",
    usedReferenceImageCount: referenceParts.length,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const format = typeof body.format === "string" ? body.format : "square-post";
    const selectedModel = typeof body.model === "string" ? body.model : "auto";
    const variantCount = normalizeVariantCount(body.variantCount);
    const referenceImages = Array.isArray(body.referenceImages)
      ? (body.referenceImages as ReferenceImageInput[])
      : [];

    if (!prompt.trim()) {
      return NextResponse.json({ error: "Falta el prompt." }, { status: 400 });
    }

    const result = selectedModel === "nano-banana"
      ? await generateWithNanoBananaPro({ prompt, format, variantCount, referenceImages })
      : await generateWithOpenAI({ prompt, format, variantCount, referenceImages });

    if (!result.imagesBase64.length) {
      return NextResponse.json(
        { error: "No se recibió ninguna imagen del proveedor." },
        { status: 500 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    console.error("generate-image error", error);

    return NextResponse.json(
      { error: errorMessage || "Error al generar la imagen." },
      { status: 500 },
    );
  }
}
