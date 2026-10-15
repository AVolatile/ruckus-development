import type { Dispatch, SetStateAction } from "react";
import {
  brandWriteSchema,
  contrast,
  type BrandConfig,
} from "../../shared/brand";
export default function BrandFields({
  name,
  setName,
  config,
  setConfig,
  fields,
  manage,
  busy,
  uploading,
  upload,
}: {
  name: string;
  setName(value: string): void;
  config: BrandConfig;
  setConfig: Dispatch<SetStateAction<BrandConfig>>;
  fields: Record<string, string>;
  manage: boolean;
  busy: boolean;
  uploading: string;
  upload(file: File | undefined, kind: "logo" | "background"): Promise<void>;
}) {
  return (
    <fieldset disabled={!manage || busy}>
      <legend className="sr-only">Brand Kit settings</legend>
      {[
        ["name", "Brand Kit name", name],
        [
          "organizationDisplayName",
          "Display name",
          config.organizationDisplayName,
        ],
      ].map(([key, label, value]) => (
        <label key={key} htmlFor={`brand-${key}`}>
          {label}
          <input
            id={`brand-${key}`}
            value={value}
            maxLength={80}
            onChange={(e) =>
              key === "name"
                ? setName(e.target.value)
                : setConfig((c) => ({
                    ...c,
                    organizationDisplayName: e.target.value,
                  }))
            }
            aria-invalid={!!fields[key]}
            aria-describedby={fields[key] ? `brand-error-${key}` : undefined}
          />
          {fields[key] && (
            <span id={`brand-error-${key}`} className="field-error">
              {fields[key]}
            </span>
          )}
        </label>
      ))}
      <div className="brand-color-fields">
        {[
          ["primaryColor", "Primary"],
          ["secondaryColor", "Secondary"],
          ["accentColor", "Accent"],
          ["surfaceColor", "Surface"],
        ].map(([key, label]) => (
          <label key={key} htmlFor={`brand-${key}`}>
            {label} color
            <div className="color-input-pair">
              <input
                type="color"
                aria-label={`${label} color picker`}
                value={
                  /^#[0-9a-f]{6}$/i.test(
                    String(config[key as keyof BrandConfig]),
                  )
                    ? String(config[key as keyof BrandConfig])
                    : "#000000"
                }
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    [key]: e.target.value.toUpperCase(),
                  }))
                }
              />
              <input
                id={`brand-${key}`}
                value={String(config[key as keyof BrandConfig])}
                maxLength={7}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    [key]: e.target.value,
                  }))
                }
                aria-invalid={!!fields[key]}
              />
            </div>
            {fields[key] && <span className="field-error">{fields[key]}</span>}
          </label>
        ))}
      </div>
      <p className="brand-contrast-warning">
        {brandWriteSchema.shape.config.safeParse(config).success
          ? `Primary on surface: ${contrast(config.primaryColor, config.surfaceColor).toFixed(1)}:1. ${contrast(config.primaryColor, config.surfaceColor) < 4.5 ? "These selected colors are too close for small text. Preview uses derived black or white text on solid surfaces instead." : "Selected colors have enough contrast for ordinary text."}`
          : "Use six-digit hex colors to preview your palette."}
      </p>
      {manage && (
        <>
          {(["logo", "background"] as const).map((kind) => (
            <div className="brand-upload" key={kind}>
              <label htmlFor={`upload-${kind}`}>
                {kind === "logo" ? "Logo" : "Background image"}
                <input
                  id={`upload-${kind}`}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={!manage || busy}
                  onChange={(e) => {
                    void upload(e.target.files?.[0], kind);
                    e.target.value = "";
                  }}
                />
              </label>
              <p>
                PNG, JPEG or WebP · {kind === "logo" ? 2 : 5} MB · Max 4096 ×
                4096 px
              </p>
              {config[
                kind === "logo" ? "logoAssetId" : "backgroundAssetId"
              ] && (
                <button
                  type="button"
                  className="button small outline"
                  onClick={() =>
                    setConfig((c) => ({
                      ...c,
                      [kind === "logo" ? "logoAssetId" : "backgroundAssetId"]:
                        null,
                    }))
                  }
                >
                  Remove {kind}
                </button>
              )}
              {uploading === kind && <p role="status">Processing {kind}…</p>}
            </div>
          ))}
        </>
      )}
      <label>
        Footer text
        <textarea
          maxLength={160}
          value={config.footerText || ""}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              footerText: e.target.value || null,
            }))
          }
        />
      </label>
      <p>Powered by Ruckus stays visible on the experience.</p>
    </fieldset>
  );
}
