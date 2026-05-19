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
  requestAttachments?: Array<{
    name?: string;
    role?: string;
    notes?: string;
    fileUrl?: string;
    mimeType?: string;
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

function attachmentRoleLabel(role?: string) {
  const map: Record<string, string> = {
    "producto-principal": "main product",
    "platillo-principal": "main dish",
    "referencia-visual": "specific visual reference",
    "fondo-ambiente": "background or ambience reference",
    promocion: "promotion reference",
  };

  return map[role || ""] || role || "specific reference";
}

export function buildGenerationPrompt(data: BuildPromptInput) {
  const requestAttachmentsText =
    data.requestAttachments?.length
      ? data.requestAttachments
          .map((attachment, index) => {
            const attachmentName =
              attachment.name || "Specific attachment for this piece";
            const attachmentRole = attachmentRoleLabel(attachment.role);
            const attachmentNotes = attachment.notes
              ? `Instruction: ${attachment.notes}`
              : "Use it as a high-priority visual reference for this generation.";

            return `${index + 1}. ${attachmentName} (${attachmentRole}). ${attachmentNotes}`;
          })
          .join("\n")
      : "No specific request attachments.";

  const assetsText =
    data.selectedAssetsSnapshot?.length
      ? data.selectedAssetsSnapshot
          .map((asset, index) => {
            const tags = asset.tags?.length
              ? ` Tags: ${asset.tags.join(", ")}.`
              : "";
            const notes = asset.notes ? ` Notes: ${asset.notes}.` : "";

            return `${index + 1}. ${asset.name || "Asset"} (${
              asset.type || "asset"
            }${asset.category ? ` / ${asset.category}` : ""}).${tags}${notes}`;
          })
          .join("\n")
      : "No general brand visual assets selected.";

  const dos =
    data.brandBrainSnapshot?.dos?.length
      ? data.brandBrainSnapshot.dos.join("; ")
      : "Keep the communication aligned with the brand.";

  const donts =
    data.brandBrainSnapshot?.donts?.length
      ? data.brandBrainSnapshot.donts.join("; ")
      : "Avoid visual decisions that conflict with the brand.";

  return `
Create a high-quality branded social media image that feels professionally art-directed, polished, and ready for a real commercial campaign.

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
- Must include visually: ${
    data.selectedVisualElements?.join(", ") || "Not specified"
  }
- Extra instructions: ${data.specificInstructions || "None"}

SPECIFIC ATTACHMENTS FOR THIS PIECE
These attachments are the most important visual references for this specific generation. If one is a product, dish, or object, it should be treated as the visual protagonist whenever the brief indicates it.
${requestAttachmentsText}

BRAND BRAIN
- Brand description: ${
    data.brandBrainSnapshot?.brandDescription || "Not specified"
  }
- Tone: ${data.brandBrainSnapshot?.tone || "Not specified"}
- Colors: ${data.brandBrainSnapshot?.colors?.join(", ") || "Not specified"}
- Typography guidance: ${
    data.brandBrainSnapshot?.typography || "Not specified"
  }
- Visual style: ${
    data.brandBrainSnapshot?.visualStyle?.join(", ") || "Not specified"
  }

DO
- ${dos}

DON'T
- ${donts}

AVAILABLE BRAND ASSETS
These are general client assets selected to inform the visual identity, style, composition, and brand universe of the design.
${assetsText}

ART DIRECTION RULES
- Make the piece feel designed by a strong advertising art director, not like a generic template.
- Create visual depth, deliberate hierarchy, premium finishing, and an intentional composition.
- Use strong focal points, background treatment, subtle lighting, shadows, and graphic systems that support the message.
- If a specific product, dish, or object attachment is provided, prioritize it visually and make it feel integrated into the design.
- Keep the communication instantly understandable at a glance.
- Respect the brand style, emotional tone, and commercial objective.
- Avoid random decorative clutter that does not reinforce the message.

TEXT RULES
- Only include the exact headline, subheadline, offer, and CTA provided above when they are specified.
- Do not invent extra words, numbers, dates, product names, or claims.
- If text appears inside the image, it must be clean, legible, and placed with clear hierarchy.

BRAND SAFETY RULES
- Do not distort, rewrite, or fabricate brand names.
- Do not invent a new brand identity that contradicts the Brand Brain.
- If a logo is shown through a reference image, preserve it as accurately as possible, but avoid relying on logo recreation unless explicitly required.
- Do not create false product details that are not supported by the brief or attachments.

OUTPUT RULES
- Produce a finished, high-quality social media advertising image.
- Match the selected format and aspect ratio.
- Avoid bland stock-template aesthetics.
- Avoid clutter, low contrast, weak hierarchy, or overly flat compositions.
`.trim();
}
