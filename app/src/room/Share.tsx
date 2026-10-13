// Invite people to this app: a QR code large enough to read off a projector, the link, and the
// phone's own share sheet. The address is never hard-coded: it is wherever this edition is running
// (so the pin edition and the DX edition each show their own). On the dev server it uses the
// machine's LAN addresses instead, because a "localhost" QR code can't be opened from another device.
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { appUrl } from '../ui/DevicePanel';
import { useDialog } from '../ui/useDialog';
import { EDITION } from './edition';

const LAN_URLS: string[] = __LAN_URLS__;
const APP_NAME = EDITION === 'dx' ? 'Mato mate DX' : 'Mato mate';
const QR_SIZE = 320;

function shareUrls(): { urls: string[]; lan: boolean } {
  const host = window.location.hostname;
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
  if (local && LAN_URLS.length) return { urls: LAN_URLS, lan: true };
  return { urls: [appUrl()], lan: false };
}

export function ShareButton({ label = '📱 QRで招待' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn share-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && <ShareDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareDialog({ onClose }: { onClose: () => void }) {
  const [{ urls, lan }] = useState(shareUrls);
  const [index, setIndex] = useState(0);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const url = urls[index];
  const dialog = useDialog<HTMLDivElement>(onClose);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    // Drawn at twice the shown size, so it stays sharp when a projector enlarges it.
    QRCode.toDataURL(url, { margin: 1, width: QR_SIZE * 2, color: { dark: '#050C1C', light: '#FFFFFF' } }).then(
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
    navigator.share({ title: APP_NAME, text: `チームで仕分けて名前を付けるゲーム「${APP_NAME}」`, url }).catch(() => undefined);
  };

  return (
    <div className="share" role="dialog" aria-modal="true" aria-label={`${APP_NAME} に招待する`} ref={dialog} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="share-card">
        <div className="share-head">
          <p className="kicker">{lan ? 'SAME-LAN DEVICE TEST' : `JOIN ${APP_NAME.toUpperCase()}`}</p>
          <button type="button" className="btn-mini" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>
        {url ? (
          <>
            <p className="share-lead">
              {lan ? '開発中のため、同じWi-FiにつないだスマホでQRコードを読み取ってください。' : 'スマホのカメラでQRコードを読み取ると、このアプリが開きます。'}
            </p>
            {qr && <img className="share-qr" src={qr} alt={`${url} のQRコード`} width={QR_SIZE} height={QR_SIZE} />}
            <p className="share-url num">{url}</p>
            <div className="share-actions">
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
          </>
        ) : (
          <p className="share-lead">共有できるURLが見つかりません。</p>
        )}
      </div>
    </div>
  );
}
