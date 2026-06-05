export type BuildPromptInput = {
  clientName?: string;
  clientIndustry?: string;
  format?: string;
  goal?: string;
  contentType?: string;
  mainMessage?: string;
  textBlocks?: Array<{
    id?: string;
    text?: string;
    role?: string;
    roleLabel?: string;
    priority?: string;
    priorityLabel?: string;
    instruction?: string;
    locked?: boolean;
  }>;
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
  logoOverlay?: {
    enabled?: boolean;
    assetId?: string;
    assetName?: string;
    fileUrl?: string;
    position?: string;
    size?: string;
  };
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

function textBlockRoleLabel(role?: string) {
  const map: Record<string, string> = {
    headline: "main headline",
    subheadline: "secondary phrase",
    claim: "campaign claim",
    badge: "badge or sticker",
    bullet: "bullet point",
    price: "price",
    promotion: "promotion",
    cta: "call to action",
    date: "date",
    location: "location",
    disclaimer: "disclaimer",
    free: "free text",
  };

  return map[role || ""] || role || "text block";
}

function textBlockPriorityLabel(priority?: string) {
  const map: Record<string, string> = {
    high: "high priority",
    medium: "medium priority",
    low: "low priority",
  };

  return map[priority || ""] || priority || "medium priority";
}

function logoPositionLabel(position?: string) {
  const map: Record<string, string> = {
    "top-left": "top-left corner",
    "top-right": "top-right corner",
    "bottom-left": "bottom-left corner",
    "bottom-right": "bottom-right corner",
    "bottom-center": "bottom-center area",
  };

  return map[position || ""] || "selected clean area";
}

function sanitizeAttachmentNotes(notes?: string) {
  if (!notes?.trim()) {
    return "Use it as a visual reference for mood, atmosphere, composition, or product context without copying it directly.";
  }

  const normalized = notes
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const mentionsWatermark =
    normalized.includes("marca de agua") ||
    normalized.includes("watermark") ||
    normalized.includes("quita marca") ||
    normalized.includes("quitar marca") ||
    normalized.includes("remove watermark");

  if (mentionsWatermark) {
    return "Use the reference only as inspiration for atmosphere and visual context. Do not copy it directly, do not reproduce watermarks, and create an original clean scene.";
  }

  return notes.trim();
}

function shouldRemoveLogoInstruction(rule: string) {
  const normalized = rule
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const mentionsLogo = normalized.includes("logo") || normalized.includes("logotipo");
  const asksToGenerateLogo =
    normalized.includes("integrar") ||
    normalized.includes("incluir") ||
    normalized.includes("agregar") ||
    normalized.includes("poner") ||
    normalized.includes("mostrar") ||
    normalized.includes("presencia");

  return mentionsLogo && asksToGenerateLogo;
}

function cleanRules(rules?: string[], logoOverlayEnabled = false) {
  const clean = (rules || [])
    .map((rule) => rule.trim())
    .filter(Boolean)
    .filter((rule) => !logoOverlayEnabled || !shouldRemoveLogoInstruction(rule));

  return Array.from(new Set(clean));
}

function buildTextBlocksText(data: BuildPromptInput) {
  const blocks = (data.textBlocks || [])
    .map((block) => ({
      text: block.text?.trim() || "",
      role: block.roleLabel || textBlockRoleLabel(block.role),
      priority: block.priorityLabel || textBlockPriorityLabel(block.priority),
      instruction: block.instruction?.trim() || "",
      locked: block.locked !== false,
    }))
    .filter((block) => block.text.length > 0);

  if (blocks.length > 0) {
    return blocks
      .map((block, index) => {
        const exactRule = block.locked
          ? "Use this text EXACTLY as written. Do not rewrite, translate, correct, abbreviate, or add words to it."
          : "You may adapt hierarchy and placement, but keep the meaning aligned with the text.";
        const instruction = block.instruction ? ` Specific instruction: ${block.instruction}` : "";

        return `${index + 1}. Text: "${block.text}" | Visual role: ${block.role} | Priority: ${block.priority}. ${exactRule}${instruction}`;
      })
      .join("\n");
  }

  const legacyBlocks = [
    data.copy?.headline ? `1. Text: "${data.copy.headline}" | Visual role: main headline | Priority: high priority. Use this text EXACTLY as written.` : "",
    data.copy?.subheadline ? `2. Text: "${data.copy.subheadline}" | Visual role: secondary phrase | Priority: medium priority. Use this text EXACTLY as written.` : "",
    data.copy?.priceOrOffer ? `3. Text: "${data.copy.priceOrOffer}" | Visual role: price or promotion | Priority: high priority. Use this text EXACTLY as written.` : "",
    data.copy?.cta ? `4. Text: "${data.copy.cta}" | Visual role: call to action | Priority: low priority. Use this text EXACTLY as written.` : "",
  ].filter(Boolean);

  return legacyBlocks.length ? legacyBlocks.join("\n") : "No required in-image text blocks were specified.";
}

export function buildGenerationPrompt(data: BuildPromptInput) {
  const logoOverlayEnabled = data.logoOverlay?.enabled === true;

  const requestAttachmentsText =
    data.requestAttachments?.length
      ? data.requestAttachments
          .map((attachment, index) => {
            const attachmentName =
              attachment.name || "Specific attachment for this piece";
            const attachmentRole = attachmentRoleLabel(attachment.role);
            const attachmentNotes = sanitizeAttachmentNotes(attachment.notes);

            return `${index + 1}. ${attachmentName} (${attachmentRole}). Instruction: ${attachmentNotes}`;
          })
          .join("\n")
      : "No specific request attachments.";

  const logoOverlayText = logoOverlayEnabled
    ? `The official logo must NOT be generated by the AI. Generate the design without any logo. Leave clean visual space in the ${logoPositionLabel(
        data.logoOverlay?.position,
      )}. The system will place the real official logo after image generation as a fixed overlay layer. Do not create logo placeholders, white boxes, frames, fake marks, brand-name labels, or the word LOGO.`
    : "No logo overlay requested. Do not force a logo into the design unless the brief explicitly asks for brand text as normal campaign copy.";

  const assetsText =
    data.selectedAssetsSnapshot?.length
      ? data.selectedAssetsSnapshot
          .map((asset, index) => {
            const tags = asset.tags?.length
              ? ` Tags: ${asset.tags.join(", ")}.`
              : "";
            const notes = asset.notes ? ` Notes: ${sanitizeAttachmentNotes(asset.notes)}.` : "";

            return `${index + 1}. ${asset.name || "Asset"} (${asset.type || "asset"}${asset.category ? ` / ${asset.category}` : ""}).${tags}${notes}`;
          })
          .join("\n")
      : "No general brand visual assets selected.";

  const textBlocksText = buildTextBlocksText(data);
  const cleanDos = cleanRules(data.brandBrainSnapshot?.dos, logoOverlayEnabled);
  const cleanDonts = cleanRules(data.brandBrainSnapshot?.donts, false);

  const dos = cleanDos.length
    ? cleanDos.join("; ")
    : "Keep the communication aligned with the brand and make the main message easy to read.";

  const donts = cleanDonts.length
    ? cleanDonts.join("; ")
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

TEXT BLOCKS TO USE IN THE DESIGN
These are the official text blocks for this piece. Treat them as flexible design elements, not as a fixed template. Arrange them dynamically according to role, priority, and visual hierarchy.
${textBlocksText}

VISUAL / EMOTIONAL DIRECTION
- Must transmit: ${data.selectedEmotions?.join(", ") || "Not specified"}
- Must include visually: ${
    data.selectedVisualElements?.join(", ") || "Not specified"
  }
- Extra instructions: ${data.specificInstructions || "None"}

SPECIFIC ATTACHMENTS FOR THIS PIECE
Use attachments only as visual references for mood, context, product, or atmosphere. Do not copy protected marks, watermarks, or source-image text directly.
${requestAttachmentsText}

POST-GENERATION LOGO OVERLAY
${logoOverlayText}

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
- If a visual reference contains text, treat that text as layout/style inspiration only unless it exactly matches one of the official text blocks above.
- If a logo overlay is requested, only reserve natural visual breathing room in the requested area. Never create a visible logo placeholder, white box, label, or fake logo area.
- Keep the communication instantly understandable at a glance.
- Respect the brand style, emotional tone, and commercial objective.
- Avoid random decorative clutter that does not reinforce the message.

TEXT RULES
- Use only the official text blocks listed above when placing text inside the image.
- Do not force every block to appear at the same size; use hierarchy based on priority.
- Do not invent extra words, numbers, dates, product names, or claims.
- Do not add any logo text, brand-name placeholder, or logo label.
- If a block is marked exact, it must appear exactly as written.
- If text appears inside the image, it must be clean, legible, and placed with clear hierarchy.

BRAND SAFETY RULES
- Do not distort, rewrite, or fabricate brand names.
- Do not invent a new brand identity that contradicts the Brand Brain.
- Do not recreate logos inside the generated image. Logos, when requested, are added later as exact fixed overlays.
- Do not create false product details that are not supported by the brief or attachments.

OUTPUT RULES
- Produce a finished, high-quality social media advertising image.
- Match the selected format and aspect ratio.
- Avoid bland stock-template aesthetics.
- Avoid clutter, low contrast, weak hierarchy, or overly flat compositions.
`.trim();
}
