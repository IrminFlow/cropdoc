"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  Key,
  Plus,
  Trash,
  Webcam,
} from "@phosphor-icons/react/ssr";
import { api, dateLabel } from "@/lib/client";
import { useApi } from "@/lib/use-api";
import { ErrorNotice, Loading, PageHeader } from "./ui";
import styles from "./devices.module.css";

type DeviceToken = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  revoked_at: string | null;
};

export function Devices() {
  const tokens = useApi<{ tokens: DeviceToken[] }>("/api/devices");
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSecret("");
    try {
      const { token } = await api<{ token: string }>("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setSecret(token);
      setCopied(false);
      setName("");
      tokens.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: DeviceToken) {
    if (!confirm(`Remove “${token.name}”? It will stop sending photos.`))
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/devices/${token.id}`, { method: "DELETE" });
      tokens.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setError("Copying did not work. Select the key and copy it by hand.");
    }
  }

  return (
    <>
      <Link href="/help" className={styles.back}>
        <ArrowLeft size={22} weight="bold" aria-hidden /> Help
      </Link>
      <PageHeader
        title="Field cameras"
        lead="Let a Raspberry Pi, a USB camera or a computer send photos by itself. Setting it up needs someone who is comfortable with a command line."
      />
      <div className={styles.grid}>
        <section className={`${styles.panel} rise`} aria-labelledby="key-title">
          <h2 id="key-title">1. Make a device key</h2>
          <p className={styles.muted}>
            Each camera or computer gets its own key. You can remove a key at
            any time.
          </p>
          <p>
            Google checks your photos and may use them to improve its AI. Upload
            crop-only photos without people or personal details.
          </p>
          <form className={styles.form} onSubmit={create}>
            <label className="field">
              Device name
              <input
                className="input"
                placeholder="For example: Greenhouse camera"
                maxLength={60}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="btn" disabled={busy || !name.trim()}>
              <Plus size={22} weight="bold" aria-hidden /> Make key
            </button>
          </form>
          {secret && (
            <div className={styles.secret}>
              <strong>
                <Key size={22} weight="duotone" aria-hidden /> Copy this key now
              </strong>
              <p>It is shown only once. Keep it private, like a password.</p>
              <code>{secret}</code>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => void copy()}
              >
                {copied ? (
                  <Check size={20} weight="bold" aria-hidden />
                ) : (
                  <Copy size={20} weight="bold" aria-hidden />
                )}
                {copied ? "Copied" : "Copy key"}
              </button>
            </div>
          )}
        </section>
        <section
          className={`${styles.panel} rise`}
          style={{ "--i": 1 } as React.CSSProperties}
          aria-labelledby="setup-title"
        >
          <h2 id="setup-title">2. Set up the uploader</h2>
          <p>
            On the device, get the uploader from the <code>device-client</code>{" "}
            folder of CropDoc and run:
          </p>
          <pre>
            <code>python crop_uploader.py --configure</code>
          </pre>
          <p>
            Enter this app’s address and the device key when asked. Then send a
            photo:
          </p>
          <pre>
            <code>python crop_uploader.py photo.jpg</code>
          </pre>
          <p className={styles.muted}>
            It can also send a whole folder or take photos with a USB camera.
            The <code>device-client/README.md</code> file explains every option.
          </p>
        </section>
      </div>
      {error && <ErrorNotice message={error} />}
      <section className={styles.list} aria-labelledby="list-title">
        <h2 id="list-title">Your device keys</h2>
        {tokens.error ? (
          <ErrorNotice message={tokens.error} onRetry={tokens.reload} />
        ) : !tokens.data ? (
          <Loading />
        ) : tokens.data.tokens.length === 0 ? (
          <p className={styles.muted}>No keys yet. Make one above.</p>
        ) : (
          <ul>
            {tokens.data.tokens.map((token) => (
              <li key={token.id} className={styles.token}>
                <span className={styles.tokenIcon}>
                  <Webcam size={26} weight="duotone" aria-hidden />
                </span>
                <span>
                  <strong>{token.name}</strong>
                  <span className={styles.muted}>
                    Key {token.prefix}… · made {dateLabel(token.created_at)}
                  </span>
                </span>
                {token.revoked_at ? (
                  <span className={styles.removed}>Removed</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger btn-small"
                    disabled={busy}
                    onClick={() => void revoke(token)}
                  >
                    <Trash size={20} weight="bold" aria-hidden /> Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
