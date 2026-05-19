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

type SupportedImageSize = "1024x1024" | "1024x1536" | "1536x1024";

function mapSize(format?: string): SupportedImageSize {
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

async function fetchReferenceImages(referenceImages: ReferenceImageInput[]) {
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

async function generateReferenceBasedVariants({
  uploads,
  prompt,
  size,
  variantCount,
}: {
  uploads: File[];
  prompt: string;
  size: SupportedImageSize;
  variantCount: number;
}) {
  const imagesBase64: string[] = [];

  // For reference-image workflows, running one edit request per variant is more reliable
  // than asking a single edit request for multiple outputs.
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const format = typeof body.format === "string" ? body.format : "square-post";
    const variantCount = normalizeVariantCount(body.variantCount);
    const referenceImages = Array.isArray(body.referenceImages)
      ? (body.referenceImages as ReferenceImageInput[])
      : [];

    if (!prompt.trim()) {
      return NextResponse.json({ error: "Falta el prompt." }, { status: 400 });
    }

    const uploads = await fetchReferenceImages(referenceImages);
    const size = mapSize(format);

    const imagesBase64 = uploads.length > 0
      ? await generateReferenceBasedVariants({ uploads, prompt, size, variantCount })
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

    if (!imagesBase64.length) {
      return NextResponse.json(
        { error: "No se recibió ninguna imagen del proveedor." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      imagesBase64,
      executedModel: "gpt-image-1",
      generationMode: uploads.length > 0 ? "visual-references" : "text-only",
      usedReferenceImageCount: uploads.length,
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
