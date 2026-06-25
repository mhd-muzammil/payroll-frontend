import { useState, useEffect, useMemo } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from "../ui/PageHeader";
import Toolbar from "../ui/Toolbar";
import DataTable from "../ui/DataTable";
import { Download, Eye, Sparkles, Loader2, Printer, MapPin, Users } from "lucide-react";
import { api } from "@/api/Api";
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
    fetchPayslips();
  }, []);

  const handleGenerateAll = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await api.post("/api/payslips/generate_all/");
      alert(res.data?.message || "Successfully processed payslips!");
      fetchPayslips();
    } catch (err) {
      console.error("Failed to generate payslips:", err);
      alert("Failed to generate payslips. Please ensure active employees exist.");
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

  const formatINR = (amount) => {
    if (!amount) return "0.00";
    return parseFloat(amount).toLocaleString("en-IN", { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  // Bulletproof Direct Print Engine: Clones target HTML inside a hidden iframe and triggers browser printing.
  // This isolates styles perfectly and prevents styles leakage or unaligned outputs when saving as PDF!
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

  const regionStats = useMemo(() => {
    const regions = ["Chennai", "Vellore", "Salem", "Kanchipuram", "Hosur"];
    const stats = {
      Chennai: 0,
      Vellore: 0,
      Salem: 0,
      Kanchipuram: 0,
      Hosur: 0,
      "Not Assigned": 0,
    };
    slips.forEach((s) => {
      const branch = s.employee_details?.branch;
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
  }, [slips]);

  const filteredSlips = useMemo(() => {
    if (!selectedRegion) return slips;
    return slips.filter((s) => {
      const branch = s.employee_details?.branch || "Not Assigned";
      return branch.toLowerCase() === selectedRegion.toLowerCase();
    });
  }, [slips, selectedRegion]);

  return (
    <div>
      <PageHeader
        title="Payslips"
        description="Generate, preview and distribute payslips."
        actions={
          <Button 
            icon={generating ? Loader2 : Sparkles} 
            onClick={handleGenerateAll}
            disabled={generating}
            className={generating ? "opacity-80 pointer-events-none" : ""}
          >
            {generating ? "Generating..." : "Generate all"}
          </Button>
        }
      />

      <Toolbar />

      {/* Region-Wise Payslip Distribution */}
      <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-xs mb-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-5 w-5 text-primary" />
          <span className="text-base font-bold tracking-tight text-foreground">Region-Wise Payslip Distribution</span>
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
              <span className="text-2xl md:text-3xl font-black tracking-tight text-foreground">{slips.length}</span>
              <span className="text-xs font-semibold text-muted-foreground">slips</span>
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
                  <span className="text-xs font-semibold text-muted-foreground">slips</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Retrieving employee records...</p>
        </div>
      ) : (
        <DataTable
          data={filteredSlips}
          columns={[
            {
              key: "name", 
              label: "Employee",
              render: (s) => (
                <div className="flex items-center gap-3">
                  <Avatar name={s.employee_details?.employee_name || "Emp"} />
                  <div>
                    <div className="text-sm font-medium">{s.employee_details?.employee_name || "Unknown"}</div>
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
            { 
              key: "region", 
              label: "Region", 
              render: (s) => <span className="text-sm font-medium text-foreground">{s.employee_details?.branch || "Not Assigned"}</span> 
            },
            { 
              key: "amount", 
              label: "Net Salary", 
              render: (s) => (
                <span className="text-sm font-bold tracking-tight text-foreground">
                  ₹{parseFloat(s.net_salary).toLocaleString("en-IN")}
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
                <div className="flex items-center justify-end gap-2">
                  <button 
                    onClick={() => setSelectedSlip(s)}
                    title="View Details" 
                    className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </button>
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
          ]}
        />
      )}

      {/* Full-Width Landscape Dialog Panel */}
      <Dialog open={!!selectedSlip} onOpenChange={(open) => !open && setSelectedSlip(null)}>
        <DialogContent className="sm:max-w-[95vw] md:max-w-[860px] w-full p-0 max-h-[95vh] overflow-y-auto bg-background border-border shadow-2xl rounded-xl flex flex-col">
          {selectedSlip && (
            <>
              {/* Top Control Action Bar */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4 sticky top-0 bg-background/95 backdrop-blur-md z-20 rounded-t-xl flex-shrink-0">
                <div className="flex flex-col">
                  <h3 className="text-base font-semibold tracking-tight text-foreground">Employee Payslip</h3>
                  <p className="text-xs text-muted-foreground">{selectedSlip.employee_details?.employee_name} - {getMonthLabel(selectedSlip.month)} {selectedSlip.year}</p>
                </div>
                <div className="flex items-center gap-3 pr-8">
                  <Button variant="brand" size="sm" icon={Printer} onClick={handlePrintIframe}>
                    Download / Print PDF
                  </Button>
                </div>
              </div>

              {/* Responsive preview container */}
              <div className="flex-grow p-4 md:p-8 overflow-auto bg-muted/20 flex justify-center items-start min-h-0">
                
                {/* 
                  Pure HTML Table Implementation: 
                  This guarantees 100% perfect layout, borders, alignment, and styling preserved 
                  whether on-screen, in smaller windows, or exported via PDF print engine!
                */}
                <div 
                  id="printable-payslip-core" 
                  style={{ 
                    padding: "3px", 
                    backgroundColor: "#fff", 
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)", 
                    width: "100%", 
                    maxWidth: "760px" 
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
                        <td style={{ ...valStyle, textTransform: "uppercase", fontWeight: "bold" }}>{selectedSlip.employee_details?.employee_name || "GAYATHRI R"}</td>
                        <td style={labelStyle}>Employee Code</td>
                        <td style={{ ...valStyle, fontFamily: "monospace" }}>RT-{100 + selectedSlip.employee_details?.id}</td>
                      </tr>

                      {/* Meta Info Row 2 */}
                      <tr>
                        <td style={labelStyle}>DOJ</td>
                        <td style={valStyle}>{selectedSlip.employee_details?.joining_date || "01-06-2025"}</td>
                        <td style={labelStyle}>DOB</td>
                        <td style={valStyle}>{selectedSlip.employee_details?.dob || "N/A"}</td>
                      </tr>

                      {/* Meta Info Row 3 */}
                      <tr>
                        <td style={labelStyle}>Department</td>
                        <td style={valStyle}>{selectedSlip.employee_details?.department || "Admin"}</td>
                        <td style={labelStyle}>Pan No.</td>
                        <td style={{ ...valStyle, fontFamily: "monospace" }}>PANEX-{selectedSlip.employee_details?.id}</td>
                      </tr>

                      {/* Meta Info Row 4 */}
                      <tr>
                        <td style={labelStyle}>Designation</td>
                        <td style={valStyle}>{selectedSlip.employee_details?.role || "Manager"}</td>
                        <td style={labelStyle}>Paymode</td>
                        <td style={valStyle}>Bank Transfer</td>
                      </tr>

                      {/* Meta Info Row 5 */}
                      <tr>
                        <td style={labelStyle}>Location</td>
                        <td style={valStyle}>{selectedSlip.employee_details?.work_location || "Tamilnadu"}</td>
                        <td style={labelStyle}>Bank Name</td>
                        <td style={valStyle}>{selectedSlip.employee_details?.bank_name || "N/A"}</td>
                      </tr>

                      {/* Meta Info Row 6 */}
                      <tr>
                        <td style={labelStyle}>Region</td>
                        <td style={valStyle}>{selectedSlip.employee_details?.branch || "Chennai"}</td>
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
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold", backgroundColor: "#f3f4f6", width: "60%" }}>Total Days</td>
                                        <td style={{ ...tdStyle, textAlign: "center", fontFamily: "monospace", fontWeight: "bold" }}>{selectedSlip.total_days}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold", color: "#dc2626", backgroundColor: "#fef2f2" }}>No of Lop Days</td>
                                        <td style={{ ...tdStyle, textAlign: "center", color: "#dc2626", fontFamily: "monospace", fontWeight: "bold" }}>{parseFloat(selectedSlip.lop_days).toFixed(1)}</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold", backgroundColor: "#f3f4f6" }}>No of Days</td>
                                        <td style={{ ...tdStyle, textAlign: "center", fontFamily: "monospace", fontWeight: "bold" }}>{parseFloat(selectedSlip.paid_days).toFixed(1)}</td>
                                      </tr>
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
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>-</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>-</td>
                                      </tr>
                                      <tr>
                                        <td style={{ ...tdStyle, fontWeight: "bold", backgroundColor: "#fafafa" }}>Other Earnings</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>-</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>-</td>
                                      </tr>
                                      <tr style={{ backgroundColor: "#f3f4f6", fontWeight: "900", fontSize: "12px" }}>
                                        <td style={tdStyle}>Gross Salary / Earnings</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{formatINR(selectedSlip.gross_salary)}</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{formatINR(selectedSlip.gross_earnings)}</td>
                                      </tr>
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
                                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#b91c1c" }}>{parseFloat(selectedSlip.deduction_other) > 0 ? formatINR(selectedSlip.deduction_other) : "-"}</td>
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
                                <td rowSpan="4" style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", verticalAlign: "middle", fontWeight: "bold", backgroundColor: "#f9fafb" }}>
                                  {formatINR(
                                    parseFloat(selectedSlip.employer_epf || 0) + 
                                    parseFloat(selectedSlip.employer_esi || 0) + 
                                    parseFloat(selectedSlip.employer_insurance || 0) + 
                                    parseFloat(selectedSlip.petrol_allowance || 0)
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
                                     parseFloat(selectedSlip.employer_insurance || 0) + 
                                     parseFloat(selectedSlip.petrol_allowance || 0))
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
                          ₹{parseFloat(selectedSlip.net_salary).toLocaleString("en-IN")}
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PayslipsPage;