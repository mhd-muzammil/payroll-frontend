import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mailService } from "../../services/mailService";

// Where the server pointed a cid: picture before its blob is fetched.
const ATTACHMENT_URL = /\/api\/hr-mail\/messages\/\d+\/attachments\/(\d+)\//g;

/**
 * Hold back pictures on other people's servers. Loading one tells the sender
 * the mail was opened, from where and when -- so, as Outlook and Gmail do,
 * they wait until asked. The sender's own attached pictures cost no request.
 */
function blockRemoteImages(html) {
  let blocked = 0;
  const out = String(html || "").replace(
    /(<img\b[^>]*?)\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (whole, head, dq, sq, bare) => {
      const url = (dq ?? sq ?? bare ?? "").trim();
      if (!/^https?:/i.test(url)) return whole;
      blocked += 1;
      return `${head} data-blocked-src="${url.replace(/"/g, "&quot;")}"`;
    },
  );
  return { html: out, blocked };
}

/**
 * The mail wrapped for the sandboxed frame. The policy below is the third
 * layer: the server stripped scripts, the sandbox runs none, and this stops
 * the page reaching the network for anything but the pictures allowed.
 */
function srcDoc(body, showImages) {
  const images = showImages ? "blob: data: https: http:" : "blob: data:";
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${images}; style-src 'unsafe-inline'; font-src data:">
<meta name="referrer" content="no-referrer"><base target="_blank">
<style>
html,body{margin:0;padding:0}
body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2430;padding:4px 2px;overflow-x:auto;word-break:break-word;background:#fff}
img{max-width:100%;height:auto}table{max-width:100%}a{color:#2563eb}
blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #d8dce6;color:#5b6478}
img[data-blocked-src]{min-width:12px;min-height:12px;border:1px dashed #c7cddb;border-radius:4px;background:#f4f6fa}
</style></head><body>${body}</body></html>`;
}

/**
 * The mail as the sender wrote it. Mail HTML is written by strangers, so it
 * never goes into this page: it goes into an iframe whose sandbox grants no
 * scripting. allow-same-origin is there only so the height can be measured;
 * without allow-scripts nothing can use it. Plain-text mail stays plain text.
 *
 * Give it key={mail.id}: a new mail is a new frame, with its pictures held
 * back again.
 */
export default function MailBody({ mail }) {
  const [html, setHtml] = useState("");
  const [showImages, setShowImages] = useState(false);
  const [height, setHeight] = useState(320);
  const frameRef = useRef(null);
  const blobs = useRef([]);

  useEffect(() => {
    let cancelled = false;
    const release = () => {
      blobs.current.forEach((url) => URL.revokeObjectURL(url));
      blobs.current = [];
    };
    (async () => {
      const inline = (mail.attachments || []).filter((a) => a.is_inline);
      const urls = new Map();
      for (const attachment of inline) {
        try {
          const url = await mailService.attachmentBlobUrl(mail.id, attachment.id);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          blobs.current.push(url);
          urls.set(String(attachment.id), url);
        } catch {
          // One picture that will not load is not worth losing the mail over.
        }
      }
      if (!cancelled) setHtml(String(mail.body_html || "").replace(ATTACHMENT_URL, (whole, id) => urls.get(id) || whole));
    })();
    return () => {
      cancelled = true;
      release();
    };
  }, [mail]);

  const blocked = useMemo(() => blockRemoteImages(html), [html]);
  const doc = useMemo(
    () => srcDoc(showImages ? blocked.html.replace(/\sdata-blocked-src=/gi, " src=") : blocked.html, showImages),
    [blocked.html, showImages],
  );

  const fit = useCallback(() => {
    const body = frameRef.current?.contentDocument?.body;
    if (body) setHeight(Math.min(Math.max(body.scrollHeight + 16, 120), 6000));
  }, []);

  if (!mail.body_html) {
    return <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{mail.body_text || "(No text)"}</div>;
  }

  return (
    <div>
      {blocked.blocked > 0 && !showImages && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {blocked.blocked} picture{blocked.blocked === 1 ? "" : "s"} from the internet held back: loading them tells the
            sender you opened this mail.
          </span>
          <button
            type="button"
            onClick={() => setShowImages(true)}
            className="ml-auto rounded-md border border-border bg-background px-3 py-1 font-semibold text-foreground hover:bg-muted"
          >
            Show pictures
          </button>
        </div>
      )}
      <iframe
        ref={frameRef}
        title="Mail"
        srcDoc={doc}
        onLoad={fit}
        // No allow-scripts and no allow-forms: nothing in a mail can run or post.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="block w-full rounded-md border-0 bg-white"
        style={{ height }}
      />
    </div>
  );
}
