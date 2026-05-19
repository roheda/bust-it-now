export type BuildPromptInput = {
  clientName?: string;
  clientIndustry?: string;
  format?: string;
  goal?: string;
  contentType?: string;
  mainMessage?: string;
  copy?: {
    headline?: string;
    subheadline?: string;
    cta?: string;
    priceOrOffer?: string;
  };
  selectedEmotions?: string[];
  selectedVisualElements?: string[];
  specificInstructions?: string;
  brandBrainSnapshot?: {
    brandDescription?: string;
    tone?: string;
    colors?: string[];
    typography?: string;
    visualStyle?: string[];
    dos?: string[];
    donts?: string[];
    recommendedModels?: string[];
  };
  selectedAssetsSnapshot?: Array<{
    name?: string;
    type?: string;
    category?: string;
    notes?: string;
    tags?: string[];
    fileUrl?: string;
  }>;
};

function formatLabel(format?: string) {
  const map: Record<string, string> = {
    "instagram-post": "Instagram post vertical 4:5",
    "instagram-story": "Instagram story 9:16",
    "square-post": "Square post 1:1",
    "reel-cover": "Reel cover vertical",
    "ad-creative": "Advertising creative",
  };

  return map[format || ""] || format || "Social media creative";
}

function goalLabel(goal?: string) {
  const map: Record<string, string> = {
    sell: "sell",
    inform: "inform",
    announce: "announce",
    position: "position the brand",
    interaction: "generate interaction",
    trust: "build trust",
  };

  return map[goal || ""] || goal || "communicate clearly";
}

export function buildGenerationPrompt(data: BuildPromptInput) {
  const assetsText =
    data.selectedAssetsSnapshot?.length
      ? data.selectedAssetsSnapshot
          .map((asset, index) => {
            const tags = asset.tags?.length ? ` Tags: ${asset.tags.join(", ")}.` : "";
            const notes = asset.notes ? ` Notes: ${asset.notes}.` : "";
            return `${index + 1}. ${asset.name || "Asset"} (${asset.type || "asset"}${
              asset.category ? ` / ${asset.category}` : ""
            }).${tags}${notes}`;
          })
          .join("\n")
      : "No specific visual assets selected.";

  const dos =
    data.brandBrainSnapshot?.dos?.length
      ? data.brandBrainSnapshot.dos.join("; ")
      : "Keep the communication aligned with the brand.";

  const donts =
    data.brandBrainSnapshot?.donts?.length
      ? data.brandBrainSnapshot.donts.join("; ")
      : "Avoid visual decisions that conflict with the brand.";

  return `
Create a high-quality branded social media image.

PROJECT CONTEXT
- Brand: ${data.clientName || "Unknown brand"}
- Industry: ${data.clientIndustry || "Unknown industry"}
- Format: ${formatLabel(data.format)}
- Objective: ${goalLabel(data.goal)}
- Content type: ${data.contentType || "general content"}

MAIN COMMUNICATION
- Main message: ${data.mainMessage || ""}
- Headline inside image: ${data.copy?.headline || "Not specified"}
- Subheadline inside image: ${data.copy?.subheadline || "Not specified"}
- Price or offer: ${data.copy?.priceOrOffer || "Not specified"}
- CTA: ${data.copy?.cta || "Not specified"}

VISUAL / EMOTIONAL DIRECTION
- Must transmit: ${data.selectedEmotions?.join(", ") || "Not specified"}
- Must include visually: ${data.selectedVisualElements?.join(", ") || "Not specified"}
- Extra instructions: ${data.specificInstructions || "None"}

BRAND BRAIN
- Brand description: ${data.brandBrainSnapshot?.brandDescription || "Not specified"}
- Tone: ${data.brandBrainSnapshot?.tone || "Not specified"}
- Colors: ${data.brandBrainSnapshot?.colors?.join(", ") || "Not specified"}
- Typography guidance: ${data.brandBrainSnapshot?.typography || "Not specified"}
- Visual style: ${data.brandBrainSnapshot?.visualStyle?.join(", ") || "Not specified"}

DO
- ${dos}

DON'T
- ${donts}

AVAILABLE PRIORITY ASSETS
${assetsText}

OUTPUT RULES
- Make the image visually strong and easy to understand quickly.
- Respect the brand style and tone.
- Use clear hierarchy.
- If text appears inside the image, it must be legible and clean.
- Avoid clutter.
- Do not invent a brand style that contradicts the Brand Brain.
`.trim();
}
