import { useState, useEffect, useMemo, useCallback } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from "../ui/PageHeader";
import { getUserRole, ROLES } from "../../auth/rbac";
import Toolbar from "../ui/Toolbar";
import DataTable from "../ui/DataTable";
import { Download, Eye, Sparkles, Loader2, Printer, MapPin, Users, Mail, Search, Play, RefreshCw, Calendar, ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { api, Base_URL } from "@/api/Api";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { extractArray } from "../../Utility/apiUtils";

const regionStyles = {
  Chennai: {
    bg: "from-indigo-50/50 to-purple-50/30 dark:from-indigo-950/20 dark:to-purple-950/10",
    border: "border-indigo-100 dark:border-indigo-950/50",
    iconBg: "bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400",
    bar: "from-indigo-500 to-purple-500",
    text: "text-indigo-700 dark:text-indigo-300"
  },
  Vellore: {
    bg: "from-blue-50/50 to-sky-50/30 dark:from-blue-950/20 dark:to-sky-950/10",
    border: "border-blue-100 dark:border-blue-950/50",
    iconBg: "bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400",
    bar: "from-blue-500 to-sky-500",
    text: "text-blue-700 dark:text-blue-300"
  },
  Salem: {
    bg: "from-emerald-50/50 to-teal-50/30 dark:from-emerald-950/20 dark:to-teal-950/10",
    border: "border-emerald-100 dark:border-emerald-950/50",
    iconBg: "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400",
    bar: "from-emerald-500 to-teal-500",
    text: "text-emerald-700 dark:text-emerald-300"
  },
  Kanchipuram: {
    bg: "from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10",
    border: "border-amber-100 dark:border-amber-950/50",
    iconBg: "bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400",
    bar: "from-amber-500 to-orange-500",
    text: "text-amber-700 dark:text-amber-300"
  },
  Hosur: {
    bg: "from-rose-50/50 to-pink-50/30 dark:from-rose-950/20 dark:to-rose-950/10",
    border: "border-rose-100 dark:border-rose-950/50",
    iconBg: "bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400",
    bar: "from-rose-500 to-pink-500",
    text: "text-rose-700 dark:text-rose-300"
  }
};

const defaultStyle = {
  bg: "from-gray-50/50 to-slate-50/30 dark:from-gray-950/20 dark:to-slate-950/10",
  border: "border-gray-100 dark:border-gray-950/50",
  iconBg: "bg-gray-100 dark:bg-gray-950/80 text-gray-600 dark:text-gray-400",
  bar: "from-gray-500 to-slate-500",
  text: "text-gray-700 dark:text-gray-300"
};

const PayslipsPage = () => {
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState("");

  // New States for Employee List and Month/Year generation
  // An engineer has no business on the generation side of this screen: there is
  // nothing here for them to run, and the controls for running it read as
  // theirs. Their payslips ARE the history, so that is where they start and stay.
  const isEmployee = getUserRole() === ROLES.EMPLOYEE;

  // The payslip is a 760px document. On a phone that is either an overview or
  // it is readable, and which one you want depends on whether you are checking
  // the net figure or reading the whole thing, so it is a control rather than a
  // decision made for you. Starts fitted, because the first thing you want is
  // to see that the sheet is the right shape.
  // A callback ref, not useRef: the sheet renders through a Radix portal that
  // is not in the DOM yet when the effect after setSelectedSlip runs, so a
  // plain ref reads null exactly once and the measurement never happens. This
  // fires when the node actually attaches.
  const [previewEl, setPreviewEl] = useState(null);
  const [fitToWidth, setFitToWidth] = useState(true);
  const [fitScale, setFitScale] = useState(1);
  const [activeTab, setActiveTab] = useState(isEmployee ? "history" : "generate"); // "generate" | "history"
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [monthSlips, setMonthSlips] = useState([]);
  const [monthSlipsLoading, setMonthSlipsLoading] = useState(false);
  
  const [genMonth, setGenMonth] = useState(() => new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState(() => new Date().getFullYear());
  const [query, setQuery] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");

  const monthsList = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" }
  ];

  const yearsList = [2025, 2026, 2027, 2028];

  const fetchEmployees = async () => {
    setEmployeesLoading(true);
    try {
      const res = await api.get("/api/employees/");
      setEmployees(extractArray(res.data));
    } catch (err) {
      console.error("Failed to fetch employees:", err);
    } finally {
      setEmployeesLoading(false);
    }
  };

  const fetchMonthSlips = async (m = genMonth, y = genYear) => {
    setMonthSlipsLoading(true);
    try {
      const res = await api.get(`/api/payslips/?month=${m}&year=${y}`);
      setMonthSlips(extractArray(res.data));
    } catch (err) {
      console.error("Failed to fetch month payslips:", err);
    } finally {
      setMonthSlipsLoading(false);
    }
  };

  const fetchPayslips = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/payslips/");
      setSlips(extractArray(res.data));
    } catch (err) {
      console.error("Failed to fetch payslips:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (activeTab === "generate") {
      fetchMonthSlips(genMonth, genYear);
    } else {
      fetchPayslips();
    }
  }, [genMonth, genYear, activeTab]);

  const handleGenerateSpecific = async (employeeId, employeeName) => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await api.post("/api/payslips/generate_all/", {
        month: genMonth,
        year: genYear,
        employee_id: employeeId
      });
      alert(res.data?.message || `Successfully processed payslip for ${employeeName}!`);
      fetchMonthSlips(genMonth, genYear);
    } catch (err) {
      console.error("Failed to generate payslip:", err);
      alert(err.response?.data?.error || "Failed to generate payslip. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateBulk = async () => {
    if (generating) return;
    if (!window.confirm(`Are you sure you want to generate payslips for all active employees for ${getMonthLabel(genMonth)} ${genYear}?`)) {
      return;
    }
    setGenerating(true);
    try {
      const res = await api.post("/api/payslips/generate_all/", {
        month: genMonth,
        year: genYear
      });
      alert(res.data?.message || "Successfully generated all payslips!");
      fetchMonthSlips(genMonth, genYear);
    } catch (err) {
      console.error("Failed to generate payslips:", err);
      alert(err.response?.data?.error || "Failed to bulk generate payslips.");
    } finally {
      setGenerating(false);
    }
  };

  const getMonthLabel = (monthNum) => {
    const months = [
      "January", "February", "March", "April", "May", "June", 
      "July", "August", "September", "October", "November", "December"
    ];
    return months[monthNum - 1] || monthNum;
  };

  const getPeriodDates = (month, year) => {
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    const startMonthName = getMonthLabel(prevMonth).substring(0, 3);
    const endMonthName = getMonthLabel(month).substring(0, 3);
    return `25 ${startMonthName} ${prevYear} to 24 ${endMonthName} ${year}`;
  };

  const formatBankAccount = (accNum) => {
    if (!accNum) return "N/A";
    const str = String(accNum).trim();
    if (str.length <= 4) return str;
    return "*".repeat(str.length - 4) + str.slice(-4);
  };

  // Matches how the API already formats dob, so the two dates on the slip read
  // the same way.
  const formatSlipDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}-${mm}-${d.getFullYear()}`;
  };

  const formatINR = (amount) => {
    if (!amount) return "0.00";
    return parseFloat(amount).toLocaleString("en-IN", { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  const [emailingSlipId, setEmailingSlipId] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // Manual editing of days / other-deduction on the payslip preview dialog.
  const [editTotalDays, setEditTotalDays] = useState("");
  const [editLop, setEditLop] = useState("");
  const [editPaidDays, setEditPaidDays] = useState("");
  const [editOtherDed, setEditOtherDed] = useState("");
  const [editSpecialWork, setEditSpecialWork] = useState("");
  const [recalculating, setRecalculating] = useState(false);
  const [reverting, setReverting] = useState(false);

  // Keep the editable inputs in sync whenever a different slip is opened.
  useEffect(() => {
    if (selectedSlip) {
      setEditTotalDays(String(parseFloat(selectedSlip.total_days ?? 0)));
      setEditLop(String(parseFloat(selectedSlip.lop_days ?? 0)));
      setEditPaidDays(String(parseFloat(selectedSlip.paid_days ?? 0)));
      setEditOtherDed(String(parseFloat(selectedSlip.deduction_other ?? 0)));
      setEditSpecialWork(String(parseFloat(selectedSlip.special_work_days ?? 0)));
    }
  }, [selectedSlip]);

  const applyUpdatedSlip = (updated) => {
    setSelectedSlip(updated);
    setSlips((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setMonthSlips((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  // `field` tells the handler which value the operator just edited, so we send
  // the matching key. Days are resolved server-side (paid_days wins over lop).
  const handleRecalculate = async (field) => {
    if (!selectedSlip || recalculating || reverting) return;

    const totalDays = parseFloat(editTotalDays);
    if (isNaN(totalDays) || totalDays <= 0) {
      alert("Total Days must be a number greater than 0.");
      return;
    }

    const payload = { total_days: totalDays };

    if (field === "paid_days") {
      const v = parseFloat(editPaidDays);
      if (isNaN(v) || v < 0 || v > totalDays) {
        alert(`No of Days must be between 0 and ${totalDays}.`);
        return;
      }
      payload.paid_days = v;
    } else if (field === "lop_days") {
      const v = parseFloat(editLop);
      if (isNaN(v) || v < 0 || v > totalDays) {
        alert(`No of Lop Days must be between 0 and ${totalDays}.`);
        return;
      }
      // Fractional LOP (e.g. 0.5 for a half day) is deducted proportionally.
      payload.lop_days = v;
    } else if (field === "other_deduction") {
      const v = parseFloat(editOtherDed);
      if (isNaN(v) || v < 0) {
        alert("Other Deduction must be 0 or more.");
        return;
      }
      payload.other_deduction = v;
      // Preserve the current LOP split when only the deduction changes.
      payload.lop_days = parseFloat(editLop) || 0;
    } else if (field === "total_days") {
      // Only the cycle length changed; keep the existing LOP split.
      payload.lop_days = parseFloat(editLop) || 0;
    } else if (field === "special_work_days") {
      const v = parseFloat(editSpecialWork);
      if (isNaN(v) || v < 0 || v > totalDays) {
        alert(`Special Work must be between 0 and ${totalDays} days.`);
        return;
      }
      payload.special_work_days = v;
      // Keep the current absence split: only the extra work changed.
      payload.lop_days = parseFloat(editLop) || 0;
    }

    setRecalculating(true);
    try {
      const res = await api.post(`/api/payslips/${selectedSlip.id}/recalculate/`, payload);
      applyUpdatedSlip(res.data);
      alert("Payslip recalculated and saved successfully.");
    } catch (err) {
      console.error("Failed to recalculate payslip:", err);
      alert(err.response?.data?.error || "Failed to recalculate payslip. Please try again.");
    } finally {
      setRecalculating(false);
    }
  };

  const handleRevert = async () => {
    if (!selectedSlip || recalculating || reverting) return;
    if (!window.confirm("Undo all manual edits and recalculate this payslip from attendance records?")) {
      return;
    }
    setReverting(true);
    try {
      const res = await api.post(`/api/payslips/${selectedSlip.id}/revert/`);
      applyUpdatedSlip(res.data);
      alert("Payslip reverted to attendance-based values.");
    } catch (err) {
      console.error("Failed to revert payslip:", err);
      alert(err.response?.data?.error || "Failed to revert payslip. Please try again.");
    } finally {
      setReverting(false);
    }
  };

  const handleEmailPayslip = async (slip) => {
    if (!slip?.employee_details?.email) {
      alert("This employee does not have a registered email address. Please edit their profile first.");
      return;
    }
    
    if (!window.confirm(`Are you sure you want to send the payslip email to ${slip.employee_details.employee_name} (${slip.employee_details.email})?`)) {
      return;
    }
    
    setEmailingSlipId(slip.id);
    try {
      await api.post(`/api/payslips/${slip.id}/email_payslip/`);
      alert(`Payslip successfully sent to ${slip.employee_details.email}!`);
    } catch (err) {
      console.error("Failed to email payslip:", err);
      alert(err.response?.data?.error || "Failed to email payslip. Please try again later.");
    } finally {
      setEmailingSlipId(null);
    }
  };

  // Bulletproof Direct Print Engine: Clones target HTML inside a hidden iframe and triggers browser printing.
  // This isolates styles perfectly and prevents styles leakage or unaligned outputs when saving as PDF!
  // Everything that closes the sheet goes through here so the history entry
  // pushed below is always unwound the same way.
  const closeSlip = useCallback(() => setSelectedSlip(null), []);

  // Android's hardware Back. Radix closes this sheet on Escape, which no phone
  // has, so Back would otherwise leave the payslips page entirely -- or quit
  // the app. One history entry while the sheet is open turns Back into "close
  // the payslip", which is what it means to the person holding the phone.
  useEffect(() => {
    if (!selectedSlip) return undefined;

    window.history.pushState({ payslipSheet: true }, "");
    const onPop = () => setSelectedSlip(null);
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed by the Back button or the X rather than by the system gesture:
      // our entry is still on the stack, so drop it. Otherwise the next Back
      // would do nothing visible and have to be pressed twice.
      if (window.history.state?.payslipSheet) window.history.back();
    };
  }, [selectedSlip]);

  // How much the 760px document has to shrink to fit the space it is given.
  // Measured rather than assumed: the same sheet is a phone, a tablet in a
  // split view, and a desktop dialog.
  useEffect(() => {
    if (!previewEl || typeof ResizeObserver === "undefined") return undefined;

    const measure = () => {
      const padding = 32; // p-4 either side; md:p-8 only applies where it fits anyway
      setFitScale(Math.min(1, (previewEl.clientWidth - padding) / 760));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(previewEl);
    return () => observer.disconnect();
  }, [previewEl]);

  // The real download. window.print() — what the button used to call — does
  // nothing at all inside an Android WebView, and neither does an <a download>
  // with a blob, because Capacitor registers no DownloadListener: in the app
  // the button was simply inert.
  //
  // What Capacitor DOES do is hand any URL whose host differs from the site's
  // to the system browser (Bridge.launchIntent), and the API is on a different
  // host from the site. So this navigates to a backend URL that answers with
  // application/pdf, which opens Chrome and saves the file. On a desktop the
  // same navigation just downloads, because the response is an attachment.
  //
  // A navigation carries no Authorization header, so the JWT cannot authorise
  // it. Instead we spend the authenticated channel we already have on a
  // short-lived signed ticket naming this one payslip.
  const handleDownloadPdf = async () => {
    if (!selectedSlip || downloading) return;
    setDownloading(true);
    try {
      const res = await api.get(`/api/payslips/${selectedSlip.id}/pdf_ticket/`);
      const path = res?.data?.path;
      if (!path) throw new Error("No download link came back.");
      // Absolute and on the API host — a relative URL would stay inside the
      // WebView, where nothing can save a file.
      window.location.href = `${Base_URL}${path}`;
    } catch (err) {
      console.error("Payslip PDF download failed:", err);
      alert(
        err?.response?.data?.detail ||
          "Could not prepare the PDF. Please check your connection and try again."
      );
    } finally {
      setDownloading(false);
    }
  };

  const handlePrintIframe = () => {
    const printableElement = document.getElementById("printable-payslip-core");
    if (!printableElement) return;

    // 1. Remove existing printing frame if exists
    let frame = document.getElementById("hidden-printing-iframe");
    if (frame) document.body.removeChild(frame);

    // 2. Create new isolated frame
    frame = document.createElement("iframe");
    frame.id = "hidden-printing-iframe";
    frame.style.position = "absolute";
    frame.style.width = "0px";
    frame.style.height = "0px";
    frame.style.border = "none";
    frame.style.left = "-9999px";
    
    document.body.appendChild(frame);
    const doc = frame.contentWindow.document;

    // 3. Write basic standard HTML structure with explicit printing CSS directives
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Employee Payslip</title>
          <style>
            @page {
              size: portrait;
              margin: 12mm 8mm 12mm 8mm;
            }
            body {
              font-family: 'Times New Roman', Times, serif;
              color: #000;
              background-color: #fff;
              margin: 0;
              padding: 0;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              box-sizing: border-box;
            }
            table {
              border-collapse: collapse;
              width: 100%;
            }
            th, td {
              padding: 4px 6px;
              border: 1px solid #000;
              font-size: 11px;
            }
            .text-right {
              text-align: right;
            }
            .text-center {
              text-align: center;
            }
            .font-bold {
              font-weight: bold;
            }
            .bg-gray {
              background-color: #f3f4f6 !important;
            }
            /* On print, hide on-screen editors and reveal the plain values. */
            [data-print-hide="true"] {
              display: none !important;
            }
            .editable-print-value {
              display: inline !important;
            }
          </style>
        </head>
        <body>
          <div style="width: 100%; padding: 0px; display: flex; justify-content: center;">
            ${printableElement.outerHTML}
          </div>
        </body>
      </html>
    `);
    
    doc.close();

    // 4. Fire command once parsed and loaded
    frame.contentWindow.focus();
    setTimeout(() => {
      frame.contentWindow.print();
    }, 350);
  };

  // Table Constants to maintain absolute alignment regardless of layout or environment.
  const tableMainStyle = {
    width: "100%",
    // Keep the payslip legible on phones: scroll horizontally inside the
    // preview instead of squeezing every column into ~380px.
    minWidth: "680px",
    maxWidth: "780px",
    border: "4px solid #000",
    borderCollapse: "collapse",
    fontFamily: "'Times New Roman', serif",
    fontSize: "11.5px",
    color: "#000",
    backgroundColor: "#fff",
    margin: "0 auto",
    lineHeight: "1.3"
  };

  const tdStyle = {
    border: "1px solid #000",
    padding: "5px 7px",
    verticalAlign: "middle"
  };

  const labelStyle = {
    ...tdStyle,
    fontWeight: "bold",
    backgroundColor: "#f9fafb",
    width: "18%"
  };

  const valStyle = {
    ...tdStyle,
    width: "32%"
  };

  // Renders one editable "days" row (Total Days / LOP / No of Days). The plain
  // value is shown on print; the input + Save button are hidden from print.
  const renderEditableDaysRow = (label, value, inputValue, setInputValue, field, opts = {}) => {
    const isPaid = selectedSlip?.status === "Paid";
    const disabled = recalculating || reverting || isPaid;
    const color = opts.color || "#111827";
    const labelBg = opts.labelBg || "#f3f4f6";
    return (
      <tr>
        <td style={{ ...tdStyle, fontWeight: "bold", color, backgroundColor: labelBg }}>{label}</td>
        <td style={{ ...tdStyle, textAlign: "center", color, fontFamily: "monospace", fontWeight: "bold" }}>
          {/* Every one of these Save buttons recalculates the payslip from the
              number typed beside it. An engineer reading their own payslip was
              being handed their own LOP days to retype. The plain value that
              the print path already renders is exactly what they should see
              instead, so it is the same span, just shown. */}
          <span className="editable-print-value" style={{ display: isEmployee ? "inline" : "none" }}>{value}</span>
          {!isEmployee && (
          <span data-print-hide="true" style={{ display: "inline-flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
            <input
              type="number"
              min="0"
              step={opts.step || "0.5"}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={disabled}
              style={{
                width: "50px",
                textAlign: "center",
                color,
                fontFamily: "monospace",
                fontWeight: "bold",
                border: `1px solid ${color}`,
                borderRadius: "4px",
                padding: "1px 2px",
                backgroundColor: "#fff",
              }}
            />
            <button
              type="button"
              onClick={() => handleRecalculate(field)}
              disabled={disabled}
              title={isPaid ? "Paid payslip cannot be edited" : "Save & recalculate"}
              style={{
                cursor: disabled ? "not-allowed" : "pointer",
                fontSize: "9px",
                fontWeight: "bold",
                color: "#fff",
                backgroundColor: disabled ? "#9ca3af" : color,
                border: "none",
                borderRadius: "4px",
                padding: "2px 5px",
                fontFamily: "sans-serif",
              }}
            >
              {recalculating ? "..." : "Save"}
            </button>
          </span>
          )}
        </td>
      </tr>
    );
  };

  const regionStats = useMemo(() => {
    const listToUse = activeTab === "generate" ? employees : slips;
    const regions = ["Chennai", "Vellore", "Salem", "Kanchipuram", "Hosur"];
    const stats = {
      Chennai: 0,
      Vellore: 0,
      Salem: 0,
      Kanchipuram: 0,
      Hosur: 0,
      "Not Assigned": 0,
    };
    listToUse.forEach((item) => {
      const branch = activeTab === "generate" ? item.branch : item.employee_details?.branch;
      if (branch) {
        const matched = regions.find((reg) => reg.toLowerCase() === branch.trim().toLowerCase());
        if (matched) {
          stats[matched] += 1;
        } else {
          stats["Not Assigned"] += 1;
        }
      } else {
        stats["Not Assigned"] += 1;
      }
    });
    return stats;
  }, [employees, slips, activeTab]);

  const filteredSlips = useMemo(() => {
    let list = slips;
    if (selectedRegion) {
      list = list.filter((s) => {
        const branch = s.employee_details?.branch || "Not Assigned";
        return branch.toLowerCase() === selectedRegion.toLowerCase();
      });
    }
    if (historyQuery.trim() !== "") {
      const q = historyQuery.toLowerCase();
      list = list.filter(
        (s) =>
          (s.employee_details?.employee_name && s.employee_details.employee_name.toLowerCase().includes(q)) ||
          (s.employee_details?.emp_code && s.employee_details.emp_code.toLowerCase().includes(q)) ||
          getMonthLabel(s.month).toLowerCase().includes(q)
      );
    }
    return list;
  }, [slips, selectedRegion, historyQuery]);

  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (selectedRegion) {
      list = list.filter(e => e.branch?.toLowerCase() === selectedRegion.toLowerCase());
    }
    if (query.trim() !== "") {
      const q = query.toLowerCase();
      list = list.filter(
        e => 
          (e.employee_name && e.employee_name.toLowerCase().includes(q)) || 
          (e.emp_code && e.emp_code.toLowerCase().includes(q)) || 
          (e.role && e.role.toLowerCase().includes(q))
      );
    }
    return list;
  }, [employees, selectedRegion, query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEmployee ? "My Payslips" : "Payslips"}
        description={
          isEmployee
            ? "Your payslips, as they were issued. Open one to read it or save a copy."
            : "Generate, preview and distribute employee payslips."
        }
      />

      {/* Tab Switcher — there is only one side of this screen for an engineer. */}
      {!isEmployee && (
      <div className="flex rounded-2xl overflow-hidden bg-muted/40 p-1.5 max-w-md border border-border flex-1 min-w-[280px]">
        <button
          onClick={() => setActiveTab("generate")}
          className={`flex-1 py-2 text-center rounded-xl text-sm font-medium transition-all duration-200 ${
            activeTab === "generate"
              ? "bg-card text-foreground shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Generate Payslips
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-2 text-center rounded-xl text-sm font-medium transition-all duration-200 ${
            activeTab === "history"
              ? "bg-card text-foreground shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Payslip History
        </button>
      </div>
      )}

      {/* Region-Wise Payslip/Employee Distribution — a breakdown of the whole
          company is HR's view of payroll, not one engineer's own payslips. */}
      {!isEmployee && (
      <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-5 w-5 text-primary" />
          <span className="text-base font-bold tracking-tight text-foreground">
            {activeTab === "generate" ? "Region-Wise Staff Distribution" : "Region-Wise Payslip Distribution"}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <button
            onClick={() => setSelectedRegion("")}
            className={`bg-gradient-to-br from-indigo-50/50 to-purple-50/30 border border-indigo-100 rounded-2xl p-4 md:p-5 flex flex-col justify-between text-left transition-all duration-300 ${
              selectedRegion === "" 
                ? "ring-2 ring-primary ring-offset-1 dark:ring-offset-background shadow-md scale-[1.05]" 
                : "opacity-50 hover:opacity-100 scale-[0.95]"
            }`}
          >
            <span className="font-bold text-xs md:text-sm tracking-tight text-indigo-700">All Regions</span>
            <div className="flex items-baseline gap-1.5 mt-3">
              <span className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
                {activeTab === "generate" ? employees.length : slips.length}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                {activeTab === "generate" ? "staff" : "slips"}
              </span>
            </div>
          </button>
          {Object.entries(regionStats).map(([region, count]) => {
            if (region === "Not Assigned") return null;
            const style = regionStyles[region] || defaultStyle;
            const isSelected = selectedRegion.toLowerCase() === region.toLowerCase();
            const hasActiveFilter = selectedRegion !== "";

            return (
              <button
                key={region}
                onClick={() => setSelectedRegion(prev => prev.toLowerCase() === region.toLowerCase() ? "" : region)}
                className={`bg-gradient-to-br ${style.bg} border ${style.border} rounded-2xl p-4 md:p-5 flex flex-col justify-between text-left transition-all duration-300 ${
                  isSelected 
                    ? "ring-2 ring-primary ring-offset-1 dark:ring-offset-background shadow-md scale-[1.05]" 
                    : hasActiveFilter 
                      ? "opacity-50 hover:opacity-100 scale-[0.95]" 
                      : "hover:shadow-sm hover:scale-[1.02]"
                }`}
              >
                <span className={`font-bold text-xs md:text-sm tracking-tight ${style.text}`}>{region}</span>
                <div className="flex items-baseline gap-1.5 mt-3">
                  <span className="text-2xl md:text-3xl font-black tracking-tight text-foreground">{count}</span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {activeTab === "generate" ? "staff" : "slips"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {activeTab === "generate" ? (
        <>
          {/* Controls Bar for Generate Payslips */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-card border border-border/60 rounded-3xl p-5 shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Calculation Period:</span>
              </div>
              
              <select
                value={genMonth}
                onChange={(e) => setGenMonth(parseInt(e.target.value))}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {monthsList.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>

              <select
                value={genYear}
                onChange={(e) => setGenYear(parseInt(e.target.value))}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {yearsList.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              
              <span className="text-xs text-muted-foreground font-mono bg-muted/60 px-2.5 py-1.5 rounded-lg border border-border">
                Cycle: {getPeriodDates(genMonth, genYear)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 flex-grow sm:flex-grow-0 justify-end">
              <div className="relative w-full sm:w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search staff name/code..."
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              
              <Button
                icon={generating ? Loader2 : Sparkles}
                disabled={generating}
                onClick={handleGenerateBulk}
                variant="brand"
              >
                {generating ? "Generating..." : `Bulk Generate ${getMonthLabel(genMonth).substring(0,3)} Payslips`}
              </Button>
            </div>
          </div>

          {/* DataTable for Employee List */}
          {employeesLoading || monthSlipsLoading ? (
            <div className="flex h-64 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Syncing employee payroll status...</p>
            </div>
          ) : (
            <DataTable
              data={filteredEmployees}
              emptyMessage="No active employees found for this search/region criteria."
              columns={[
                {
                  key: "name", 
                  label: "Employee",
                  render: (emp) => (
                    <div className="flex items-center gap-3">
                      <Avatar name={emp.employee_name || "Emp"} />
                      <div>
                        <div className="text-sm font-medium">{emp.employee_name || "Unknown"}</div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{emp.email || "no email"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{emp.emp_code || `ID: ${emp.id}`} - {emp.role || "N/A"}</div>
                      </div>
                    </div>
                  ),
                },
                { 
                  key: "region", 
                  label: "Region/Branch", 
                  render: (emp) => <span className="text-sm font-medium text-foreground">{emp.branch || "Not Assigned"}</span> 
                },
                { 
                  key: "salary", 
                  label: "Base Salary", 
                  render: (emp) => (
                    <span className="text-sm font-medium font-mono text-muted-foreground">
                      ₹{parseFloat(emp.salary).toLocaleString("en-IN")}
                    </span>
                  ) 
                },
                {
                  key: "status", 
                  label: "Payslip Status",
                  render: (emp) => {
                    const matchingSlip = monthSlips.find(s => s.employee === emp.id);
                    if (matchingSlip) {
                      return (
                        <div className="flex items-center gap-2">
                          <Badge variant="success">Generated</Badge>
                          <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                            ₹{formatINR(matchingSlip.net_salary)}
                          </span>
                        </div>
                      );
                    }
                    return <Badge variant="secondary">Not Generated</Badge>;
                  },
                },
                {
                  key: "act", 
                  label: "Actions",
                  render: (emp) => {
                    const matchingSlip = monthSlips.find(s => s.employee === emp.id);
                    if (matchingSlip) {
                      return (
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setSelectedSlip(matchingSlip)}
                            title="View Payslip" 
                            className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border hover:bg-muted text-xs font-medium transition-colors cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </button>
                          <button 
                            onClick={() => handleGenerateSpecific(emp.id, emp.employee_name)}
                            disabled={generating}
                            title="Regenerate Payslip" 
                            className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border hover:bg-muted text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`} />
                            Regenerate
                          </button>
                        </div>
                      );
                    }
                    return (
                      <button 
                        onClick={() => handleGenerateSpecific(emp.id, emp.employee_name)}
                        disabled={generating}
                        className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Generate
                      </button>
                    );
                  },
                },
              ]}
            />
          )}
        </>
      ) : (
        <>
          {/* Controls Bar for Payslip History */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-card border border-border/60 rounded-3xl p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                {isEmployee ? "Your payslips" : "Historical Payroll Records"}
              </span>
            </div>

            <div className="relative w-full sm:w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder={isEmployee ? "Search by month..." : "Search history by name/code/month..."}
                className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* DataTable for Historical Records */}
          {loading ? (
            <div className="flex h-64 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading payslip history...</p>
            </div>
          ) : (
            <DataTable
              data={filteredSlips}
              emptyMessage="No payslip history found."
              columns={[
                // Whose payslip it is, and which branch it came from, are how HR
                // reads a page of them. On your own list every row carries your
                // name, your email and your branch — the same three answers, over
                // and over, taking the width the month and the amount want.
                isEmployee
                  ? null
                  : {
                      key: "name",
                      label: "Employee",
                      render: (s) => (
                        <div className="flex items-center gap-3">
                          <Avatar name={s.employee_details?.employee_name || "Emp"} />
                          <div>
                            <div className="text-sm font-medium">{s.employee_details?.employee_name || "Unknown"}</div>
                            <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{s.employee_details?.email || "no email"}</div>
                            <div className="text-xs text-muted-foreground">{s.employee_details?.role || "N/A"}</div>
                          </div>
                        </div>
                      ),
                    },
                {
                  key: "period",
                  label: "Period",
                  render: (s) => <span className="text-sm font-medium">{getMonthLabel(s.month).substring(0, 3)} {s.year}</span>
                },
                isEmployee
                  ? null
                  : {
                      key: "region",
                      label: "Region",
                      render: (s) => <span className="text-sm font-medium text-foreground">{s.employee_details?.branch || "Not Assigned"}</span>
                    },
                { 
                  key: "amount", 
                  label: "Net Salary", 
                  render: (s) => (
                    <span className="text-sm font-bold tracking-tight text-foreground font-mono">
                      ₹{formatINR(s.net_salary)}
                    </span>
                  ) 
                },
                {
                  key: "status", 
                  label: "Status",
                  render: (s) => {
                    let variant = "warning";
                    if (s.status === "Generated") variant = "success";
                    if (s.status === "Paid") variant = "info";
                    return <Badge variant={variant}>{s.status}</Badge>;
                  },
                },
                {
                  key: "act", 
                  label: "",
                  render: (s) => (
                    <div className="flex items-center justify-end gap-2 text-right">
                      <button 
                        onClick={() => setSelectedSlip(s)}
                        title="View Details" 
                        className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </button>
                      {/* Emailing a payslip out is HR's action, sent from the
                          company. An engineer reads and downloads their own. */}
                      {!isEmployee && (
                      <button
                        onClick={() => handleEmailPayslip(s)}
                        disabled={emailingSlipId === s.id}
                        title="Send Email"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {emailingSlipId === s.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : (
                          <Mail className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      )}
                      <button 
                        onClick={() => setSelectedSlip(s)}
                        title="Download/Print" 
                        className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Download className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  ),
                },
              ].filter(Boolean)}
            />
          )}
        </>
      )}

      {/* Full-Width Landscape Dialog Panel */}
      <Dialog open={!!selectedSlip} onOpenChange={(open) => !open && setSelectedSlip(null)}>
        <DialogContent className="sm:max-w-[95vw] md:max-w-[860px] w-full p-0 max-h-[95vh] overflow-y-auto bg-background border-border shadow-2xl rounded-xl flex flex-col">
          {selectedSlip && (
            <>
              {/* Top Control Action Bar */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border px-4 sm:px-6 py-4 sticky top-0 bg-background/95 backdrop-blur-md z-20 rounded-t-xl flex-shrink-0">
                <div className="flex items-center gap-2 pr-8 min-w-0">
                  {/* The dialog's own close X sits at absolute top-2 right-2 and
                      this header is sticky with z-20, which paints over it --
                      so on a phone there was visibly no way back out of the
                      payslip. Named, and first, where a back control belongs. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={ArrowLeft}
                    onClick={closeSlip}
                    className="shrink-0 -ml-2"
                  >
                    Back
                  </Button>
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-base font-semibold tracking-tight text-foreground truncate">Employee Payslip</h3>
                    <p className="text-xs text-muted-foreground truncate">{selectedSlip.employee_details?.employee_name} - {getMonthLabel(selectedSlip.month)} {selectedSlip.year}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:pr-8">
                  {/* Running payroll and sending it out are the office's job.
                      An engineer opening their own payslip was being offered
                      "Undo Edits" and "Send Email" — one recalculates their pay
                      from attendance, the other posts it from the company. The
                      list behind this modal was gated already; the modal itself
                      was not, so the eye icon let them straight through to
                      both. All they need here is to read it and keep a copy. */}
                  {!isEmployee && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={reverting ? Loader2 : RefreshCw}
                    disabled={reverting || recalculating || selectedSlip.status === "Paid"}
                    title={selectedSlip.status === "Paid" ? "Paid payslip cannot be reverted" : "Undo manual edits (recalculate from attendance)"}
                    onClick={handleRevert}
                  >
                    {reverting ? "Reverting..." : "Undo Edits"}
                  </Button>
                  )}
                  {!isEmployee && (
                  <Button
                    variant="brand"
                    size="sm"
                    icon={emailingSlipId === selectedSlip.id ? Loader2 : Mail}
                    disabled={emailingSlipId === selectedSlip.id}
                    onClick={() => handleEmailPayslip(selectedSlip)}
                  >
                    {emailingSlipId === selectedSlip.id ? "Sending..." : "Send Email"}
                  </Button>
                  )}
                  {/* Only worth offering where the document does not already
                      fit; on a desktop dialog fitScale is 1 and this would be a
                      button that does nothing. */}
                  {fitScale < 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={fitToWidth ? Maximize2 : Minimize2}
                      onClick={() => setFitToWidth((v) => !v)}
                      title={fitToWidth ? "Show at full size and scroll" : "Fit the whole payslip on screen"}
                    >
                      {fitToWidth ? "Zoom in" : "Fit"}
                    </Button>
                  )}
                  {/* Print stays, but only where it works. window.print() is
                      inert in the app's WebView, so on a phone it was a button
                      that did nothing. */}
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Printer}
                    onClick={handlePrintIframe}
                    className="hidden md:inline-flex"
                  >
                    Print
                  </Button>
                  <Button
                    variant="brand"
                    size="sm"
                    icon={downloading ? Loader2 : Download}
                    disabled={downloading}
                    onClick={handleDownloadPdf}
                  >
                    {downloading ? "Preparing..." : "Download PDF"}
                  </Button>
                </div>
              </div>

              {/* Responsive preview container */}
              {/* justify-start below md. Centring a flex child wider than its
                  container puts the child's left edge at a negative offset that
                  scrolling cannot reach, which is why the company name and the
                  whole first column were cut off with no way to get to them. */}
              <div
                ref={setPreviewEl}
                className="flex-grow p-4 md:p-8 overflow-auto bg-muted/20 flex justify-start md:justify-center items-start min-h-0"
              >
                
                {/* 
                  Pure HTML Table Implementation: 
                  This guarantees 100% perfect layout, borders, alignment, and styling preserved 
                  whether on-screen, in smaller windows, or exported via PDF print engine!
                */}
                {/* The zoom is on this wrapper, never on the printable node
                    itself: handlePrintIframe copies that node's outerHTML into
                    an iframe, so a zoom baked into it would shrink the paper. */}
                <div style={{ zoom: fitToWidth ? fitScale : 1 }}>
                <div
                  id="printable-payslip-core"
                  style={{
                    padding: "3px",
                    backgroundColor: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    width: "760px",
                    maxWidth: "760px",
                  }}
                >
                  <table style={tableMainStyle}>
                    
                    {/* Header Section */}
                    <tbody>
                      <tr>
                        <td colSpan="4" style={{ ...tdStyle, padding: "10px", textAlign: "center", position: "relative" }}>
                          <div style={{ textAlign: "right", fontSize: "8.5px", fontWeight: "bold", position: "absolute", top: "5px", right: "5px", fontFamily: "sans-serif" }}>
                            PRIVATE & CONFIDENTIAL
                          </div>
                          <div style={{ fontSize: "22px", fontWeight: "900", color: "#1e3a8a", fontFamily: "sans-serif", letterSpacing: "0.5px" }}>
                            Renderways <span style={{ color: "#db2777" }}>Technology</span> Pvt Ltd
                          </div>
                          <div style={{ fontSize: "11px", color: "#1e3a8a", marginTop: "2px", fontFamily: "sans-serif" }}>
                            #25, 1st Floor, Gandhi Street, Mettukuppam, Maduravoyal, Chennai 600 095.
                          </div>
                          <div style={{ fontSize: "11.5px", fontWeight: "bold", marginTop: "4px" }}>
                            Pay Slip Cum Leave Card for the month of {getMonthLabel(selectedSlip.month)} {selectedSlip.year}
                          </div>
                          <div style={{ fontSize: "10.5px", color: "#4b5563", marginTop: "2px", fontFamily: "sans-serif" }}>
                            Calculation Period: {getPeriodDates(selectedSlip.month, selectedSlip.year)}
                          </div>
                        </td>
                      </tr>

                      {/* Meta Info Row 1 */}
                      <tr>
                        <td style={labelStyle}>Employee Name</td>
                        <td style={{ ...valStyle, textTransform: "uppercase", fontWeight: "bold" }}>{selectedSlip.employee_details?.employee_name || "—"}</td>
                        <td style={labelStyle}>Employee Code</td>
                        <td style={{ ...valStyle, fontFamily: "monospace" }}>{selectedSlip.employee_details?.emp_code || "—"}</td>
                      </tr>

                      {/* Meta Info Row 2 */}
                      <tr>
                        <td style={labelStyle}>DOJ</td>
                        <td style={valStyle}>{formatSlipDate(selectedSlip.employee_details?.date_of_joining)}</td>
                        <td style={labelStyle}>DOB</td>
                        <td style={valStyle}>{selectedSlip.employee_details?.dob || "—"}</td>
                      </tr>

                      {/* Meta Info Row 3 */}
                      <tr>
                        <td style={labelStyle}>Department</td>
                        <td style={valStyle}>{selectedSlip.employee_details?.department || "—"}</td>
                        <td style={labelStyle}>Pan No.</td>
                        <td style={{ ...valStyle, fontFamily: "monospace" }}>—</td>
                      </tr>

                      {/* Meta Info Row 4 */}
                      <tr>
                        <td style={labelStyle}>Designation</td>
                        <td style={valStyle}>{selectedSlip.employee_details?.role || "—"}</td>
                        <td style={labelStyle}>Paymode</td>
                        <td style={valStyle}>Bank Transfer</td>
                      </tr>

                      {/* Meta Info Row 5 */}
                      <tr>
                        <td style={labelStyle}>Location</td>
                        <td style={valStyle}>{selectedSlip.employee_details?.work_location || selectedSlip.employee_details?.branch || "—"}</td>
                        <td style={labelStyle}>Bank Name</td>
                        <td style={valStyle}>{selectedSlip.employee_details?.bank_name || "—"}</td>
                      </tr>

                      {/* Meta Info Row 6 */}
                      <tr>
                        <td style={labelStyle}>Region</td>
                        <td style={valStyle}>{selectedSlip.employee_details?.branch || "—"}</td>
                        <td style={labelStyle}>Bank Account No</td>
                        <td style={{ ...valStyle, fontFamily: "monospace" }}>{formatBankAccount(selectedSlip.employee_details?.account_number)}</td>
                      </tr>

                      {/* Meta Info Row 7 */}
                      <tr>
                        <td style={labelStyle}>PF Number</td>
                        <td style={valStyle}>-</td>
                        <td style={labelStyle}>ESI Number</td>
                        <td style={valStyle}>-</td>
                      </tr>

                      {/* Meta Info Row 8 */}
                      <tr>
                        <td style={labelStyle}>UAN Number</td>
                        <td style={valStyle}>-</td>
                        <td style={labelStyle}>CTC</td>
                        <td style={{ ...valStyle, fontWeight: "bold" }}>₹{formatINR(selectedSlip.gross_salary)}</td>
                      </tr>

                      {/* Leave Matrix Complex Grid Row */}
                      <tr>
                        <td colSpan="4" style={{ padding: "0", border: "none" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <tbody>
                              <tr>
                                {/* Left header */}
                                <td style={{ ...tdStyle, width: "20%", fontWeight: "bold", backgroundColor: "#f9fafb", textAlign: "center" }}>
                                  Leave Days
                                </td>
                                
                                {/* Middle Matrix table */}
                                <td style={{ padding: "0", width: "50%" }}>
                                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <tbody>
                                      <tr style={{ backgroundColor: "#f3f4f6", fontWeight: "bold", textAlign: "center" }}>
                                        <td style={{ ...tdStyle, width: "33.33%" }}>Ope Bal</td>
                                        <td style={{ ...tdStyle, width: "33.33%" }}>Avl Bal</td>
                                        <td style={tdStyle}>Clo Bal</td>
                                      </tr>
                                      <tr style={{ textAlign: "center", fontSize: "10px" }}>
                                        <td style={{ padding: "0" }}>
                                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                            <tbody>
                                              <tr><td style={{ border: "none", borderRight: "1px solid #000", borderBottom: "1px solid #000", padding: "2px", width: "33%" }}>CL</td><td style={{ border: "none", borderRight: "1px solid #000", borderBottom: "1px solid #000", padding: "2px", width: "33%" }}>SL</td><td style={{ border: "none", borderBottom: "1px solid #000", padding: "2px" }}>EL</td></tr>
                                              <tr><td style={{ border: "none", borderRight: "1px solid #000", padding: "2px", width: "33%" }}>12.0</td><td style={{ border: "none", borderRight: "1px solid #000", padding: "2px", width: "33%" }}>0.0</td><td style={{ border: "none", padding: "2px" }}>0.0</td></tr>
                                            </tbody>
                                          </table>
                                        </td>
                                        <td style={{ padding: "0" }}>
                                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                            <tbody>
                                              <tr><td style={{ border: "none", borderRight: "1px solid #000", borderBottom: "1px solid #000", padding: "2px", width: "33%" }}>CL</td><td style={{ border: "none", borderRight: "1px solid #000", borderBottom: "1px solid #000", padding: "2px", width: "33%" }}>SL</td><td style={{ border: "none", borderBottom: "1px solid #000", padding: "2px" }}>EL</td></tr>
                                              <tr><td style={{ border: "none", borderRight: "1px solid #000", padding: "2px", width: "33%" }}>10.0</td><td style={{ border: "none", borderRight: "1px solid #000", padding: "2px", width: "33%" }}>0.0</td><td style={{ border: "none", padding: "2px" }}>0.0</td></tr>
                                            </tbody>
                                          </table>
                                        </td>
                                        <td style={{ padding: "0" }}>
                                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                            <tbody>
                                              <tr><td style={{ border: "none", borderRight: "1px solid #000", borderBottom: "1px solid #000", padding: "2px", width: "33%" }}>CL</td><td style={{ border: "none", borderRight: "1px solid #000", borderBottom: "1px solid #000", padding: "2px", width: "33%" }}>SL</td><td style={{ border: "none", borderBottom: "1px solid #000", padding: "2px" }}>EL</td></tr>
                                              <tr><td style={{ border: "none", borderRight: "1px solid #000", padding: "2px", width: "33%" }}>2.0</td><td style={{ border: "none", borderRight: "1px solid #000", padding: "2px", width: "33%" }}>0.0</td><td style={{ border: "none", padding: "2px" }}>0.0</td></tr>
                                            </tbody>
                                          </table>
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </td>

                                {/* Right totals block */}
                                <td style={{ padding: "0", width: "30%" }}>
                                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <tbody>
                                      {renderEditableDaysRow(
                                        "Total Days",
                                        selectedSlip.total_days,
                                        editTotalDays,
                                        setEditTotalDays,
                                        "total_days",
                                        { step: "1" }
                                      )}
                                      {renderEditableDaysRow(
                                        "No of Lop Days",
                                        parseFloat(selectedSlip.lop_days).toFixed(2),
                                        editLop,
                                        setEditLop,
                                        "lop_days",
                                        { color: "#dc2626", labelBg: "#fef2f2", step: "0.01" }
                                      )}
                                      {renderEditableDaysRow(
                                        "No of Days",
                                        parseFloat(selectedSlip.paid_days).toFixed(2),
                                        editPaidDays,
                                        setEditPaidDays,
                                        "paid_days",
                                        { step: "0.01" }
                                      )}
                                      {/* Extra days worked beyond the cycle. Nothing
                                          in attendance can say a day was extra rather
                                          than ordinary, so it is HR's to enter — and
                                          it is additive, which is why it is green
                                          where LOP is red. */}
                                      {renderEditableDaysRow(
                                        "Special Work",
                                        parseFloat(selectedSlip.special_work_days || 0).toFixed(2),
                                        editSpecialWork,
                                        setEditSpecialWork,
                                        "special_work_days",
                                        { color: "#047857", labelBg: "#ecfdf5", step: "0.5" }
                                      )}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>

                      {/* Main Split Column Row: Earnings (60%) and Deductions (40%) */}
                      <tr>
                        <td colSpan="4" style={{ padding: "0", border: "none" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                            <tbody>
                              <tr>
                                {/* Earnings SubTable Cell */}
                                <td style={{ padding: "0", width: "66.66%", verticalAlign: "top", borderRight: "1px solid #000" }}>
                                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead>
                                      <tr style={{ backgroundColor: "#f3f4f6", fontWeight: "bold", textAlign: "center" }}>
                                        <td style={{ ...tdStyle, width: "40%" }}>Salary/Wages</td>
                                        <td style={{ ...tdStyle, width: "30%" }}>Gross Salary</td>
                                        <td style={tdStyle}>Gross Earnings</td>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold", backgroundColor: "#fafafa" }}>Basic</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{formatINR(selectedSlip.gross_basic)}</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>{formatINR(selectedSlip.earned_basic)}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold", backgroundColor: "#fafafa" }}>HRA</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{formatINR(selectedSlip.gross_hra)}</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>{formatINR(selectedSlip.earned_hra)}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold", backgroundColor: "#fafafa" }}>Conveyance</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{formatINR(selectedSlip.gross_conveyance)}</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>{formatINR(selectedSlip.earned_conveyance)}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold", backgroundColor: "#fafafa" }}>Child Edu Allowance</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{formatINR(selectedSlip.gross_child_edu)}</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>{formatINR(selectedSlip.earned_child_edu)}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold", backgroundColor: "#fafafa" }}>Personal Allowance</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{formatINR(selectedSlip.gross_personal_allowance)}</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>{formatINR(selectedSlip.earned_personal_allowance)}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold", backgroundColor: "#fafafa" }}>Incentive</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{formatINR(selectedSlip.gross_incentive)}</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>{formatINR(selectedSlip.earned_incentive)}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold", backgroundColor: "#fafafa" }}>Other Earnings</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{formatINR(selectedSlip.gross_other_earnings)}</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>{formatINR(selectedSlip.earned_other_earnings)}</td>
                                      </tr>
                                      <tr style={{ backgroundColor: "#f3f4f6", fontWeight: "900", fontSize: "12px" }}>
                                        <td style={tdStyle}>Gross Salary / Earnings</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{formatINR(selectedSlip.gross_salary)}</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{formatINR(selectedSlip.gross_earnings)}</td>
                                      </tr>
                                      {/* Earned casual leave, paid on top rather than by quietly
                                          raising the day count: the days above stay the days the
                                          office counted, and this row says what was covered.
                                          Hidden when there is none, so an ordinary slip is
                                          unchanged. */}
                                      {parseFloat(selectedSlip.casual_leave_pay || 0) > 0 && (
                                      <tr style={{ backgroundColor: "#ecfdf5", fontWeight: "bold" }}>
                                        <td style={tdStyle}>
                                          Casual Leave ({parseFloat(selectedSlip.casual_leave_used)} day
                                          {parseFloat(selectedSlip.casual_leave_used) === 1 ? "" : "s"})
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>-</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#047857" }}>
                                          +{formatINR(selectedSlip.casual_leave_pay)}
                                        </td>
                                      </tr>
                                      )}
                                      {/* Extra days worked, paid on top. Same shape as
                                          the leave line above and equally hidden when
                                          there is none. */}
                                      {parseFloat(selectedSlip.special_work_pay || 0) > 0 && (
                                      <tr style={{ backgroundColor: "#ecfdf5", fontWeight: "bold" }}>
                                        <td style={tdStyle}>
                                          Special Work ({parseFloat(selectedSlip.special_work_days)} day
                                          {parseFloat(selectedSlip.special_work_days) === 1 ? "" : "s"})
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>-</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#047857" }}>
                                          +{formatINR(selectedSlip.special_work_pay)}
                                        </td>
                                      </tr>
                                      )}
                                      {(parseFloat(selectedSlip.casual_leave_pay || 0) > 0 ||
                                        parseFloat(selectedSlip.special_work_pay || 0) > 0) && (
                                      <tr style={{ backgroundColor: "#f3f4f6", fontWeight: "900", fontSize: "12px" }}>
                                        <td style={tdStyle}>Total Earnings</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>-</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>
                                          {formatINR(
                                            parseFloat(selectedSlip.gross_earnings || 0) +
                                              parseFloat(selectedSlip.casual_leave_pay || 0) +
                                              parseFloat(selectedSlip.special_work_pay || 0)
                                          )}
                                        </td>
                                      </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </td>

                                {/* Deductions SubTable Cell */}
                                <td style={{ padding: "0", width: "33.33%", verticalAlign: "top" }}>
                                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead>
                                      <tr style={{ backgroundColor: "#f3f4f6", fontWeight: "bold", textAlign: "center" }}>
                                        <td style={{ ...tdStyle, width: "60%" }}>Gross Deduction</td>
                                        <td style={tdStyle}>Amount</td>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold" }}>EPF (12%)</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#b91c1c", fontWeight: "bold" }}>{formatINR(selectedSlip.deduction_epf)}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold" }}>ESI</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#b91c1c" }}>{parseFloat(selectedSlip.deduction_esi) > 0 ? formatINR(selectedSlip.deduction_esi) : "-"}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold" }}>Insurance</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#b91c1c" }}>{parseFloat(selectedSlip.deduction_insurance) > 0 ? formatINR(selectedSlip.deduction_insurance) : "-"}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold" }}>Professional Tax</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#b91c1c", fontWeight: "bold" }}>{formatINR(selectedSlip.deduction_prof_tax)}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold" }}>LWF</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#b91c1c" }}>{parseFloat(selectedSlip.deduction_lwf) > 0 ? formatINR(selectedSlip.deduction_lwf) : "-"}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold" }}>Staff Advance</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#b91c1c" }}>{parseFloat(selectedSlip.deduction_staff_advance) > 0 ? formatINR(selectedSlip.deduction_staff_advance) : "-"}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold" }}>TDS</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#b91c1c" }}>{parseFloat(selectedSlip.deduction_tds) > 0 ? formatINR(selectedSlip.deduction_tds) : "-"}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold" }}>Other Deduction</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#b91c1c" }}>
                                          <span className="editable-print-value" style={{ display: isEmployee ? "inline" : "none" }}>
                                            {parseFloat(selectedSlip.deduction_other) > 0 ? formatINR(selectedSlip.deduction_other) : "-"}
                                          </span>
                                          {!isEmployee && (
                                          <span data-print-hide="true" style={{ display: "inline-flex", alignItems: "center", gap: "4px", justifyContent: "flex-end" }}>
                                            <input
                                              type="number"
                                              min="0"
                                              step="0.01"
                                              value={editOtherDed}
                                              onChange={(e) => setEditOtherDed(e.target.value)}
                                              disabled={recalculating || reverting || selectedSlip.status === "Paid"}
                                              style={{
                                                width: "70px",
                                                textAlign: "right",
                                                color: "#b91c1c",
                                                fontFamily: "monospace",
                                                fontWeight: "bold",
                                                border: "1px solid #b91c1c",
                                                borderRadius: "4px",
                                                padding: "1px 3px",
                                                backgroundColor: "#fff",
                                              }}
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleRecalculate("other_deduction")}
                                              disabled={recalculating || reverting || selectedSlip.status === "Paid"}
                                              title={selectedSlip.status === "Paid" ? "Paid payslip cannot be edited" : "Save & recalculate"}
                                              style={{
                                                cursor: (recalculating || reverting || selectedSlip.status === "Paid") ? "not-allowed" : "pointer",
                                                fontSize: "9px",
                                                fontWeight: "bold",
                                                color: "#fff",
                                                backgroundColor: (recalculating || reverting || selectedSlip.status === "Paid") ? "#9ca3af" : "#b91c1c",
                                                border: "none",
                                                borderRadius: "4px",
                                                padding: "2px 5px",
                                                fontFamily: "sans-serif",
                                              }}
                                            >
                                              {recalculating ? "..." : "Save"}
                                            </button>
                                          </span>
                                          )}
                                        </td>
                                      </tr>
                                      <tr style={{ backgroundColor: "#f3f4f6", fontWeight: "900", fontSize: "12px" }}>
                                        <td style={tdStyle}>Total Deductions</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#b91c1c" }}>{formatINR(selectedSlip.gross_deductions)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>

                      {/* Benefits (CTC Components) Section */}
                      <tr>
                        <td colSpan="4" style={{ padding: "0", border: "none" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ backgroundColor: "#f3f4f6", fontWeight: "bold", textAlign: "center" }}>
                                <td style={{ ...tdStyle, width: "50%" }}>Benefits (Cost to Company Components)</td>
                                <td style={{ ...tdStyle, width: "25%" }}>Contribution / Allowance</td>
                                <td style={{ ...tdStyle, width: "25%" }}>Total(C)</td>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td style={{ ...tdStyle, fontWeight: "bold", backgroundColor: "#fafafa" }}>Employer EPF Contribution</td>
                                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{parseFloat(selectedSlip.employer_epf) > 0 ? formatINR(selectedSlip.employer_epf) : "-"}</td>
                                {/* Petrol allowance is shown on its own row below but is
                                    deliberately NOT summed here or into the CTC: it is
                                    reimbursed against actual travel, not part of what the
                                    employee is paid, so counting it made the slip claim a
                                    cost the employee never sees in their bank. It stays a
                                    line to read, nothing more. */}
                                <td rowSpan="4" style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", verticalAlign: "middle", fontWeight: "bold", backgroundColor: "#f9fafb" }}>
                                  {formatINR(
                                    parseFloat(selectedSlip.employer_epf || 0) +
                                    parseFloat(selectedSlip.employer_esi || 0) +
                                    parseFloat(selectedSlip.employer_insurance || 0)
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td style={{ ...tdStyle, fontWeight: "bold", backgroundColor: "#fafafa" }}>Employer ESI Contribution</td>
                                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{parseFloat(selectedSlip.employer_esi) > 0 ? formatINR(selectedSlip.employer_esi) : "-"}</td>
                              </tr>
                              <tr>
                                <td style={{ ...tdStyle, fontWeight: "bold", backgroundColor: "#fafafa" }}>Insurance (Employer Contribution)</td>
                                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{parseFloat(selectedSlip.employer_insurance) > 0 ? formatINR(selectedSlip.employer_insurance) : "-"}</td>
                              </tr>
                              <tr>
                                <td style={{ ...tdStyle, fontWeight: "bold", backgroundColor: "#fafafa" }}>Petrol allowance</td>
                                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{parseFloat(selectedSlip.petrol_allowance) > 0 ? formatINR(selectedSlip.petrol_allowance) : "-"}</td>
                              </tr>
                              <tr style={{ backgroundColor: "#fffbeb", fontWeight: "900", borderTop: "2px solid #000" }}>
                                <td colSpan="2" style={{ ...tdStyle, fontSize: "11px", color: "#92400e" }}>MONTHLY CTC(A+C)</td>
                                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontSize: "12px", color: "#92400e" }}>
                                  ₹{formatINR(
                                    parseFloat(selectedSlip.gross_earnings || 0) +
                                    (parseFloat(selectedSlip.employer_epf || 0) +
                                     parseFloat(selectedSlip.employer_esi || 0) +
                                     parseFloat(selectedSlip.employer_insurance || 0))
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>

                      {/* Net Take Home Row */}
                      <tr style={{ backgroundColor: "#111827", color: "#fff", fontWeight: "900" }}>
                        <td colSpan="3" style={{ ...tdStyle, border: "none", padding: "10px 15px", fontSize: "13.5px", letterSpacing: "0.5px" }}>
                          NET TAKE HOME SALARY
                        </td>
                        <td style={{ ...tdStyle, border: "none", textAlign: "right", padding: "10px 15px", fontSize: "20px", fontFamily: "sans-serif", color: "#4ade80" }}>
                          ₹{formatINR(selectedSlip.net_salary)}
                        </td>
                      </tr>

                      {/* Print Footer */}
                      <tr style={{ backgroundColor: "#fafafa", color: "#6b7280" }}>
                        <td colSpan="4" style={{ ...tdStyle, borderTop: "2px solid #000", textAlign: "center", fontSize: "9.5px", fontWeight: "bold", fontStyle: "italic" }}>
                          ** This is a computer generated salary slip, signature is not required **
                        </td>
                      </tr>

                    </tbody>
                  </table>
                </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PayslipsPage;