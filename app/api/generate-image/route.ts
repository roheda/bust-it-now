import { NextResponse } from "next/server";
import sharp from "sharp";

export const maxDuration = 300;

type ReferenceImageInput = {
  url?: string;
  name?: string;
};

type LogoOverlayInput = {
  enabled?: boolean;
  fileUrl?: string;
  assetName?: string;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "bottom-center";
  size?: "small" | "medium" | "large";
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
  "gemini-2.5-flash-image": "Gemini 2.5 Flash Imagen · fallback interno",
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
    case "gemini-3.1-flash-image":
      return "gemini-3.1-flash-image";
    case "gemini-3-pro-image":
    case "nano-banana":
    case "draft-mini-low":
    case "gpt-image":
    default:
      return "gemini-3-pro-image";
  }
}

function getGeminiModelCandidates(selectedModel?: string) {
  const normalizedModel = normalizeSelectedGeminiModel(selectedModel);
  const fallbackModels = [
    normalizedModel,
    normalizedModel === "gemini-3-pro-image" ? "gemini-3.1-flash-image" : "gemini-3-pro-image",
    "gemini-2.5-flash-image",
  ];

  return Array.from(new Set([process.env.GEMINI_IMAGE_MODEL, ...fallbackModels].filter(Boolean))) as string[];
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

async function fetchImageBuffer(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("No pudimos descargar el logo oficial para colocarlo como capa fija.");
  }

  return Buffer.from(await response.arrayBuffer());
}

function getLogoTargetWidth(baseWidth: number, size?: string) {
  switch (size) {
    case "small":
      return Math.round(baseWidth * 0.14);
    case "large":
      return Math.round(baseWidth * 0.28);
    case "medium":
    default:
      return Math.round(baseWidth * 0.2);
  }
}

function getLogoPosition({
  baseWidth,
  baseHeight,
  logoWidth,
  logoHeight,
  position,
}: {
  baseWidth: number;
  baseHeight: number;
  logoWidth: number;
  logoHeight: number;
  position?: string;
}) {
  const margin = Math.round(Math.min(baseWidth, baseHeight) * 0.055);

  switch (position) {
    case "top-left":
      return { left: margin, top: margin };
    case "top-right":
      return { left: baseWidth - logoWidth - margin, top: margin };
    case "bottom-left":
      return { left: margin, top: baseHeight - logoHeight - margin };
    case "bottom-center":
      return {
        left: Math.round((baseWidth - logoWidth) / 2),
        top: baseHeight - logoHeight - margin,
      };
    case "bottom-right":
    default:
      return {
        left: baseWidth - logoWidth - margin,
        top: baseHeight - logoHeight - margin,
      };
  }
}

async function makeLogoBackgroundTransparent(logoBuffer: Buffer) {
  const normalizedLogo = sharp(logoBuffer).ensureAlpha().png();
  const metadata = await normalizedLogo.metadata();
  const width = metadata.width || 1;
  const height = metadata.height || 1;
  const rawBuffer = await normalizedLogo.raw().toBuffer();

  for (let index = 0; index < rawBuffer.length; index += 4) {
    const red = rawBuffer[index];
    const green = rawBuffer[index + 1];
    const blue = rawBuffer[index + 2];
    const alpha = rawBuffer[index + 3];
    const isNearWhite = red >= 245 && green >= 245 && blue >= 245;
    const isVeryLight = red >= 238 && green >= 238 && blue >= 238;

    if (alpha > 0 && (isNearWhite || isVeryLight)) {
      rawBuffer[index + 3] = 0;
    }
  }

  return sharp(rawBuffer, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

async function applyLogoOverlayToImage(imageBase64: string, logoOverlay?: LogoOverlayInput) {
  if (!logoOverlay?.enabled || !logoOverlay.fileUrl) return imageBase64;

  const baseBuffer = Buffer.from(imageBase64, "base64");
  const baseMetadata = await sharp(baseBuffer).metadata();
  const baseWidth = baseMetadata.width || 1024;
  const baseHeight = baseMetadata.height || 1024;

  const logoBuffer = await fetchImageBuffer(logoOverlay.fileUrl);
  const transparentLogoBuffer = await makeLogoBackgroundTransparent(logoBuffer);
  const targetLogoWidth = getLogoTargetWidth(baseWidth, logoOverlay.size);
  const resizedLogoBuffer = await sharp(transparentLogoBuffer)
    .resize({ width: targetLogoWidth, withoutEnlargement: true })
    .png()
    .toBuffer();

  const logoMetadata = await sharp(resizedLogoBuffer).metadata();
  const logoWidth = logoMetadata.width || targetLogoWidth;
  const logoHeight = logoMetadata.height || Math.round(targetLogoWidth * 0.4);
  const position = getLogoPosition({
    baseWidth,
    baseHeight,
    logoWidth,
    logoHeight,
    position: logoOverlay.position,
  });

  const compositedBuffer = await sharp(baseBuffer)
    .composite([{ input: resizedLogoBuffer, left: position.left, top: position.top }])
    .png()
    .toBuffer();

  return compositedBuffer.toString("base64");
}

async function applyLogoOverlayToImages(imagesBase64: string[], logoOverlay?: LogoOverlayInput) {
  if (!logoOverlay?.enabled || !logoOverlay.fileUrl) return imagesBase64;

  const processedImages: string[] = [];
  for (const imageBase64 of imagesBase64) {
    processedImages.push(await applyLogoOverlayToImage(imageBase64, logoOverlay));
  }

  return processedImages;
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
  const geminiModels = getGeminiModelCandidates(selectedModel);
  let executedModel = geminiModels[0] || "gemini-3-pro-image";
  let lastError: unknown = null;

  for (let index = 0; index < variantCount; index += 1) {
    let generatedImage = "";

    for (const geminiModel of geminiModels) {
      try {
        generatedImage = await generateOneGeminiImage({
          prompt,
          model: geminiModel,
          aspectRatio,
          referenceParts,
        });
        executedModel = geminiModel;
        break;
      } catch (error) {
        lastError = error;
        console.warn(`Gemini image model failed: ${geminiModel}`, error);
      }
    }

    if (!generatedImage) {
      throw new Error(
        getErrorMessage(lastError) ||
          "Gemini no devolvió imagen. Intenta con Gemini Pro Imagen o revisa GEMINI_API_KEY.",
      );
    }

    imagesBase64.push(generatedImage);
  }

  return {
    imagesBase64,
    executedModel,
    requestedModelLabel: geminiModelLabels[normalizeSelectedGeminiModel(selectedModel)] || normalizeSelectedGeminiModel(selectedModel),
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
    const logoOverlay = body.logoOverlay && typeof body.logoOverlay === "object"
      ? (body.logoOverlay as LogoOverlayInput)
      : undefined;

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

    const imagesBase64 = await applyLogoOverlayToImages(result.imagesBase64, logoOverlay);

    return NextResponse.json({
      ...result,
      imagesBase64,
      logoOverlayApplied: logoOverlay?.enabled === true,
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
