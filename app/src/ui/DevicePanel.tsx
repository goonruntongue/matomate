// Share this app: QR code + copy link + native share sheet.
// The URL is never hard-coded: it is derived from where the app is running right now, so it works unchanged on
// GitHub Pages, Cloudflare, or any other host. On the dev server (localhost) it uses the machine's LAN URLs
// instead, because a "localhost" QR code can't be opened from another device.
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useDialog } from './useDialog';

const LAN_URLS: string[] = __LAN_URLS__;

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');
}

/** The app's entry URL, derived from the current location (directory of the page, no query/hash). */
export function appUrl(): string {
  const url = new URL('./', window.location.href);
  url.search = '';
  url.hash = '';
  return url.href;
}

/** Candidate URLs to share: the current app URL, or LAN URLs when running on localhost in dev. */
function shareUrls(): { urls: string[]; lan: boolean } {
  if (isLocalHost(window.location.hostname) && LAN_URLS.length) return { urls: LAN_URLS, lan: true };
  return { urls: [appUrl()], lan: false };
}

export function DeviceButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className="device">
      <button type="button" className="btn btn-hint" aria-expanded={open} onClick={() => setOpen(!open)} title="QRコードで友達に共有">
        📱 共有
      </button>
      {open && <SharePopover onClose={() => setOpen(false)} />}
    </div>
  );
}

function SharePopover({ onClose }: { onClose: () => void }) {
  const [{ urls, lan }] = useState(shareUrls);
  const [index, setIndex] = useState(0);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const url = urls[index];
  const dialog = useDialog<HTMLDivElement>(onClose);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#050C1C', light: '#FFFFFF' } }).then(
      (data) => alive && setQr(data),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked (e.g. non-secure LAN http); the URL text is selectable as a fallback.
    }
  };
  const canShare = typeof navigator.share === 'function' && !lan;
  const share = () => {
    navigator
      .share({ title: 'Label Drop', text: '情報を分けて名付ける練習ゲーム「Label Drop」', url })
      .catch(() => undefined);
  };

  return (
    <div className="device-popover" role="dialog" aria-label="このアプリを共有" ref={dialog}>
      <div className="device-head">
        <p className="kicker">{lan ? 'SAME-LAN DEVICE TEST' : 'SHARE LABEL DROP'}</p>
        <button type="button" className="btn-mini" aria-label="閉じる" onClick={onClose}>
          ×
        </button>
      </div>
      {url ? (
        <>
          <p className="device-lead">
            {lan
              ? '開発中のため、同じWi-FiにつないだスマホでQRコードを読み取ってください。'
              : 'スマホのカメラでQRコードを読み取ると、このアプリが開きます。'}
          </p>
          {qr && <img className="device-qr" src={qr} alt={`${url} のQRコード`} width={220} height={220} />}
          <p className="device-url num">{url}</p>
          <div className="device-actions">
            <button type="button" className="btn" onClick={copy}>
              {copied ? 'コピーしました' : 'リンクをコピー'}
            </button>
            {canShare && (
              <button type="button" className="btn" onClick={share}>
                共有メニュー
              </button>
            )}
          </div>
          {urls.length > 1 && (
            <label className="device-pick">
              ほかのネットワーク
              <select value={index} onChange={(e) => setIndex(Number(e.target.value))}>
                {urls.map((u, i) => (
                  <option key={u} value={i}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          )}
          {lan && (
            <p className="device-note">つながらないときは、Windows のファイアウォールで Node.js の「プライベートネットワーク」の通信を許可してください。</p>
          )}
        </>
      ) : (
        <p className="device-lead">共有できるURLが見つかりません。</p>
      )}
    </div>
  );
}
