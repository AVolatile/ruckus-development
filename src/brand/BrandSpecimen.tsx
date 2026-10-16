import { readableForeground, type BrandConfig } from "../../shared/brand";
import { Logo } from "../components/Visuals";

/** A real saved identity, using the same private asset boundary as the preview. */
export function BrandSpecimen({
  config,
  workspaceId,
}: {
  config: BrandConfig;
  workspaceId: string;
}) {
  const foreground = readableForeground(config.surfaceColor);
  const colors = [
    config.primaryColor,
    config.secondaryColor,
    config.accentColor,
  ];
  return (
    <div className="brand-identity-specimen">
      <div
        className="brand-identity-mark"
        style={{ background: config.surfaceColor, color: foreground }}
      >
        <span className="eyebrow">YOUR BRAND</span>
        {config.logoAssetId && (
          <img
            src={`/api/v1/workspaces/${workspaceId}/brand-assets/${config.logoAssetId}`}
            alt={`${config.organizationDisplayName} logo`}
          />
        )}
        <strong>{config.organizationDisplayName}</strong>
        <span className="brand-identity-cross" aria-label="with Ruckus">
          × <Logo light={foreground === "#FFFFFF"} />
        </span>
      </div>
      <div
        className="brand-swatches"
        role="img"
        aria-label={`Brand palette: ${colors.join(", ")}`}
      >
        {colors.map((color, index) => (
          <span
            key={index}
            style={{ background: color, color: readableForeground(color) }}
          >
            <b>{["Primary", "Secondary", "Accent"][index]}</b>
            {color}
          </span>
        ))}
      </div>
    </div>
  );
}
