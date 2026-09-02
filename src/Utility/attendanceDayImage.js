/**
 * Today's attendance as a PNG, for sending to somebody who is not going to open
 * the app: a WhatsApp group, a manager, a printout.
 *
 * Drawn on a canvas rather than screenshotted off the page. html2canvas would
 * have been the quick answer, but this stylesheet defines its colours in oklch
 * in seventy-five places and reads them through CSS variables — exactly what
 * html2canvas cannot resolve, so the picture would come out with the wrong
 * colours or none. Drawing it means the output cannot be broken by a colour
 * function, needs no dependency, and stays crisp at any row count.
 *
 * The palette here is deliberately literal for the same reason: an exported
 * image is not themed. It is one fixed thing on white, readable printed.
 *
 * No overtime column: the sheet that gets sent round is a register of who was
 * in and for how long. Overtime is a payroll figure and it belongs on a
 * payslip, where it can be argued with.
 */

const SCALE = 2; // for a crisp image on any screen and in print

const INK = "#111827";
const MUTED = "#6b7280";
const RULE = "#e5e7eb";
const HEAD_BG = "#f3f4f6";
const BRAND = "#4438ca";
const GREEN = "#0f6f4c";
const RED = "#b02b25";
const AMBER = "#92400e";
const STRIPE = "#fafafa";

const PAD = 28;
const ROW_H = 34;
const HEAD_H = 36;

const COLUMNS = [
  { key: "name", label: "Employee", width: 250, align: "left" },
  { key: "department", label: "Department", width: 150, align: "left" },
  { key: "branch", label: "Branch", width: 110, align: "left" },
  { key: "in", label: "Clock In", width: 110, align: "center" },
  { key: "out", label: "Clock Out", width: 110, align: "center" },
  { key: "hours", label: "Hours", width: 90, align: "right" },
  { key: "status", label: "Status", width: 110, align: "center" },
];

const TABLE_W = COLUMNS.reduce((sum, c) => sum + c.width, 0);
const WIDTH = TABLE_W + PAD * 2;

const STATUS_COLOR = {
  Present: GREEN,
  Absent: RED,
  Leave: AMBER,
  Late: AMBER,
};

function line(ctx, x1, y, x2, color = RULE) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  // The half pixel is what keeps a 1px rule from being drawn across two rows
  // of pixels at 50% each, which reads as a soft grey smudge.
  ctx.moveTo(x1, y + 0.5);
  ctx.lineTo(x2, y + 0.5);
  ctx.stroke();
}

function text(ctx, value, x, y, { align = "left", color = INK, weight = "400", size = 13 } = {}) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Segoe UI", system-ui, -apple-system, Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}

/** Cut a value to the column it lives in, so nothing overlaps its neighbour. */
function fit(ctx, value, maxWidth, size = 13, weight = "400") {
  ctx.font = `${weight} ${size}px "Segoe UI", system-ui, -apple-system, Arial, sans-serif`;
  let out = String(value ?? "");
  if (ctx.measureText(out).width <= maxWidth) return out;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

/**
 * Build the PNG. `rows` are already the ones to show, in the order to show them.
 * Returns a blob; the caller decides what to do with it.
 */
export function drawAttendanceDay({ rows, dayLabel, scopeLabel, totals }) {
  const height = PAD * 2 + 74 + HEAD_H + rows.length * ROW_H + 52;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);

  // ---------------------------------------------------------------- masthead
  let y = PAD + 10;
  text(ctx, "Renderways Technology", PAD, y, { weight: "700", size: 19, color: BRAND });
  text(ctx, "Daily Attendance", WIDTH - PAD, y, {
    align: "right",
    weight: "600",
    size: 13,
    color: MUTED,
  });

  y += 24;
  text(ctx, dayLabel, PAD, y, { weight: "600", size: 14 });
  text(ctx, scopeLabel, WIDTH - PAD, y, { align: "right", size: 12, color: MUTED });

  y += 22;
  const summary = `Present ${totals.present}   ·   Absent ${totals.absent}   ·   On leave ${totals.leave}   ·   ${rows.length} ${rows.length === 1 ? "record" : "records"}`;
  text(ctx, summary, PAD, y, { size: 12, color: MUTED });

  y += 18;
  line(ctx, PAD, y, WIDTH - PAD, INK);

  // ------------------------------------------------------------ table header
  ctx.fillStyle = HEAD_BG;
  ctx.fillRect(PAD, y + 1, TABLE_W, HEAD_H);

  let x = PAD;
  for (const col of COLUMNS) {
    const cx = col.align === "right" ? x + col.width - 10 : col.align === "center" ? x + col.width / 2 : x + 10;
    text(ctx, col.label, cx, y + 1 + HEAD_H / 2, {
      align: col.align,
      weight: "700",
      size: 11,
      color: MUTED,
    });
    x += col.width;
  }
  y += 1 + HEAD_H;
  line(ctx, PAD, y, WIDTH - PAD);

  // -------------------------------------------------------------- the rows
  rows.forEach((row, index) => {
    const top = y;
    if (index % 2 === 1) {
      ctx.fillStyle = STRIPE;
      ctx.fillRect(PAD, top + 1, TABLE_W, ROW_H);
    }
    const mid = top + 1 + ROW_H / 2;

    let cx = PAD;
    for (const col of COLUMNS) {
      const raw = row[col.key] ?? "—";
      const isStatus = col.key === "status";
      const isName = col.key === "name";
      const color = isStatus ? STATUS_COLOR[row.status] || MUTED : isName ? INK : "#374151";
      const weight = isName || isStatus ? "600" : "400";
      const value = fit(ctx, raw, col.width - 20, 13, weight);
      const px =
        col.align === "right" ? cx + col.width - 10 : col.align === "center" ? cx + col.width / 2 : cx + 10;
      text(ctx, value, px, mid, { align: col.align, color, weight });
      cx += col.width;
    }

    y = top + 1 + ROW_H;
    line(ctx, PAD, y, WIDTH - PAD);
  });

  // ---------------------------------------------------------------- footer
  y += 20;
  text(
    ctx,
    `Generated ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`,
    PAD,
    y,
    { size: 11, color: MUTED },
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not build the image"));
    }, "image/png");
  });
}

/**
 * Hand the blob to the browser as a download.
 *
 * NOTE: this works in a browser and does nothing inside the APK. Capacitor
 * registers no DownloadListener, so an <a download> is silently dropped in the
 * WebView — the same reason the payslip PDF had to be served from a URL. This
 * export is an office action on a desktop, which is where it is offered.
 */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Freed on the next tick: revoking before the click is handled cancels the
  // download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
