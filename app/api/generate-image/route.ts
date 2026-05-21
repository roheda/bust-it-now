import OpenAI from "openai";
import { NextResponse } from "next/server";
import sharp from "sharp";

export const maxDuration = 300;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
      contentType.includes("image/webp") ||
      contentType.includes("image/svg+xml");

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
  if (!logoOverlay?.enabled || !logoOverlay.fileUrl) {
    return imageBase64;
  }

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
    .composite([
      {
        input: resizedLogoBuffer,
        left: position.left,
        top: position.top,
      },
    ])
    .png()
    .toBuffer();

  return compositedBuffer.toString("base64");
}

async function applyLogoOverlayToImages(imagesBase64: string[], logoOverlay?: LogoOverlayInput) {
  if (!logoOverlay?.enabled || !logoOverlay.fileUrl) {
    return imagesBase64;
  }

  const processedImages: string[] = [];

  for (const imageBase64 of imagesBase64) {
    processedImages.push(await applyLogoOverlayToImage(imageBase64, logoOverlay));
  }

  return processedImages;
}

async function generateOpenAIReferenceBasedVariants({
  uploads,
  prompt,
  size,
  variantCount,
  model,
  quality,
  inputFidelity,
}: {
  uploads: File[];
  prompt: string;
  size: SupportedOpenAIImageSize;
  variantCount: number;
  model: "gpt-image-1" | "gpt-image-1-mini";
  quality: "low" | "medium";
  inputFidelity: "low" | "high";
}) {
  const imagesBase64: string[] = [];

  for (let index = 0; index < variantCount; index += 1) {
    const editResult = await openai.images.edit({
      model,
      image: uploads,
      prompt,
      size,
      n: 1,
      quality,
      input_fidelity: inputFidelity,
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
  model,
  quality,
  inputFidelity,
}: {
  prompt: string;
  format?: string;
  variantCount: number;
  referenceImages: ReferenceImageInput[];
  model: "gpt-image-1" | "gpt-image-1-mini";
  quality: "low" | "medium";
  inputFidelity: "low" | "high";
}) {
  const uploads = await fetchReferenceImagesForOpenAI(referenceImages);
  const size = mapOpenAISize(format);

  const imagesBase64 = uploads.length > 0
    ? await generateOpenAIReferenceBasedVariants({
        uploads,
        prompt,
        size,
        variantCount,
        model,
        quality,
        inputFidelity,
      })
    : (
        await openai.images.generate({
          model,
          prompt,
          size,
          n: variantCount,
          quality,
        })
      ).data
        ?.map((image) => image.b64_json)
        .filter((imageBase64): imageBase64 is string => Boolean(imageBase64)) ?? [];

  return {
    imagesBase64,
    executedModel: `${model}:${quality}`,
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
    const selectedModel = typeof body.model === "string" ? body.model : "draft-mini-low";
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

    const result = selectedModel === "nano-banana"
      ? await generateWithNanoBananaPro({ prompt, format, variantCount, referenceImages })
      : selectedModel === "draft-mini-low"
        ? await generateWithOpenAI({
            prompt,
            format,
            variantCount,
            referenceImages,
            model: "gpt-image-1-mini",
            quality: "low",
            inputFidelity: "low",
          })
        : await generateWithOpenAI({
            prompt,
            format,
            variantCount,
            referenceImages,
            model: "gpt-image-1",
            quality: "medium",
            inputFidelity: "high",
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
