// client/src/pages/TasksPage.jsx
import React, { useEffect, useState } from "react";
import axios from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { parseISO, format } from "date-fns";

const statusLabel = (status) => {
  if (status === "completed") return "Completed";
  if (status === "rejected") return "Rejected";
  return "Ongoing";
};

const statusClass = (status) => {
  if (status === "completed")
    return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (status === "rejected")
    return "bg-rose-50 text-rose-700 border border-rose-200";
  return "bg-amber-50 text-amber-700 border border-amber-200";
};

const parseISODate = (value) => (value ? parseISO(value) : null);
const toISODateString = (date) => (date ? format(date, "yyyy-MM-dd") : "");

const TasksPage = () => {
  const { user } = useAuth();
  const role = user?.role;

  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Admin-only: sales user options
  const [salesUsers, setSalesUsers] = useState([]);
  const [salesError, setSalesError] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    due_date: "",
    assigned_to: "",
  });

  // Chat state
  const [selectedTask, setSelectedTask] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  /* ---------- Load tasks ---------- */

  const loadTasks = async () => {
    setLoadingTasks(true);
    try {
      const res = await axios.get("/tasks");
      setTasks(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to load tasks");
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  /* ---------- Load sales for assignment (admin) ---------- */

  useEffect(() => {
    const fetchSales = async () => {
      if (role !== "admin") return;
      setSalesError("");
      try {
        // try /admin/users first
        let res;
        try {
          res = await axios.get("/admin/users");
        } catch (err) {
          // if that fails, try /users as a fallback
          console.warn("GET /admin/users failed, trying /users", err);
          res = await axios.get("/users");
        }
        const sales = (res.data || []).filter((u) => u.role === "sales");
        setSalesUsers(sales);
        if (!sales.length) {
          setSalesError("No sales users found. Create Sales users in Users & Roles.");
        }
      } catch (err) {
        console.error("Failed to load sales users", err);
        setSalesError("Failed to load sales users.");
      }
    };

    fetchSales();
  }, [role]);

  /* ---------- Create task (admin) ---------- */

  const handleTaskFormChange = (e) => {
    const { name, value } = e.target;
    setTaskForm((f) => ({ ...f, [name]: value }));
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title || !taskForm.assigned_to) return;

    setCreatingTask(true);
    try {
      await axios.post("/tasks", {
        title: taskForm.title,
        description: taskForm.description,
        due_date: taskForm.due_date || null,
        assigned_to: Number(taskForm.assigned_to),
      });
      setTaskForm({
        title: "",
        description: "",
        due_date: "",
        assigned_to: "",
      });
      await loadTasks();
    } catch (err) {
      console.error(err);
      const msg =
        err.response?.data?.message ||
        `Failed to create task (status ${err.response?.status ?? "unknown"})`;
      alert(msg);
    } finally {
      setCreatingTask(false);
    }
  };

  /* ---------- Status updates ---------- */

  const canChangeStatus = (task) => {
    if (!user) return false;
    if (role === "admin") return true;
    if (role === "sales" && task.assigned_to === user.id) return true;
    return false;
  };

  const handleStatusChange = async (task, value) => {
    try {
      await axios.put(`/tasks/${task.id}/status`, { status: value });
      await loadTasks();
      if (selectedTask && selectedTask.id === task.id) {
        setSelectedTask({ ...selectedTask, status: value });
      }
    } catch (err) {
      console.error(err);
      const msg =
        err.response?.data?.message ||
        `Failed to update status (status ${err.response?.status ?? "unknown"})`;
      alert(msg);
    }
  };

  /* ---------- Chat / messages ---------- */

  const loadMessages = async (taskId) => {
    setLoadingMessages(true);
    try {
      const res = await axios.get(`/tasks/${taskId}/messages`);
      setMessages(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to load messages");
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSelectTask = (task) => {
    setSelectedTask(task);
    setMessages([]);
    loadMessages(task.id);
  };

  const handleSendMessage = async () => {
    if (!selectedTask || !newMessage.trim()) return;
    setSendingMessage(true);
    try {
      const res = await axios.post(`/tasks/${selectedTask.id}/messages`, {
        message: newMessage,
      });
      setMessages((prev) => [...prev, res.data]);
      setNewMessage("");
    } catch (err) {
      console.error(err);
      const msg =
        err.response?.data?.message ||
        `Failed to send message (status ${err.response?.status ?? "unknown"})`;
      alert(msg);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm("Delete this task and its chat?")) return;
    try {
      await axios.delete(`/tasks/${taskId}`);
      await loadTasks();
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask(null);
        setMessages([]);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete task");
    }
  };

  /* ---------- Render ---------- */

  return (
    <div className="p-6 space-y-4 bg-gradient-to-br from-slate-50 via-sky-50/60 to-indigo-50/40">
      {/* Header */}
      <div>
        <h2 className="text-sm md:text-base font-semibold text-slate-900">
          Tasks &amp; Follow-ups
        </h2>
        <p className="text-[11px] text-slate-500">
          Admin assigns tasks to Sales. Sales update status (Completed / Ongoing /
          Rejected) and everyone (Admin, Accounts, Sales) can chat per task.
        </p>
      </div>

      {/* Admin task creation */}
      {role === "admin" && (
        <form
          onSubmit={handleCreateTask}
          className="bg-white/80 border border-slate-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3 text-[11px] shadow-sm"
        >
          <div>
            <label className="block text-slate-500 mb-1">Title</label>
            <input
              name="title"
              value={taskForm.title}
              onChange={handleTaskFormChange}
              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="Follow-up call, send proposal…"
              required
            />
          </div>

          <div>
            <label className="block text-slate-500 mb-1">Assign to (Sales)</label>
            <select
              name="assigned_to"
              value={taskForm.assigned_to}
              onChange={handleTaskFormChange}
              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              required
            >
              <option value="">Select sales user</option>
              {salesUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
            {salesError && (
              <p className="text-[10px] text-amber-500 mt-1">{salesError}</p>
            )}
          </div>

          <div>
            <label className="block text-slate-500 mb-1">Due date</label>
            <DatePicker
              selected={taskForm.due_date ? parseISODate(taskForm.due_date) : null}
              onChange={(date) =>
                setTaskForm((f) => ({
                  ...f,
                  due_date: toISODateString(date),
                }))
              }
              dateFormat="yyyy-MM-dd"
              placeholderText="dd/mm/yyyy"
              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-slate-500 mb-1">
              Description / Lead context
            </label>
            <input
              name="description"
              value={taskForm.description}
              onChange={handleTaskFormChange}
              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              placeholder="Mention lead name / query here"
            />
          </div>

          <div className="md:col-span-5 flex justify-end">
            <button
              type="submit"
              disabled={creatingTask}
              className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-60"
            >
              {creatingTask ? "Creating…" : "Create Task"}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Task list */}
        <div className="xl:col-span-2 bg-white/80 border border-slate-200 rounded-2xl overflow-x-auto shadow-sm">
          <table className="min-w-full text-[11px]">
            <thead className="text-slate-500 border-b border-slate-200 bg-slate-50/70">
              <tr>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Assigned to</th>
                <th className="px-3 py-2 text-left">Due</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-slate-100 last:border-0 ${
                    selectedTask && selectedTask.id === t.id
                      ? "bg-sky-50"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <td className="px-3 py-2 text-slate-900">
                    <button
                      type="button"
                      onClick={() => handleSelectTask(t)}
                      className="text-left w-full"
                    >
                      {t.title}
                      {t.description && (
                        <div className="text-[10px] text-slate-500 truncate">
                          {t.description}
                        </div>
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {t.assigned_to_name || "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {t.due_date || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {canChangeStatus(t) ? (
                      <select
                        value={t.status === "open" ? "ongoing" : t.status}
                        onChange={(e) => handleStatusChange(t, e.target.value)}
                        className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      >
                        <option value="ongoing">Ongoing</option>
                        <option value="completed">Completed</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    ) : (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] uppercase ${statusClass(
                          t.status
                        )}`}
                      >
                        {statusLabel(t.status)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 space-x-2">
                    <button
                      type="button"
                      onClick={() => handleSelectTask(t)}
                      className="px-2 py-0.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100"
                    >
                      View
                    </button>
                    {role === "admin" && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(t.id)}
                        className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!loadingTasks && tasks.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    No tasks assigned yet.
                  </td>
                </tr>
              )}
              {loadingTasks && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    Loading tasks…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Chat panel */}
        <div className="bg-white/80 border border-slate-200 rounded-2xl p-4 flex flex-col shadow-sm">
          {selectedTask ? (
            <>
              <div className="mb-3">
                <div className="text-sm font-semibold text-slate-900">
                  {selectedTask.title}
                </div>
                <div className="text-[11px] text-slate-500">
                  Assigned to{" "}
                  <span className="text-sky-700 font-medium">
                    {selectedTask.assigned_to_name || "—"}
                  </span>
                  {selectedTask.due_date && (
                    <>
                      {" · "}Due{" "}
                      <span className="text-slate-700">
                        {selectedTask.due_date}
                      </span>
                    </>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Use this chat to discuss lead-related queries between Sales,
                  Accounts and Admin. Admin can see and reply to all messages.
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1">
                {loadingMessages && (
                  <div className="text-[11px] text-slate-500">
                    Loading messages…
                  </div>
                )}
                {!loadingMessages && messages.length === 0 && (
                  <div className="text-[11px] text-slate-500">
                    No messages yet. Start the conversation below.
                  </div>
                )}
                {messages.map((m) => {
                  const mine = user && m.author_id === user.id;
                  const bubbleAlign = mine ? "justify-end" : "justify-start";
                  let bubbleClasses =
                    "max-w-xs rounded-2xl px-3 py-2 border text-[11px]";

                  if (mine) {
                    bubbleClasses +=
                      " bg-sky-50 border-sky-200 text-sky-900";
                  } else if (m.author_role === "admin") {
                    bubbleClasses +=
                      " bg-emerald-50 border-emerald-200 text-emerald-900";
                  } else if (m.author_role === "accounts") {
                    bubbleClasses +=
                      " bg-amber-50 border-amber-200 text-amber-900";
                  } else {
                    bubbleClasses +=
                      " bg-slate-50 border-slate-200 text-slate-900";
                  }

                  return (
                    <div key={m.id} className={`flex ${bubbleAlign}`}>
                      <div className={bubbleClasses}>
                        <div className="text-[10px] text-slate-400 mb-0.5">
                          {m.author_name} ({m.author_role}) · {m.created_at}
                        </div>
                        <div className="whitespace-pre-wrap">{m.message}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-auto pt-2 border-t border-slate-200">
                <textarea
                  rows={3}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-800 mb-2 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Type your query / update here…"
                />
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={sendingMessage || !newMessage.trim()}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-[11px] disabled:opacity-60"
                >
                  {sendingMessage ? "Sending…" : "Send message"}
                </button>
              </div>
            </>
          ) : (
            <div className="text-[11px] text-slate-500">
              Select a task from the left to view and reply to Sales / Accounts /
              Admin conversation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TasksPage;
