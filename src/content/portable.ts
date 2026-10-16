import { packExport, type PackDocument } from "../../shared/content-packs";
export function downloadPack(document: PackDocument) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(packExport(document), null, 2)], {
      type: "application/json",
    }),
  );
  const a = window.document.createElement("a");
  a.href = url;
  a.download = "ruckus-content-pack.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
