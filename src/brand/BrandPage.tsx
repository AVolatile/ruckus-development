import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type FormEvent,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useWorkspace } from "../workspaces/WorkspaceContext";
import { request, ApiClientError } from "../lib/api";
import { Tag, Avatar } from "../components/Visuals";
import { ErrorMessage } from "../components/Layout";
import {
  brandWriteSchema,
  defaultBrandConfig,
  brandContrast,
  type BrandConfig,
  type BrandRecord,
} from "../../shared/brand";
import BrandFields from "./BrandFields";
import BrandPreview from "./BrandPreview";
export default function BrandPage() {
  const { current, path, can } = useWorkspace(),
    { brandKitId } = useParams(),
    navigate = useNavigate();
  const base = `/api/v1/workspaces/${current.id}/brand-kits`;
  const [items, setItems] = useState<BrandRecord[]>([]),
    [offset, setOffset] = useState<number | null>(null),
    [record, setRecord] = useState<BrandRecord>(),
    [name, setName] = useState(""),
    [config, setConfig] = useState<BrandConfig>({
      ...defaultBrandConfig,
      organizationDisplayName: current.name,
    }),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({}),
    [conflict, setConflict] = useState(false),
    [confirm, setConfirm] = useState(false),
    [pendingDelete, setPendingDelete] = useState(false),
    [leaveTo, setLeaveTo] = useState("");
  const editing = !!brandKitId,
    creating = brandKitId === "new",
    manage = can("brand.manage");
  const baseline = useRef("");
  const signature = JSON.stringify({ name, config }),
    dirty =
      editing && manage && !!baseline.current && baseline.current !== signature;
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (editing && !creating) {
        const value = await request<BrandRecord>(`${base}/${brandKitId}`);
        setRecord(value);
        setName(value.name);
        setConfig(value.config);
        baseline.current = JSON.stringify({
          name: value.name,
          config: value.config,
        });
      } else if (creating) {
        const draft = {
          ...defaultBrandConfig,
          organizationDisplayName: current.name,
        };
        setRecord(undefined);
        setName("Main Brand Kit");
        setConfig(draft);
        baseline.current = JSON.stringify({
          name: "Main Brand Kit",
          config: draft,
        });
      } else {
        const result = await request<{
          items: BrandRecord[];
          nextOffset: number | null;
        }>(base);
        setItems(result.items);
        setOffset(result.nextOffset);
      }
      setConflict(false);
      setConfirm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t load Brand Kits.");
    } finally {
      setLoading(false);
    }
  }, [base, brandKitId, creating, current.name, editing]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest?.("a");
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
      setConfirm(true);
    };
    document.addEventListener("click", leave, true);
    return () => document.removeEventListener("click", leave, true);
  }, [dirty]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "That action didn’t finish. Try again.",
      );
      if (e instanceof ApiClientError && e.code === "BRAND_CONFLICT")
        setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const input = brandWriteSchema.safeParse({
      name,
      config,
      ...(record ? { baseRevisionId: record.revisionId } : {}),
    });
    if (!input.success) {
      setFields(
        Object.fromEntries(
          input.error.issues.map((i) => [String(i.path.at(-1)), i.message]),
        ),
      );
      setError("Check the highlighted Brand Kit fields.");
      return;
    }
    setFields({});
    await run(async () => {
      const result = await request<BrandRecord>(
        creating ? base : `${base}/${record!.id}`,
        { method: creating ? "POST" : "PUT", body: JSON.stringify(input.data) },
      );
      setRecord(result);
      setName(result.name);
      setConfig(result.config);
      baseline.current = JSON.stringify({
        name: result.name,
        config: result.config,
      });
      setStatus(`Saved · revision ${result.revisionNumber}`);
      if (creating) navigate(path(`/brand/${result.id}`), { replace: true });
    });
  }
  async function upload(file: File | undefined, kind: "logo" | "background") {
    if (!file) return;
    const limit = kind === "logo" ? 2 : 5;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > limit * 1024 * 1024
    ) {
      setError(`Choose a PNG, JPEG or WebP ${kind} under ${limit} MB.`);
      return;
    }
    setUploading(kind);
    await run(async () => {
      const result = await request<{ id: string }>(
        `/api/v1/workspaces/${current.id}/brand-assets?kind=${kind}`,
        { method: "POST", headers: { "Content-Type": file.type }, body: file },
      );
      setConfig((c) => ({
        ...c,
        [kind === "logo" ? "logoAssetId" : "backgroundAssetId"]: result.id,
      }));
      setStatus(
        `${kind === "logo" ? "Logo" : "Background"} uploaded. Save the Brand Kit to use it.`,
      );
    });
    setUploading("");
  }
  function downloadDraft() {
    const link = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ name, config }, null, 2)], {
        type: "application/json",
      }),
    );
    link.href = url;
    link.download = "ruckus-brand-draft.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <section className="page-hero">
        <Tag>{current.name} / BRAND</Tag>
        <h1>
          Your room.
          <br />
          <span>Your signature.</span>
        </h1>
        <p>
          Brand the experience your people share. Ruckus stays familiar behind
          the scenes.
        </p>
        <nav className="workspace-tabs" aria-label="Workspace settings">
          <Link to={path("/workspace")}>General</Link>
          <Link to={path("/members")}>Members</Link>
          <Link to={path("/brand")}>Brand</Link>
          {can("audit.read") && <Link to={path("/activity")}>Activity</Link>}
        </nav>
      </section>
      <section className="section brand-workspace">
        <ErrorMessage message={error} />
        {status && <p role="status">{status}</p>}
        {loading ? (
          <p role="status">Loading Brand Kits…</p>
        ) : !editing ? (
          <>
            <div className="section-heading">
              <h2>Brand Kits.</h2>
              {manage && (
                <Link className="button" to={path("/brand/new")}>
                  Create Brand Kit ↗
                </Link>
              )}
            </div>
            {items.length ? (
              <div className="brand-kit-grid">
                {items.map((kit) => (
                  <article className="brand-kit-card" key={kit.id}>
                    <div className="brand-swatches" aria-label="Brand palette">
                      {[
                        kit.config.primaryColor,
                        kit.config.secondaryColor,
                        kit.config.accentColor,
                      ].map((color, i) => (
                        <span key={i} style={{ background: color }} />
                      ))}
                    </div>
                    <div>
                      <h3>{kit.name}</h3>
                      <p>
                        {kit.config.organizationDisplayName} · Revision{" "}
                        {kit.revisionNumber}
                        {kit.isDefault ? " · Default" : ""}
                      </p>
                      <Link
                        className="button small outline"
                        to={path(`/brand/${kit.id}`)}
                      >
                        {manage ? "Edit & preview" : "View preview"} ↗
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="studio-empty">
                <Avatar id={5} size={110} />
                <div>
                  <h3>A familiar face for every room.</h3>
                  <p>
                    {manage
                      ? "Add your colors, logo and background. Preview the lobby, join screen and results before future events use them."
                      : "An Owner or Admin can create a Brand Kit for this workspace."}
                  </p>
                </div>
              </div>
            )}
            {offset !== null && (
              <button
                className="button outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await request<{
                      items: BrandRecord[];
                      nextOffset: number | null;
                    }>(base + `?offset=${offset}`);
                    setItems((previous) => [...previous, ...result.items]);
                    setOffset(result.nextOffset);
                  })
                }
              >
                More Brand Kits
              </button>
            )}
          </>
        ) : !creating && !record ? (
          <div className="workspace-panel">
            <h2>Brand Kit unavailable.</h2>
            <p>Choose an available kit or try loading again.</p>
            <Link className="button outline" to={path("/brand")}>
              All Brand Kits ↗
            </Link>
            <button className="button outline" onClick={() => void load()}>
              Try loading again
            </button>
          </div>
        ) : creating && !manage ? (
          <p>You need Owner or Admin permission to create a Brand Kit.</p>
        ) : (
          <>
            <div className="brand-editor-toolbar">
              <Link
                className="button small outline"
                to={path("/brand")}
                onClick={(e) => {
                  if (dirty) {
                    e.preventDefault();
                    setConfirm(true);
                  }
                }}
              >
                ← All Brand Kits
              </Link>
              <p role="status">
                {busy
                  ? "Saving…"
                  : dirty
                    ? "Unsaved changes"
                    : record
                      ? `Saved · revision ${record.revisionNumber}`
                      : "New Brand Kit"}
              </p>
            </div>
            {confirm && (
              <div className="workspace-panel">
                <p>Leave without saving these Brand Kit edits?</p>
                <button className="button outline" onClick={downloadDraft}>
                  Export draft
                </button>
                <button
                  className="button danger"
                  onClick={() => navigate(leaveTo || path("/brand"))}
                >
                  Discard and leave
                </button>
                <button
                  className="button outline"
                  onClick={() => setConfirm(false)}
                >
                  Keep editing
                </button>
              </div>
            )}
            {conflict && (
              <div className="draft-recovery" role="alert">
                <h2>Another editor saved first.</h2>
                <p>
                  Your edits are still here. Export a copy before explicitly
                  replacing them with the latest version.
                </p>
                <button className="button outline" onClick={downloadDraft}>
                  Export my Brand draft
                </button>
                <button className="button outline" onClick={() => void load()}>
                  Load latest and replace these edits
                </button>
              </div>
            )}
            <div className="brand-authoring">
              <form
                className="workspace-form brand-form"
                noValidate
                onSubmit={(e) => void save(e)}
              >
                <h2>{manage ? "Make it yours." : "The workspace look."}</h2>
                <BrandFields
                  {...{
                    name,
                    setName,
                    config,
                    setConfig,
                    fields,
                    manage,
                    busy,
                    uploading,
                    upload,
                  }}
                />
                {manage && (
                  <button
                    className="button"
                    disabled={busy || !!uploading || conflict}
                  >
                    {busy ? "Saving…" : "Save Brand Kit ↗"}
                  </button>
                )}
                {manage && (
                  <button
                    type="button"
                    className="button small outline"
                    onClick={downloadDraft}
                  >
                    Export draft
                  </button>
                )}
                {record && manage && (
                  <div className="hero-actions">
                    {!record.isDefault && (
                      <button
                        type="button"
                        className="button small outline"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await request(`${base}/${record.id}/default`, {
                              method: "POST",
                              body: "{}",
                            });
                            setRecord({ ...record, isDefault: true });
                            setStatus("Default Brand Kit updated.");
                          })
                        }
                      >
                        Set as default
                      </button>
                    )}
                    <button
                      type="button"
                      className="button small outline"
                      disabled={busy}
                      onClick={() => setPendingDelete(true)}
                    >
                      Delete Brand Kit
                    </button>
                    {pendingDelete && (
                      <div>
                        <p>
                          Delete this kit? Revision history stays preserved. The
                          next oldest kit becomes default, or Ruckus styling is
                          used.
                        </p>
                        <button
                          type="button"
                          className="button small danger"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await request(`${base}/${record.id}`, {
                                method: "DELETE",
                              });
                              navigate(path("/brand"));
                            })
                          }
                        >
                          Confirm deletion
                        </button>
                        <button
                          type="button"
                          className="button small outline"
                          onClick={() => setPendingDelete(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </form>
              {brandWriteSchema.shape.config.safeParse(config).success ? (
                <BrandPreview config={config} workspaceId={current.id} />
              ) : (
                <div className="workspace-panel">
                  <p>
                    Use valid colors and a display name to update the preview.
                  </p>
                </div>
              )}
            </div>
            <p className="brand-accessibility-note">
              {brandWriteSchema.shape.config.safeParse(config).success &&
              brandContrast(config).every((p) => p.ratio >= 4.5)
                ? "Preview text meets the 4.5:1 minimum on its solid backgrounds."
                : "Check the color fields above."}
            </p>
          </>
        )}
      </section>
    </>
  );
}
