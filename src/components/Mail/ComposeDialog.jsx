import { useRef, useState } from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { mailService } from "../../services/mailService";

const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function size(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * A new mail from the HR mailbox. Nothing here sends on its own: Send asks
 * first, naming the people it will reach, because it goes out under the
 * company's name and cannot be taken back.
 */
// Mounted only while open, so every new mail starts empty.
export default function ComposeDialog({ open, onOpenChange, mailbox, onSent }) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const picker = useRef(null);

  const total = files.reduce((sum, file) => sum + file.size, 0);

  const addFiles = (list) => {
    setFiles((current) => [...current, ...Array.from(list || [])]);
    if (picker.current) picker.current.value = "";
  };

  const send = async (event) => {
    event.preventDefault();
    setError("");
    if (total > MAX_TOTAL_BYTES) {
      setError("Attachments can be at most 20 MB together.");
      return;
    }
    const people = [to, cc].filter((v) => v.trim()).join(", ");
    if (!window.confirm(`Send this mail from ${mailbox} to ${people}?`)) return;
    setSending(true);
    try {
      await mailService.compose({ to, cc, subject, body, files });
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      setError(e?.response?.data?.detail || "The mail did not go. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[94vw] md:max-w-[720px] w-full p-6 max-h-[92vh] overflow-y-auto bg-background border-border shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">New mail</DialogTitle>
          <DialogDescription className="text-xs">From {mailbox}. The person who presses Send is recorded with it.</DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}
        <form onSubmit={send} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mail-to" className="text-xs font-bold">To *</Label>
            <Input id="mail-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com, another@example.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mail-cc" className="text-xs font-bold">Cc</Label>
            <Input id="mail-cc" value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mail-subject" className="text-xs font-bold">Subject *</Label>
            <Input id="mail-subject" value={subject} maxLength={300} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mail-body" className="text-xs font-bold">Message *</Label>
            <textarea
              id="mail-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <input ref={picker} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <Button type="button" variant="outline" size="sm" onClick={() => picker.current?.click()} className="gap-1 rounded-lg">
              <Paperclip className="h-3.5 w-3.5" /> Attach files
            </Button>
            {files.length > 0 && (
              <ul className="space-y-1 text-sm">
                {files.map((file, i) => (
                  <li key={`${file.name}-${i}`} className="flex items-center gap-2">
                    <span className="truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{size(file.size)}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => setFiles((current) => current.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                <li className={`text-xs ${total > MAX_TOTAL_BYTES ? "text-destructive" : "text-muted-foreground"}`}>
                  {size(total)} of 20 MB
                </li>
              </ul>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={sending} className="rounded-xl">
              Cancel
            </Button>
            <Button type="submit" disabled={sending} className="rounded-xl gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
