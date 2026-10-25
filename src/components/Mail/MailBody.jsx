import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mailService } from "../../services/mailService";

// Where the server pointed a cid: picture before its blob is fetched.
const ATTACHMENT_URL = /\/api\/hr-mail\/messages\/\d+\/attachments\/(\d+)\//g;

/**
 * The mail wrapped for the sandboxed frame, looking as it was sent: its
 * pictures and fonts load as they would in the sender's own mail client.
 * The policy below lets pictures, inline styles and fonts in and nothing
 * else -- no scripts, no forms, no frames, no stylesheets from elsewhere.
 */
function srcDoc(body) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data: https: http:; style-src 'unsafe-inline'; font-src data: https:">
<meta name="referrer" content="no-referrer"><base target="_blank">
<style>
html,body{margin:0;padding:0}
body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2430;padding:4px 2px;overflow-x:auto;word-break:break-word;background:#fff}
img{max-width:100%;height:auto}table{max-width:100%}a{color:#2563eb}
blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #d8dce6;color:#5b6478}
</style></head><body>${body}</body></html>`;
}

/**
 * The mail as the sender wrote it. Mail HTML is written by strangers, so it
 * never goes into this page: it goes into an iframe whose sandbox grants no
 * scripting. allow-same-origin is there only so the height can be measured;
 * without allow-scripts nothing can use it. Plain-text mail stays plain text.
 *
 * Give it key={mail.id}: a new mail is a new frame.
 */
export default function MailBody({ mail }) {
  const [html, setHtml] = useState("");
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
      // The sender's own pictures (a signature logo) come with the login, as blobs.
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

  const doc = useMemo(() => srcDoc(html), [html]);

  // Grow the frame to the mail, and again as its pictures arrive and push it longer.
  const fit = useCallback(() => {
    const body = frameRef.current?.contentDocument?.body;
    if (!body) return;
    const measure = () => setHeight(Math.min(Math.max(body.scrollHeight + 16, 120), 8000));
    measure();
    body.querySelectorAll("img").forEach((img) => {
      if (!img.complete) img.addEventListener("load", measure, { once: true });
    });
  }, []);

  if (!mail.body_html) {
    return <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{mail.body_text || "(No text)"}</div>;
  }

  return (
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
  );
}
