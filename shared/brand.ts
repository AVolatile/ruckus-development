import { z } from "zod/v3";
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color, such as #2255AA.")
  .transform((v) => v.toUpperCase());
export const brandConfigSchema = z
  .object({
    organizationDisplayName: z.string().trim().min(1).max(80),
    primaryColor: color,
    secondaryColor: color,
    accentColor: color,
    surfaceColor: color,
    logoAssetId: z.string().uuid().nullable(),
    backgroundAssetId: z.string().uuid().nullable(),
    footerText: z.string().trim().max(160).nullable(),
    showPoweredByRuckus: z.literal(true),
  })
  .strict();
export type BrandConfig = z.infer<typeof brandConfigSchema>;
export const brandWriteSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    config: brandConfigSchema,
    baseRevisionId: z.string().uuid().optional(),
  })
  .strict();
export const defaultBrandConfig: BrandConfig = {
  organizationDisplayName: "Your people",
  primaryColor: "#2548F4",
  secondaryColor: "#F6ED51",
  accentColor: "#FF7448",
  surfaceColor: "#F9F7ED",
  logoAssetId: null,
  backgroundAssetId: null,
  footerText: null,
  showPoweredByRuckus: true,
};
export interface BrandRecord {
  id: string;
  name: string;
  revisionId: string;
  revisionNumber: number;
  isDefault: boolean;
  config: BrandConfig;
  updatedAt: string;
}
function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((v) => {
      const n = parseInt(v, 16) / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function readableForeground(background: string) {
  return contrast(background, "#000000") >= contrast(background, "#FFFFFF")
    ? "#000000"
    : "#FFFFFF";
}
export function brandContrast(config: BrandConfig) {
  return ["primaryColor", "secondaryColor", "accentColor", "surfaceColor"].map(
    (key) => {
      const background = config[key as keyof BrandConfig] as string;
      const foreground = readableForeground(background);
      return {
        key,
        background,
        foreground,
        ratio: contrast(background, foreground),
      };
    },
  );
}
export function resolveBrandSnapshot(record: BrandRecord) {
  const config = brandConfigSchema.parse(record.config);
  const colors = Object.freeze(
    brandContrast(config).map((pair) => Object.freeze(pair)),
  );
  return Object.freeze({
    schemaVersion: 1 as const,
    brandKitId: z.string().uuid().parse(record.id),
    revisionId: z.string().uuid().parse(record.revisionId),
    revisionNumber: z.number().int().positive().parse(record.revisionNumber),
    name: z.string().trim().min(1).max(80).parse(record.name),
    config: Object.freeze(config),
    colors,
  });
}
export type BrandSnapshot = ReturnType<typeof resolveBrandSnapshot>;
