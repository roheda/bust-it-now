import { NextResponse } from "next/server";
import sharp from "sharp";

export const maxDuration = 120;

type LogoOverlayInput = {
  enabled?: boolean;
  fileUrl?: string;
  assetName?: string;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "bottom-center";
  size?: "small" | "medium" | "large";
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Error desconocido al aplicar logo.";
}

async function fetchImageBuffer(url: string, label: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`No pudimos descargar ${label}.`);
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

async function applyLogoOverlayToImage(imageUrl: string, logoOverlay: LogoOverlayInput) {
  if (!logoOverlay.enabled || !logoOverlay.fileUrl) {
    throw new Error("Este request no tiene logo configurado para overlay.");
  }

  const baseBuffer = await fetchImageBuffer(imageUrl, "la imagen generada");
  const baseMetadata = await sharp(baseBuffer).metadata();
  const baseWidth = baseMetadata.width || 1024;
  const baseHeight = baseMetadata.height || 1024;

  const logoBuffer = await fetchImageBuffer(logoOverlay.fileUrl, "el logo oficial");
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
      return NextResponse.json({ error: "No hay logo configurado para aplicar." }, { status: 400 });
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
