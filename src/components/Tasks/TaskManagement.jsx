import React, { useState, useEffect } from "react";
import { ROLES, getUserRole, normalizeRole, getUserDisplayName, getTokenClaims } from "@/auth/rbac";
import { taskService } from "@/services/taskService";
import { employeeService } from "@/services/employeeService";
import DataTable from "../ui/DataTable";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import GreetingHeader from "../ui/GreetingHeader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  Plus,
  Search,
  Filter,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit2,
  Trash2,
  ListTodo,
  Loader2,
  ExternalLink,
  MessageSquare,
  ChevronRight,
  PlusCircle,
  XCircle,
  User,
  History,
  Send,
} from "lucide-react";

export default function TaskManagement() {
  const role = normalizeRole(getUserRole());
  const isAdmin = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
  const displayName = getUserDisplayName();

  const claims = getTokenClaims() || {};
  const currentUsername = claims.username || claims.user_name || claims.sub || "";

  const canEditTask = (task) => {
    if (isAdmin) return true;
    return task && task.assigned_by_name && task.assigned_by_name === currentUsername;
  };

  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // View state (List vs. Kanban)
  const [viewMode, setViewMode] = useState(isAdmin ? "list" : "kanban");

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");

  // Create/Edit Task dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogTask, setDialogTask] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assigned_to: "",
    status: "pending",
    priority: "medium",
    due_date: "",
    employee_notes: "",
    checklist: [],
  });

  // Checklist management state (temp input inside creation dialog)
  const [newSubtaskText, setNewSubtaskText] = useState("");

  // Detailed view dialog state (used for update status, checklists, activity feed)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsTask, setDetailsTask] = useState(null);
  const [newComment, setNewComment] = useState("");
  const [detailsNotes, setDetailsNotes] = useState("");
  const [detailsStatus, setDetailsStatus] = useState("pending");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");
      const tasksData = await taskService.getAll();
      setTasks(tasksData);

      const empData = await employeeService.getAll();
      setEmployees(empData);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch tasks. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateDialog = () => {
    setDialogTask(null);
    setFormData({
      title: "",
      description: "",
      assigned_to: employees[0]?.id || "",
      status: "pending",
      priority: "medium",
      due_date: new Date().toISOString().split("T")[0],
      employee_notes: "",
      checklist: [],
    });
    setNewSubtaskText("");
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (task) => {
    setDialogTask(task);
    setFormData({
      title: task.title,
      description: task.description,
      assigned_to: task.assigned_to,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      employee_notes: task.employee_notes || "",
      checklist: task.checklist || [],
    });
    setNewSubtaskText("");
    setIsDialogOpen(true);
  };

  const handleOpenDetails = (task) => {
    setDetailsTask(task);
    setDetailsStatus(task.status);
    setDetailsNotes(task.employee_notes || "");
    setNewComment("");
    setIsDetailsOpen(true);
  };

  // Add subtask to forms (Creation/Editing)
  const addSubtaskToForm = () => {
    if (!newSubtaskText.trim()) return;
    const newSub = {
      id: Date.now().toString(),
      text: newSubtaskText.trim(),
      completed: false,
    };
    setFormData({
      ...formData,
      checklist: [...formData.checklist, newSub],
    });
    setNewSubtaskText("");
  };

  const removeSubtaskFromForm = (id) => {
    setFormData({
      ...formData,
      checklist: formData.checklist.filter((item) => item.id !== id),
    });
  };

  // Checklist toggling inside details viewer
  const handleToggleDetailsSubtask = async (subtaskId) => {
    const updatedChecklist = detailsTask.checklist.map((item) =>
      item.id === subtaskId ? { ...item, completed: !item.completed } : item
    );

    const logEntry = {
      user: displayName,
      text: `Updated subtask status`,
      timestamp: new Date().toISOString(),
    };

    const updatedTask = {
      ...detailsTask,
      checklist: updatedChecklist,
      activity_log: [...(detailsTask.activity_log || []), logEntry],
    };

    try {
      const data = await taskService.patch(detailsTask.id, {
        checklist: updatedChecklist,
        activity_log: updatedTask.activity_log,
      });
      setDetailsTask({ ...detailsTask, checklist: updatedChecklist, activity_log: updatedTask.activity_log });
      setTasks(tasks.map((t) => (t.id === detailsTask.id ? data : t)));
    } catch (err) {
      console.error(err);
      setError("Failed to update checklist.");
    }
  };

  const handleAddSubtaskDetails = async (e) => {
    e.preventDefault();
    if (!newSubtaskText.trim()) return;

    const newSub = {
      id: Date.now().toString(),
      text: newSubtaskText.trim(),
      completed: false,
    };

    const updatedChecklist = [...(detailsTask.checklist || []), newSub];
    const logEntry = {
      user: displayName,
      text: `Added checklist item: "${newSubtaskText.trim()}"`,
      timestamp: new Date().toISOString(),
    };

    try {
      const data = await taskService.patch(detailsTask.id, {
        checklist: updatedChecklist,
        activity_log: [...(detailsTask.activity_log || []), logEntry],
      });
      setDetailsTask({ ...detailsTask, checklist: updatedChecklist, activity_log: data.activity_log });
      setTasks(tasks.map((t) => (t.id === detailsTask.id ? data : t)));
      setNewSubtaskText("");
    } catch (err) {
      console.error(err);
      setError("Failed to add subtask.");
    }
  };

  const handleRemoveSubtaskDetails = async (subtaskId) => {
    const targetText = detailsTask.checklist.find((t) => t.id === subtaskId)?.text || "";
    const updatedChecklist = detailsTask.checklist.filter((item) => item.id !== subtaskId);
    
    const logEntry = {
      user: displayName,
      text: `Removed checklist item: "${targetText}"`,
      timestamp: new Date().toISOString(),
    };

    try {
      const data = await taskService.patch(detailsTask.id, {
        checklist: updatedChecklist,
        activity_log: [...(detailsTask.activity_log || []), logEntry],
      });
      setDetailsTask({ ...detailsTask, checklist: updatedChecklist, activity_log: data.activity_log });
      setTasks(tasks.map((t) => (t.id === detailsTask.id ? data : t)));
    } catch (err) {
      console.error(err);
      setError("Failed to remove subtask.");
    }
  };

  // Comments feed submission
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const logEntry = {
      user: displayName,
      text: newComment.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedLog = [...(detailsTask.activity_log || []), logEntry];

    try {
      const data = await taskService.patch(detailsTask.id, {
        activity_log: updatedLog,
      });
      setDetailsTask({ ...detailsTask, activity_log: updatedLog });
      setTasks(tasks.map((t) => (t.id === detailsTask.id ? data : t)));
      setNewComment("");
    } catch (err) {
      console.error(err);
      setError("Failed to append comment.");
    }
  };

  // Save changes for core task parameters (Admin)
  const handleSaveTask = async (e) => {
    e.preventDefault();
    try {
      if (dialogTask) {
        // Edit mode
        const systemLog = {
          user: displayName,
          text: "Task details updated by Administrator",
          timestamp: new Date().toISOString(),
        };
        const payload = {
          ...formData,
          activity_log: [...(dialogTask.activity_log || []), systemLog],
        };
        await taskService.update(dialogTask.id, payload);
      } else {
        // Create mode
        const systemLog = {
          user: displayName,
          text: "Task initially created & assigned",
          timestamp: new Date().toISOString(),
        };
        const payload = {
          ...formData,
          activity_log: [systemLog],
        };
        await taskService.create(payload);
      }
      setIsDialogOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      setError("Failed to save task. Please verify your details.");
    }
  };

  // Update status and progress notes on details panel
  const handleUpdateStatusAndNotes = async (e) => {
    e.preventDefault();
    const logEntry = {
      user: displayName,
      text: `Changed status to "${detailsStatus}" and added progress notes`,
      timestamp: new Date().toISOString(),
    };

    try {
      const data = await taskService.patch(detailsTask.id, {
        status: detailsStatus,
        employee_notes: detailsNotes,
        activity_log: [...(detailsTask.activity_log || []), logEntry],
      });
      setDetailsTask(data);
      setTasks(tasks.map((t) => (t.id === detailsTask.id ? data : t)));
      setIsDetailsOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      setError("Failed to update task progress.");
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (window.confirm("Are you sure you want to delete this task?")) {
      try {
        await taskService.delete(taskId);
        fetchData();
      } catch (err) {
        console.error(err);
        setError("Failed to delete task.");
      }
    }
  };

  // Checklist stats helper
  const getChecklistStats = (checklist) => {
    if (!checklist || checklist.length === 0) return { total: 0, completed: 0, percent: 0 };
    const total = checklist.length;
    const completed = checklist.filter((item) => item.completed).length;
    const percent = Math.round((completed / total) * 100);
    return { total, completed, percent };
  };

  // Due Date urgency badge logic
  const getDueDateBadge = (dueDateStr, status) => {
    if (status === "completed") return null;
    const due = new Date(dueDateStr);
    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 animate-pulse border border-red-200 dark:border-red-900">
          Overdue
        </span>
      );
    } else if (diffDays === 0) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
          Due Today
        </span>
      );
    } else if (diffDays <= 3) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900">
          {diffDays}d left
        </span>
      );
    }
    return null;
  };

  // Filter by Assignment Type (Overall, Assigned to me, Assigned by me)
  const activeTabTasks = tasks.filter((task) => {
    if (assignmentFilter === "assigned_to_me") {
      return String(task.assigned_to) === String(claims.employee_id);
    }
    if (assignmentFilter === "assigned_by_me") {
      return task.assigned_by_name === currentUsername;
    }
    return true; // "all"
  });

  // Filter Tasks further by search and dropdowns
  const filteredTasks = activeTabTasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (task.employee_name && task.employee_name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
    const matchesAssignee = assigneeFilter === "all" || String(task.assigned_to) === String(assigneeFilter);

    let matchesDate = true;
    if (dateFilter !== "all") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(task.due_date);
      due.setHours(0, 0, 0, 0);
      const diffTime = due - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (dateFilter === "overdue") {
        matchesDate = diffDays < 0 && task.status !== "completed";
      } else if (dateFilter === "today") {
        matchesDate = diffDays === 0;
      } else if (dateFilter === "this_week") {
        matchesDate = diffDays >= 0 && diffDays <= 7;
      }
    }

    return matchesSearch && matchesStatus && matchesPriority && matchesAssignee && matchesDate;
  });

  const getStats = () => {
    const total = activeTabTasks.length;
    const pending = activeTabTasks.filter((t) => t.status === "pending").length;
    const inProgress = activeTabTasks.filter((t) => t.status === "in_progress").length;
    const completed = activeTabTasks.filter((t) => t.status === "completed").length;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = activeTabTasks.filter((t) => {
      if (t.status === "completed") return false;
      const due = new Date(t.due_date);
      due.setHours(0, 0, 0, 0);
      return due < today;
    }).length;

    return { total, pending, inProgress, completed, overdue };
  };

  const stats = getStats();

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case "high":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300">High</span>;
      case "medium":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-300">Medium</span>;
      case "low":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300">Low</span>;
      default:
        return null;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> Completed
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300">
            <Clock className="h-3 w-3 animate-pulse" /> In Progress
          </span>
        );
      case "pending":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300">
            <AlertCircle className="h-3 w-3" /> Pending
          </span>
        );
    }
  };

  const columns = [
    {
      key: "title",
      label: "Task details",
      render: (row) => {
        const { percent, total } = getChecklistStats(row.checklist);
        return (
          <div className="max-w-xs md:max-w-sm">
            <div className="font-semibold text-foreground truncate">{row.title}</div>
            <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{row.description}</div>
            {total > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${percent}%` }}></div>
                </div>
                <span className="text-[10px] text-muted-foreground font-semibold">{percent}% ({row.checklist.filter(c=>c.completed).length}/{total})</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "employee_name",
      label: "Assigned To",
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-indigo-500/20 text-indigo-500 flex items-center justify-center font-bold text-xs uppercase">
            {row.employee_name?.charAt(0) || "U"}
          </div>
          <span className="font-medium text-sm">{row.employee_name}</span>
        </div>
      ),
    },
    {
      key: "assigned_by_name",
      label: "Assigned By",
      render: (row) => (
        <span className="text-xs font-semibold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
          {row.assigned_by_name || "Admin/System"}
        </span>
      ),
    },
    { key: "priority", label: "Priority", render: (row) => getPriorityBadge(row.priority) },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <div className="flex flex-col gap-1 items-start">
          {getStatusBadge(row.status)}
          {getDueDateBadge(row.due_date, row.status)}
        </div>
      ),
    },
    {
      key: "due_date",
      label: "Due Date",
      render: (row) => (
        <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          {new Date(row.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (row) => (
        <div className="flex justify-end items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1" onClick={() => handleOpenDetails(row)}>
            <ExternalLink className="h-3.5 w-3.5" /> Details
          </Button>
          {canEditTask(row) && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted/80 text-muted-foreground" onClick={() => handleOpenEditDialog(row)}>
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteTask(row.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm font-medium">Loading Tasks...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GreetingHeader subtitle="Track your tasks, checklists, and activity log feeds in real-time." />
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card/40 backdrop-blur border border-border rounded-3xl p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ListTodo className="h-6 w-6 text-indigo-500" />
            Task Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? "Assign, manage, and monitor employee tasks, checklists, and activity log feeds."
              : "View checklists, update progress, and log notes on tasks assigned to or by you."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* View Switcher */}
          <div className="flex bg-muted/60 p-1 rounded-xl border border-border/60">
            <Button
              type="button"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="h-8 text-xs font-semibold px-3 rounded-lg"
            >
              List View
            </Button>
            <Button
              type="button"
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("kanban")}
              className="h-8 text-xs font-semibold px-3 rounded-lg"
            >
              Kanban Board
            </Button>
          </div>
          
          <Button onClick={handleOpenCreateDialog} className="gradient-brand shadow-glow text-white font-semibold flex items-center gap-1.5 px-4 rounded-xl py-2.5">
            <Plus className="h-4.5 w-4.5" /> Assign New Task
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Task Assignment Category Switcher */}
      <div className="flex flex-wrap bg-muted/40 p-1 rounded-2xl border border-border/80 w-fit gap-1">
        <button
          type="button"
          onClick={() => setAssignmentFilter("all")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-bold rounded-xl transition ${
            assignmentFilter === "all"
              ? "bg-card text-foreground shadow-sm border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Overall Tasks</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
            assignmentFilter === "all" ? "bg-indigo-500/15 text-indigo-500 dark:text-indigo-400" : "bg-muted text-muted-foreground"
          }`}>
            {tasks.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAssignmentFilter("assigned_to_me")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-bold rounded-xl transition ${
            assignmentFilter === "assigned_to_me"
              ? "bg-card text-foreground shadow-sm border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Assigned to Me</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
            assignmentFilter === "assigned_to_me" ? "bg-indigo-500/15 text-indigo-500 dark:text-indigo-400" : "bg-muted text-muted-foreground"
          }`}>
            {tasks.filter(t => String(t.assigned_to) === String(claims.employee_id)).length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAssignmentFilter("assigned_by_me")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-bold rounded-xl transition ${
            assignmentFilter === "assigned_by_me"
              ? "bg-card text-foreground shadow-sm border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Assigned by Me</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
            assignmentFilter === "assigned_by_me" ? "bg-indigo-500/15 text-indigo-500 dark:text-indigo-400" : "bg-muted text-muted-foreground"
          }`}>
            {tasks.filter(t => t.assigned_by_name === currentUsername).length}
          </span>
        </button>
      </div>

      {/* Analytics Dashboard Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-card/40 border border-border/80 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Total Tasks</span>
            <ListTodo className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold">{stats.total}</span>
          </div>
        </div>
        <div className="bg-card/40 border border-border/80 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Pending</span>
            <AlertCircle className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold">{stats.pending}</span>
          </div>
        </div>
        <div className="bg-card/40 border border-border/80 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">In Progress</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold">{stats.inProgress}</span>
          </div>
        </div>
        <div className="bg-card/40 border border-border/80 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Completed</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.completed}</span>
          </div>
        </div>
        <div className="bg-card/40 border border-border/80 rounded-2xl p-4 flex flex-col justify-between shadow-xs border-red-500/20 bg-red-500/5 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-600 dark:text-red-400 font-bold">Overdue</span>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.overdue}</span>
          </div>
        </div>
      </div>

      {/* Filter / Search Panel */}
      <div className="flex flex-col gap-4 bg-card/20 border border-border/80 rounded-3xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row gap-4 items-center">
          <div className="relative w-full lg:flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, description, or employee name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-11 bg-background/50 rounded-xl w-full"
            />
          </div>
          <div className="flex flex-wrap w-full lg:w-auto gap-3 items-center">
            <div className="flex items-center gap-2 flex-1 sm:flex-initial">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-auto h-11 px-3 bg-background/50 border border-input rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="flex-1 sm:flex-initial h-11 px-3 bg-background/50 border border-input rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="flex-1 sm:flex-initial h-11 px-3 bg-background/50 border border-input rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Assignees</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.employee_name}
                </option>
              ))}
            </select>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="flex-1 sm:flex-initial h-11 px-3 bg-background/50 border border-input rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Dates</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due Today</option>
              <option value="this_week">Due This Week</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Task List Grid/Table Layout */}
      {viewMode === "list" ? (
        <DataTable columns={columns} data={filteredTasks} emptyMessage="No tasks found matching your filters." />
      ) : (
        /* Employee Kanban Board */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {["pending", "in_progress", "completed"].map((colStatus) => {
            const statusTasks = filteredTasks.filter((t) => t.status === colStatus);
            const statusTitles = {
              pending: "Pending Tasks",
              in_progress: "In Progress",
              completed: "Completed",
            };
            const colHeaderStyles = {
              pending: "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/40",
              in_progress: "border-indigo-200 dark:border-indigo-950 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/20",
              completed: "border-emerald-200 dark:border-emerald-950 text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20",
            };
            return (
              <div key={colStatus} className="flex flex-col gap-4 bg-muted/20 border border-border/80 rounded-3xl p-4 min-h-[500px]">
                <div className={`flex justify-between items-center px-4 py-2 border rounded-2xl font-bold text-sm ${colHeaderStyles[colStatus]}`}>
                  <span>{statusTitles[colStatus]}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-background/80 shadow-xs border">
                    {statusTasks.length}
                  </span>
                </div>
                <div className="space-y-4 overflow-y-auto max-h-[700px] scrollbar-thin">
                  {statusTasks.length === 0 ? (
                    <div className="text-center py-10 border border-dashed border-muted rounded-2xl text-muted-foreground text-xs font-medium">
                      No tasks in this category
                    </div>
                  ) : (
                    statusTasks.map((task) => {
                      const { completed: doneCount, total: totalCount, percent } = getChecklistStats(task.checklist);
                      return (
                        <div key={task.id} className="glass-card hover:border-indigo-500/50 transition duration-300 rounded-2xl p-5 shadow-xs space-y-3.5 group relative">
                          <div className="flex flex-col gap-1 items-start">
                            <div className="flex justify-between items-start w-full gap-2">
                              <h3 className="font-semibold text-sm text-foreground line-clamp-1 leading-snug">{task.title}</h3>
                              {getPriorityBadge(task.priority)}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {getDueDateBadge(task.due_date, task.status)}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{task.description}</p>

                          <div className="space-y-1.5 bg-muted/20 border border-border/50 p-2.5 rounded-xl text-[11px]">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <User className="h-3.5 w-3.5 text-indigo-500" />
                              <span>To: <strong className="text-foreground">{task.employee_name || "Unassigned"}</strong></span>
                            </div>
                            {task.assigned_by_name && (
                              <div className="text-[10px] text-muted-foreground/80 pl-5">
                                Assigned by: <span className="font-semibold text-foreground/80">{task.assigned_by_name}</span>
                              </div>
                            )}
                          </div>
                          
                          {/* Subtask progress bar */}
                          {totalCount > 0 && (
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                                <span className="font-bold">Checklist</span>
                                <span>{percent}% ({doneCount}/{totalCount})</span>
                              </div>
                              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${percent}%` }}></div>
                              </div>
                            </div>
                          )}

                          <div className="flex justify-between items-center pt-3 border-t border-border/60">
                            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5" />
                              Due: {new Date(task.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {canEditTask(task) && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted/80 text-muted-foreground" onClick={() => handleOpenEditDialog(task)}>
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteTask(task.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              <Button variant="outline" size="sm" className="h-8 text-[11px] font-semibold gap-1 hover:bg-primary hover:text-white" onClick={() => handleOpenDetails(task)}>
                                Details
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Create/Edit Task Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-card border border-border shadow-2xl rounded-3xl p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-bold tracking-tight">
              {dialogTask ? "Edit Assigned Task" : "Assign New Task"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              Set task parameters, select the assignee, and add checklist items.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveTask} className="space-y-4">
            <div>
              <Label htmlFor="title" className="text-sm font-semibold text-foreground mb-1.5 block">Task Title</Label>
              <Input
                id="title"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Prepare client presentation deck"
                className="h-11 bg-background/50 rounded-xl"
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-sm font-semibold text-foreground mb-1.5 block">Description</Label>
              <textarea
                id="description"
                required
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Details about deliverables and requirements..."
                className="w-full bg-background/50 border border-input rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[70px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="assigned_to" className="text-sm font-semibold text-foreground mb-1.5 block">Assign To</Label>
                <select
                  id="assigned_to"
                  required
                  value={formData.assigned_to}
                  onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
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
                <Label htmlFor="due_date" className="text-sm font-semibold text-foreground mb-1.5 block">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  required
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="h-11 bg-background/50 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priority" className="text-sm font-semibold text-foreground mb-1.5 block">Priority</Label>
                <select
                  id="priority"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full h-11 px-3 bg-background/50 border border-input rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <Label htmlFor="status" className="text-sm font-semibold text-foreground mb-1.5 block">Status</Label>
                <select
                  id="status"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full h-11 px-3 bg-background/50 border border-input rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            {/* Checklist Section in Creation Form */}
            <div className="space-y-2 border-t pt-3 border-border/80">
              <Label className="text-sm font-semibold text-foreground block">Checklist Items</Label>
              <div className="flex gap-2">
                <Input
                  value={newSubtaskText}
                  onChange={(e) => setNewSubtaskText(e.target.value)}
                  placeholder="Add a subtask checklist item..."
                  className="h-10 bg-background/50 rounded-xl flex-1 text-xs"
                />
                <Button type="button" onClick={addSubtaskToForm} variant="outline" className="h-10 text-xs px-3 rounded-xl gap-1">
                  <PlusCircle className="h-4 w-4 text-indigo-500" /> Add
                </Button>
              </div>
              <div className="space-y-1.5 mt-2 max-h-32 overflow-y-auto scrollbar-thin">
                {formData.checklist.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground italic">No checklist items defined yet.</span>
                ) : (
                  formData.checklist.map((item) => (
                    <div key={item.id} className="flex justify-between items-center bg-muted/30 px-3 py-1.5 rounded-xl border border-border/50">
                      <span className="text-xs text-foreground font-medium">{item.text}</span>
                      <button type="button" onClick={() => removeSubtaskFromForm(item.id)} className="text-destructive hover:scale-105 transition">
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <DialogFooter className="mt-6 flex gap-3 justify-end">
              <Button type="button" variant="outline" className="rounded-xl h-11 font-semibold px-4" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="gradient-brand text-white font-semibold px-5 rounded-xl h-11 shadow-glow">
                {dialogTask ? "Save Changes" : "Assign Task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Advanced Task Details & Interaction Panel */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-2xl bg-card border border-border shadow-2xl rounded-3xl p-6 overflow-hidden flex flex-col max-h-[85vh]">
          {detailsTask && (
            <>
              <DialogHeader className="mb-2">
                <div className="flex justify-between items-start w-full pr-6 gap-2">
                  <DialogTitle className="text-xl font-bold tracking-tight text-foreground leading-snug">
                    {detailsTask.title}
                  </DialogTitle>
                  {getPriorityBadge(detailsTask.priority)}
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  {getStatusBadge(detailsTask.status)}
                  <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    Due Date: {new Date(detailsTask.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                  <span className="text-xs text-muted-foreground">Assigned to: <strong>{detailsTask.employee_name}</strong></span>
                  {detailsTask.assigned_by_name && (
                    <span className="text-xs text-muted-foreground">Assigned by: <strong>{detailsTask.assigned_by_name}</strong></span>
                  )}
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto space-y-5 py-4 scrollbar-thin pr-1 border-t border-b border-border/80">
                {/* Description */}
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Description</h4>
                  <p className="text-sm text-foreground/80 leading-relaxed bg-muted/20 border p-3 rounded-2xl">
                    {detailsTask.description}
                  </p>
                </div>

                {/* Subtask Checklist Section */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                      <ListTodo className="h-4 w-4 text-indigo-500" />
                      Subtasks Checklist
                    </h4>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {getChecklistStats(detailsTask.checklist).percent}% Completed
                    </span>
                  </div>

                  {/* Add Subtask Directly */}
                  <form onSubmit={handleAddSubtaskDetails} className="flex gap-2">
                    <Input
                      value={newSubtaskText}
                      onChange={(e) => setNewSubtaskText(e.target.value)}
                      placeholder="Add another subtask to checklist..."
                      className="h-10 bg-background/50 rounded-xl flex-1 text-xs"
                    />
                    <Button type="submit" variant="outline" className="h-10 text-xs px-3 rounded-xl gap-1">
                      <Plus className="h-3.5 w-3.5 text-indigo-500" /> Add
                    </Button>
                  </form>

                  <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                    {(detailsTask.checklist || []).length === 0 ? (
                      <span className="text-xs text-muted-foreground italic pl-1 block">No checklist items logged. Add one above!</span>
                    ) : (
                      detailsTask.checklist.map((item) => (
                        <div key={item.id} className="flex justify-between items-center bg-muted/40 border border-border/50 rounded-xl px-4 py-2 hover:bg-muted/60 transition">
                          <label className="flex items-center gap-3 cursor-pointer select-none text-xs font-medium text-foreground flex-1">
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() => handleToggleDetailsSubtask(item.id)}
                              className="h-4.5 w-4.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className={item.completed ? "line-through text-muted-foreground" : "text-foreground"}>
                              {item.text}
                            </span>
                          </label>
                          <button type="button" onClick={() => handleRemoveSubtaskDetails(item.id)} className="text-destructive hover:scale-105 ml-2">
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Progress Notes Form */}
                <form onSubmit={handleUpdateStatusAndNotes} className="space-y-3 pt-3 border-t border-border/80">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Update Progress & Notes</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="md:col-span-1">
                      <Label htmlFor="details_status" className="text-xs text-muted-foreground font-semibold mb-1 block">Update Status</Label>
                      <select
                        id="details_status"
                        value={detailsStatus}
                        onChange={(e) => setDetailsStatus(e.target.value)}
                        className="w-full h-11 px-3 bg-background/50 border border-input rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                    <div className="md:col-span-2 flex gap-2">
                      <div className="flex-1">
                        <Label htmlFor="details_notes" className="text-xs text-muted-foreground font-semibold mb-1 block">Progress Notes</Label>
                        <Input
                          id="details_notes"
                          value={detailsNotes}
                          onChange={(e) => setDetailsNotes(e.target.value)}
                          placeholder="e.g. Completed initial design drafting..."
                          className="h-11 bg-background/50 rounded-xl text-xs"
                        />
                      </div>
                      <Button type="submit" className="gradient-brand text-white font-semibold h-11 rounded-xl px-4 mt-auto">
                        Save Status
                      </Button>
                    </div>
                  </div>
                </form>

                {/* Activity Log / Comments thread */}
                <div className="space-y-3 pt-3 border-t border-border/80">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                    <History className="h-4 w-4 text-indigo-500" />
                    Activity & Comments Log
                  </h4>

                  {/* Comment box */}
                  <form onSubmit={handleAddComment} className="flex gap-2">
                    <Input
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Write a comment or update..."
                      className="h-10 bg-background/50 rounded-xl flex-1 text-xs"
                    />
                    <Button type="submit" className="h-10 px-4 rounded-xl gradient-brand text-white font-semibold gap-1">
                      <Send className="h-3 w-3" /> Post
                    </Button>
                  </form>

                  {/* Thread list */}
                  <div className="space-y-3 mt-3 max-h-56 overflow-y-auto scrollbar-thin">
                    {(!detailsTask.activity_log || detailsTask.activity_log.length === 0) ? (
                      <span className="text-xs text-muted-foreground italic pl-1 block">No history entries logged yet.</span>
                    ) : (
                      [...detailsTask.activity_log].reverse().map((log, index) => (
                        <div key={index} className="bg-muted/30 border border-border/50 rounded-2xl p-3 space-y-1.5">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="font-bold text-foreground flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" /> {log.user}
                            </span>
                            <span className="text-muted-foreground">
                              {new Date(log.timestamp).toLocaleString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-xs text-foreground/80 leading-relaxed font-medium pl-1">
                            {log.text}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-4 flex justify-end">
                <Button type="button" variant="outline" className="rounded-xl h-10 font-semibold px-4" onClick={() => setIsDetailsOpen(false)}>
                  Close Panel
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
