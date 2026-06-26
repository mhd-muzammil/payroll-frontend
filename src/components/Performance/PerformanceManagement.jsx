import React, { useState, useEffect } from "react";
import { ROLES, getUserRole, normalizeRole } from "@/auth/rbac";
import { performanceService } from "@/services/performanceService";
import { employeeService } from "@/services/employeeService";
import DataTable from "../ui/DataTable";
import StatsCard from "../ui/StatsCard";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  Star,
  Plus,
  Calendar,
  AlertCircle,
  TrendingUp,
  Award,
  Loader2,
  Trash2,
  ThumbsUp,
  MessageSquare,
  Smile,
  ShieldAlert,
} from "lucide-react";

export default function PerformanceManagement() {
  const role = normalizeRole(getUserRole());
  const isAdmin = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;

  const [reviews, setReviews] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create Review dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    employee: "",
    review_period: "",
    work_quality: 5,
    attendance: 5,
    communication: 5,
    dependability: 5,
    comments: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");
      const reviewsData = await performanceService.getAll();
      setReviews(reviewsData);

      if (isAdmin) {
        const empData = await employeeService.getAll();
        setEmployees(empData);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to fetch performance reviews. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateDialog = () => {
    const currentMonth = new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });
    setFormData({
      employee: employees[0]?.id || "",
      review_period: currentMonth,
      work_quality: 5,
      attendance: 5,
      communication: 5,
      dependability: 5,
      comments: "",
    });
    setIsDialogOpen(true);
  };

  const handleSaveReview = async (e) => {
    e.preventDefault();
    try {
      await performanceService.create(formData);
      setIsDialogOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      setError("Failed to submit performance review.");
    }
  };

  const handleDeleteReview = async (id) => {
    if (window.confirm("Are you sure you want to delete this performance review?")) {
      try {
        await performanceService.delete(id);
        fetchData();
      } catch (err) {
        console.error(err);
        setError("Failed to delete review.");
      }
    }
  };

  // Star rendering helper
  const renderStars = (rating) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? "text-amber-500 fill-amber-500" : "text-muted-foreground/30"
            }`}
          />
        ))}
      </div>
    );
  };

  // Metrics average helpers for employee view
  const getAverageMetric = (metricName) => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + (r[metricName] || 0), 0);
    return (sum / reviews.length).toFixed(1);
  };

  const getOverallAverage = () => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + parseFloat(r.overall_score || 0), 0);
    return (sum / reviews.length).toFixed(2);
  };

  const getOverallPerformanceClass = (score) => {
    if (score >= 4.5) return "text-emerald-500 border-emerald-500/20 bg-emerald-500/10";
    if (score >= 3.5) return "text-indigo-500 border-indigo-500/20 bg-indigo-500/10";
    if (score >= 2.5) return "text-yellow-500 border-yellow-500/20 bg-yellow-500/10";
    return "text-red-500 border-red-500/20 bg-red-500/10";
  };

  const getOverallPerformanceLabel = (score) => {
    if (score >= 4.5) return "Outstanding";
    if (score >= 3.5) return "Exceeds Expectations";
    if (score >= 2.5) return "Meets Expectations";
    return "Needs Improvement";
  };

  const columns = [
    {
      key: "employee_name",
      label: "Employee",
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase">
            {row.employee_name?.charAt(0) || "U"}
          </div>
          <span className="font-semibold text-sm">{row.employee_name}</span>
        </div>
      ),
    },
    { key: "review_period", label: "Review Period" },
    {
      key: "ratings",
      label: "Metrics Breakdown",
      render: (row) => (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground min-w-[220px]">
          <div className="flex justify-between items-center">
            <span>Work Quality:</span>
            <span className="font-bold text-foreground ml-1.5">{row.work_quality}/5</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Attendance:</span>
            <span className="font-bold text-foreground ml-1.5">{row.attendance}/5</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Communication:</span>
            <span className="font-bold text-foreground ml-1.5">{row.communication}/5</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Dependability:</span>
            <span className="font-bold text-foreground ml-1.5">{row.dependability}/5</span>
          </div>
        </div>
      ),
    },
    {
      key: "overall_score",
      label: "Overall Score",
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-foreground">{row.overall_score}</span>
          {renderStars(Math.round(row.overall_score))}
        </div>
      ),
    },
    {
      key: "comments",
      label: "Reviewer Feedback",
      render: (row) => (
        <div className="max-w-xs md:max-w-sm">
          <p className="text-xs text-muted-foreground italic leading-relaxed line-clamp-2">
            "{row.comments || "No summary comments provided."}"
          </p>
          <div className="text-[10px] text-muted-foreground mt-1">Reviewed by: {row.reviewer_name || "Admin"}</div>
        </div>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (row) => (
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteReview(row.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm font-medium">Loading Performance Data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card/40 backdrop-blur border border-border rounded-3xl p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Award className="h-6 w-6 text-indigo-500" />
            Performance Reviews
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? "Conduct reviews, evaluate employee contributions, and track metrics."
              : "Review your performance metrics, feedback, and key scores."}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={handleOpenCreateDialog} className="gradient-brand shadow-glow text-white font-semibold flex items-center gap-1.5 px-4 rounded-xl py-2.5">
            <Plus className="h-4.5 w-4.5" /> Submit Review Rating
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {isAdmin ? (
        <div className="space-y-6">
          <DataTable columns={columns} data={reviews} emptyMessage="No performance reviews submitted yet." />
        </div>
      ) : (
        /* Employee Performance Dashboard */
        <div className="space-y-8">
          {reviews.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-muted-foreground/30 rounded-3xl bg-muted/10 space-y-4">
              <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto" />
              <div className="text-sm font-semibold">No Performance Reviews Logged</div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Once the admin submits your performance rating and metrics for review periods, it will appear here.
              </p>
            </div>
          ) : (
            <>
              {/* Overview Scorecards */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                {/* Overall Rating card */}
                <div className="md:col-span-2 border border-border bg-card/40 rounded-3xl p-6 flex flex-col justify-between items-center text-center space-y-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full filter blur-xl"></div>
                  <Award className="h-10 w-10 text-indigo-500 bg-indigo-500/10 rounded-2xl p-2" />
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overall Average Rating</h3>
                    <div className="text-5xl font-black text-foreground mt-2">{getOverallAverage()}<span className="text-2xl text-muted-foreground">/5</span></div>
                    <div className="mt-1 flex justify-center">{renderStars(Math.round(getOverallAverage()))}</div>
                  </div>
                  <span className={`px-4 py-1.5 rounded-full text-xs font-bold border ${getOverallPerformanceClass(getOverallAverage())}`}>
                    {getOverallPerformanceLabel(getOverallAverage())}
                  </span>
                </div>

                {/* Individual Parameter scorecards */}
                <div className="md:col-span-3 grid grid-cols-2 gap-4">
                  <StatsCard label="Quality of Work" value={`${getAverageMetric("work_quality")} / 5`} icon={Award} accent="primary" />
                  <StatsCard label="Attendance" value={`${getAverageMetric("attendance")} / 5`} icon={Calendar} accent="info" />
                  <StatsCard label="Communication" value={`${getAverageMetric("communication")} / 5`} icon={MessageSquare} accent="success" />
                  <StatsCard label="Dependability" value={`${getAverageMetric("dependability")} / 5`} icon={ThumbsUp} accent="warning" />
                </div>
              </div>

              {/* Review History Cards */}
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-indigo-500" />
                  Review History
                </h2>

                <div className="grid grid-cols-1 gap-6">
                  {reviews.map((review) => (
                    <div key={review.id} className="glass-card rounded-3xl p-6 shadow-sm border border-border/80 flex flex-col md:flex-row gap-6 justify-between">
                      <div className="space-y-4 md:max-w-lg">
                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 rounded-xl text-xs font-bold flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {review.review_period}
                          </span>
                          <span className="text-xs text-muted-foreground">Reviewer: {review.reviewer_name || "Management"}</span>
                        </div>
                        {review.comments ? (
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                              <MessageSquare className="h-3.5 w-3.5" /> Evaluator Comments
                            </h4>
                            <p className="text-sm text-foreground/80 leading-relaxed italic bg-muted/30 border p-4 rounded-2xl">
                              "{review.comments}"
                            </p>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground italic">No written evaluation comments provided for this period.</div>
                        )}
                      </div>

                      <div className="border-t md:border-t-0 md:border-l border-border/85 pt-4 md:pt-0 md:pl-6 flex flex-col justify-center min-w-[240px] space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-foreground">Overall Performance</span>
                          <span className="font-bold text-sm">{review.overall_score} / 5</span>
                        </div>
                        <div className="space-y-2.5">
                          {[
                            { name: "Work Quality", score: review.work_quality },
                            { name: "Attendance", score: review.attendance },
                            { name: "Communication", score: review.communication },
                            { name: "Dependability", score: review.dependability },
                          ].map((metric) => (
                            <div key={metric.name} className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground">{metric.name}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(metric.score / 5) * 100}%` }}></div>
                                </div>
                                <span className="font-bold w-6 text-right">{metric.score}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Admin Submit Review Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-card border border-border shadow-2xl rounded-3xl p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-bold tracking-tight">Evaluate Employee Performance</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              Rate the employee from 1 (Needs Improvement) to 5 (Excellent) across key performance metrics.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveReview} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="employee" className="text-sm font-semibold text-foreground mb-1.5 block">Employee</Label>
                <select
                  id="employee"
                  required
                  value={formData.employee}
                  onChange={(e) => setFormData({ ...formData, employee: e.target.value })}
                  className="w-full h-11 px-3 bg-background/50 border border-input rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.employee_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="review_period" className="text-sm font-semibold text-foreground mb-1.5 block">Review Period</Label>
                <Input
                  id="review_period"
                  required
                  value={formData.review_period}
                  onChange={(e) => setFormData({ ...formData, review_period: e.target.value })}
                  placeholder="e.g. Q1 2026, June 2026"
                  className="h-11 bg-background/50 rounded-xl"
                />
              </div>
            </div>

            {/* Ratings Grid */}
            <div className="grid grid-cols-2 gap-4 bg-muted/30 border rounded-2xl p-4">
              {[
                { label: "Quality of Work", key: "work_quality" },
                { label: "Attendance", key: "attendance" },
                { label: "Communication", key: "communication" },
                { label: "Dependability", key: "dependability" },
              ].map((metric) => (
                <div key={metric.key}>
                  <Label htmlFor={metric.key} className="text-xs font-bold text-foreground mb-1 block">{metric.label}</Label>
                  <select
                    id={metric.key}
                    value={formData[metric.key]}
                    onChange={(e) => setFormData({ ...formData, [metric.key]: parseInt(e.target.value) })}
                    className="w-full h-10 px-2 bg-background border border-input rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={5}>5 - Outstanding</option>
                    <option value={4}>4 - Exceeds Expectations</option>
                    <option value={3}>3 - Meets Expectations</option>
                    <option value={2}>2 - Below Expectations</option>
                    <option value={1}>1 - Needs Improvement</option>
                  </select>
                </div>
              ))}
            </div>

            <div>
              <Label htmlFor="comments" className="text-sm font-semibold text-foreground mb-1.5 block">Evaluation Comments</Label>
              <textarea
                id="comments"
                rows={3}
                value={formData.comments}
                onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                placeholder="Detail key achievements, areas for improvement, and generic feedback..."
                className="w-full bg-background/50 border border-input rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[90px]"
              />
            </div>

            <DialogFooter className="mt-6 flex gap-3 justify-end">
              <Button type="button" variant="outline" className="rounded-xl h-11 font-semibold px-4" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="gradient-brand text-white font-semibold px-5 rounded-xl h-11 shadow-glow">
                Submit Review
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
