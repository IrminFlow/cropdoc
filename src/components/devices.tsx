"use client";
import { useEffect, useState, useCallback } from "react";
import { Cable, Plus, Copy, Check, Trash2 } from "lucide-react";
import { api, dateLabel } from "@/lib/client";
import { ErrorNotice, Loading } from "./common";
type Token = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  revoked_at: string | null;
};
export function Devices() {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const load = useCallback(
    () =>
      api<{ tokens: Token[] }>("/api/devices")
        .then((r) => setTokens(r.tokens))
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSecret("");
    try {
      const r = await api<{ token: string }>("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setSecret(r.token);
      setName("");
      setCopied(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (
      !confirm(
        "Revoke this token? Its device will no longer be able to upload.",
      )
    )
      return;
    setBusy(true);
    try {
      await api(`/api/devices/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">From camera to clarity</span>
          <h1>Your devices</h1>
          <p>Connect a Raspberry Pi or upload directly from your computer.</p>
        </div>
        <Cable className="heading-icon" size={38} />
      </div>
      <div className="device-layout">
        <section className="panel form-panel">
          <h2>Connect a device</h2>
          <p className="subtle">
            Create a private token for each camera or computer.
          </p>
          <form onSubmit={create}>
            <label>
              Device name
              <input
                placeholder="e.g. Greenhouse Pi"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <button className="button" disabled={busy || !name.trim()}>
              <Plus size={17} /> Create token
            </button>
          </form>
          {error && <ErrorNotice message={error} />}{" "}
          {secret && (
            <div className="secret-box">
              <strong>Save this token now.</strong>
              <p>
                It’s shown only once. Keep it out of shared files and source
                code.
              </p>
              <code>{secret}</code>
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(secret);
                    setCopied(true);
                  } catch {
                    setError("Copy the token manually from the field above.");
                  }
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
                {copied ? "Copied" : "Copy token"}
              </button>
            </div>
          )}
        </section>
        <section className="cli-guide">
          <span className="eyebrow">A simple upload</span>
          <h2>Your field, connected.</h2>
          <p>
            Configure the Python uploader with your app URL and device token,
            then send a photo.
          </p>
          <pre>
            <code>
              python crop_uploader.py --configure{"\n"}python crop_uploader.py
              image.jpg
            </code>
          </pre>
          <p className="fine">
            Also supports folders, grouped photos, and USB cameras. Setup
            instructions are in device-client/README.md.
          </p>
        </section>
      </div>
      <section className="section">
        <div className="section-heading">
          <h2>Device tokens</h2>
          <span className="subtle">Revoke access at any time</span>
        </div>
        {tokens ? (
          <div className="panel token-list">
            {tokens.length ? (
              tokens.map((t) => (
                <div className="token-row" key={t.id}>
                  <Cable size={23} />
                  <div>
                    <strong>{t.name}</strong>
                    <span>
                      {t.prefix}… · Created {dateLabel(t.created_at)}
                    </span>
                  </div>
                  {t.revoked_at ? (
                    <span className="badge">Revoked</span>
                  ) : (
                    <button
                      className="button ghost danger"
                      disabled={busy}
                      onClick={() => void revoke(t.id)}
                    >
                      <Trash2 size={15} /> Revoke
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="subtle">
                No devices connected yet. Create your first token above.
              </p>
            )}
          </div>
        ) : (
          <Loading />
        )}
      </section>
    </>
  );
}
