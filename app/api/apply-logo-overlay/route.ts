import { NextResponse } from "next/server";
import sharp from "sharp";

export const maxDuration = 120;

type LogoOverlayInput = {
  enabled?: boolean;
  fileUrl?: string;
  assetName?: string;
  xPercent?: number;
  yPercent?: number;
  widthPercent?: number;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Error desconocido al aplicar logo.";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

async function fetchImageBuffer(url: string, label: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`No pudimos descargar ${label}.`);
  }

  return Buffer.from(await response.arrayBuffer());
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

async function applyLogoOverlayToImage(imageUrl: string, logoOverlay: LogoOverlayInput) {
  if (!logoOverlay.enabled || !logoOverlay.fileUrl) {
    throw new Error("Selecciona un logo para aplicar sobre la imagen.");
  }

  const baseBuffer = await fetchImageBuffer(imageUrl, "la imagen generada");
  const baseMetadata = await sharp(baseBuffer).metadata();
  const baseWidth = baseMetadata.width || 1024;
  const baseHeight = baseMetadata.height || 1024;

  const logoBuffer = await fetchImageBuffer(logoOverlay.fileUrl, "el logo oficial");
  const transparentLogoBuffer = await makeLogoBackgroundTransparent(logoBuffer);
  const widthPercent = clampNumber(logoOverlay.widthPercent, 6, 60, 20);
  const xPercent = clampNumber(logoOverlay.xPercent, 0, 100, 50);
  const yPercent = clampNumber(logoOverlay.yPercent, 0, 100, 88);
  const targetLogoWidth = Math.round(baseWidth * (widthPercent / 100));
  const resizedLogoBuffer = await sharp(transparentLogoBuffer)
    .resize({ width: targetLogoWidth, withoutEnlargement: true })
    .png()
    .toBuffer();

  const logoMetadata = await sharp(resizedLogoBuffer).metadata();
  const logoWidth = logoMetadata.width || targetLogoWidth;
  const logoHeight = logoMetadata.height || Math.round(targetLogoWidth * 0.4);

  const centerX = Math.round(baseWidth * (xPercent / 100));
  const centerY = Math.round(baseHeight * (yPercent / 100));
  const left = Math.min(baseWidth - logoWidth, Math.max(0, centerX - Math.round(logoWidth / 2)));
  const top = Math.min(baseHeight - logoHeight, Math.max(0, centerY - Math.round(logoHeight / 2)));

  const compositedBuffer = await sharp(baseBuffer)
    .composite([{ input: resizedLogoBuffer, left, top }])
    .png()
    .toBuffer();

  return compositedBuffer.toString("base64");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
    const logoOverlay = body.logoOverlay && typeof body.logoOverlay === "object"
      ? (body.logoOverlay as LogoOverlayInput)
      : null;

    if (!imageUrl) {
      return NextResponse.json({ error: "Falta la imagen generada." }, { status: 400 });
    }

    if (!logoOverlay?.enabled || !logoOverlay.fileUrl) {
      return NextResponse.json({ error: "Selecciona un logo para aplicar." }, { status: 400 });
    }

    const imageBase64 = await applyLogoOverlayToImage(imageUrl, logoOverlay);

    return NextResponse.json({
      imageBase64,
      logoOverlayApplied: true,
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    console.error("apply-logo-overlay error", error);

    return NextResponse.json(
      { error: errorMessage || "Error al aplicar el logo." },
      { status: 500 },
    );
  }
}
