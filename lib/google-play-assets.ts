export type GooglePlayImageAsset = {
  fileName?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  pngBitDepth?: number;
  pngColorType?: number;
  playConsoleReference?: string;
  inspectedAt?: string;
  aiGeneratedOrEdited?: boolean;
  editorialChecks?: {
    uniqueToEvent?: boolean;
    noAddedTextOrUi?: boolean;
    safeZoneReviewed?: boolean;
  };
};

export type GooglePlayVideoAsset = {
  url?: string;
  playConsoleReference?: string;
  checks?: {
    publicOrUnlisted?: boolean;
    embeddable?: boolean;
    monetizationOff?: boolean;
    landscape?: boolean;
    localized?: boolean;
  };
};

export type GooglePlayAssetSet = {
  primaryImage?: GooglePlayImageAsset;
  squareImage?: GooglePlayImageAsset;
  video?: GooglePlayVideoAsset;
};

export type GooglePlayImageKind = "primary" | "square";

export async function inspectGooglePlayImageFile(file: File) {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("For browser safety, Sorted inspects image files up to 20 MB. This is an inspection limit, not a Google Play limit.");
  }

  const header = new Uint8Array(await file.slice(0, 26).arrayBuffer());
  const isPng = header.length >= 26
    && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
    && header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a
    && String.fromCharCode(...header.slice(12, 16)) === "IHDR";
  const isJpeg = header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (!isPng && !isJpeg) throw new Error("Choose a valid JPG/JPEG or PNG image.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Sorted could not read this image. Try exporting a fresh JPG or PNG.");
  }

  const metadata: GooglePlayImageAsset = {
    fileName: file.name,
    mimeType: isPng ? "image/png" : "image/jpeg",
    width: bitmap.width,
    height: bitmap.height,
    sizeBytes: file.size,
    inspectedAt: new Date().toISOString(),
    editorialChecks: {},
  };
  bitmap.close();

  if (isPng) {
    const readUint32 = (offset: number) => ((header[offset] << 24) | (header[offset + 1] << 16) | (header[offset + 2] << 8) | header[offset + 3]) >>> 0;
    metadata.width = readUint32(16);
    metadata.height = readUint32(20);
    metadata.pngBitDepth = header[24];
    metadata.pngColorType = header[25];
  }

  return metadata;
}

export function validateGooglePlayImageAsset(kind: GooglePlayImageKind, asset: GooglePlayImageAsset | undefined): string[] {
  const label = kind === "primary" ? "Primary image" : "Square image";
  const errors: string[] = [];
  if (!asset?.fileName || !asset.mimeType || !asset.width || !asset.height || !asset.sizeBytes) {
    return [`Inspect a local file for the required ${label.toLowerCase()}.`];
  }
  if (asset.mimeType !== "image/jpeg" && asset.mimeType !== "image/png") {
    errors.push(`${label} must be a JPG/JPEG or 24-bit PNG.`);
  }
  if (asset.mimeType === "image/png" && (asset.pngBitDepth !== 8 || asset.pngColorType !== 2)) {
    errors.push(`${label} PNG must be 24-bit true-color (8-bit RGB).`);
  }
  if (kind === "primary" && (asset.width !== 1920 || asset.height !== 1080)) {
    errors.push("Primary image must be exactly 1920 × 1080 pixels (16:9).");
  }
  if (kind === "square" && asset.width !== asset.height) {
    errors.push("Square image must have a 1:1 aspect ratio.");
  }
  if (!asset.editorialChecks?.uniqueToEvent) errors.push(`${label}: confirm it is specific to this event and not reused from the store listing or another event.`);
  if (!asset.editorialChecks?.noAddedTextOrUi) errors.push(`${label}: confirm there is no added event text, logo, Store badge, or button-like UI.`);
  if (!asset.editorialChecks?.safeZoneReviewed) errors.push(`${label}: review the subject placement and crop/safe zones.`);
  return errors;
}

export function getYouTubeVideoId(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    else if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com") {
      id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function validateGooglePlayAssetSet(assets: GooglePlayAssetSet): string[] {
  const errors = [
    ...validateGooglePlayImageAsset("primary", assets.primaryImage),
    ...validateGooglePlayImageAsset("square", assets.squareImage),
  ];
  const video = assets.video;
  if (!video?.url?.trim()) return errors;
  if (!getYouTubeVideoId(video.url)) errors.push("Use a valid YouTube video link.");
  if (!video.checks?.publicOrUnlisted) errors.push("Confirm the YouTube video is public or unlisted, not private.");
  if (!video.checks?.embeddable) errors.push("Confirm embedding is enabled for the YouTube video.");
  if (!video.checks?.monetizationOff) errors.push("Confirm the video has monetization/ads turned off.");
  if (!video.checks?.landscape) errors.push("Confirm the video is in landscape orientation.");
  if (!video.checks?.localized) errors.push("Confirm the video is localized for the target languages.");
  return errors;
}
