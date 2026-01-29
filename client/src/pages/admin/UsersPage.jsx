// client/src/pages/admin/UsersPage.jsx
import React, { useEffect, useState } from 'react';
import axios from '../../api/axios.js';
import { useAuth } from '../../context/AuthContext.jsx';

const roles = ['admin', 'accounts', 'sales'];

const UsersPage = () => {
  const { user: currentUser } = useAuth();

  const [rows, setRows] = useState([]);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({
    name: '',
    email: '',
    role: 'accounts',
    password: ''
  });

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'accounts'
  });

  const load = async () => {
    const res = await axios.get('/users');
    setRows(res.data);
  };

  useEffect(() => {
    load();
  }, []);

  /* ---------- Create user ---------- */

  const handleNewChange = (e) => {
    const { name, value } = e.target;
    setNewUser((u) => ({ ...u, [name]: value }));
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.password) return;

    setCreating(true);
    try {
      await axios.post('/users', newUser);
      setNewUser({ name: '', email: '', password: '', role: 'accounts' });
      await load();
    } catch (err) {
      console.error(err);
      const msg =
        err.response?.data?.message ||
        `Failed to create user (status ${err.response?.status ?? 'unknown'})`;
      alert(msg);
    } finally {
      setCreating(false);
    }
  };

  /* ---------- Edit / update user ---------- */

  const startEdit = (u) => {
    setEditingId(u.id);
    setEditValues({
      name: u.name,
      email: u.email,
      role: u.role,
      password: ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({
      name: '',
      email: '',
      role: 'accounts',
      password: ''
    });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditValues((v) => ({ ...v, [name]: value }));
  };

  const saveEdit = async (id) => {
    setSavingId(id);
    try {
      const payload = {
        name: editValues.name,
        email: editValues.email,
        role: editValues.role
      };
      if (editValues.password && editValues.password.trim() !== '') {
        payload.password = editValues.password;
      }

      await axios.put(`/users/${id}`, payload);
      await load();
      cancelEdit();
    } catch (err) {
      console.error(err);
      const msg =
        err.response?.data?.message ||
        `Failed to update user (status ${err.response?.status ?? 'unknown'})`;
      alert(msg);
    } finally {
      setSavingId(null);
    }
  };

  /* ---------- Delete user ---------- */

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    try {
      await axios.delete(`/users/${id}`);
      await load();
    } catch (err) {
      console.error(err);
      const msg =
        err.response?.data?.message ||
        `Failed to delete user (status ${err.response?.status ?? 'unknown'})`;
      alert(msg);
    }
  };

  return (
    <div className="p-6 space-y-4 bg-gradient-to-br from-slate-50 via-sky-50/60 to-indigo-50/40">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm md:text-base font-semibold text-slate-900">
            User &amp; Role Management
          </h2>
          <p className="text-[11px] text-slate-500">
            Control access for Admin, Accounts and Sales users.
          </p>
        </div>
      </div>

      {/* Create user form */}
      <form
        onSubmit={handleCreateUser}
        className="bg-white/90 border border-slate-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3 text-[11px] shadow-sm"
      >
        <div>
          <label className="block text-slate-500 mb-1">Name</label>
          <input
            name="name"
            value={newUser.name}
            onChange={handleNewChange}
            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            required
          />
        </div>
        <div>
          <label className="block text-slate-500 mb-1">Email</label>
          <input
            type="email"
            name="email"
            value={newUser.email}
            onChange={handleNewChange}
            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            required
          />
        </div>
        <div>
          <label className="block text-slate-500 mb-1">Password</label>
          <input
            type="password"
            name="password"
            value={newUser.password}
            onChange={handleNewChange}
            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            required
          />
        </div>
        <div>
          <label className="block text-slate-500 mb-1">Role</label>
          <select
            name="role"
            value={newUser.role}
            onChange={handleNewChange}
            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={creating}
            className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-60 w-full"
          >
            {creating ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </form>

      {/* Users table */}
      <div className="overflow-x-auto bg-white/90 border border-slate-200 rounded-2xl shadow-sm">
        <table className="min-w-full text-[11px]">
          <thead className="text-slate-500 border-b border-slate-200 bg-slate-50/80">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const isEditing = editingId === u.id;
              const isSelf = u.id === currentUser?.id;

              return (
                <tr
                  key={u.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-sky-50/60"
                >
                  <td className="px-3 py-2 text-slate-900 align-top">
                    {isEditing ? (
                      <input
                        name="name"
                        value={editValues.name}
                        onChange={handleEditChange}
                        className="w-full px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    ) : (
                      u.name
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700 align-top">
                    {isEditing ? (
                      <input
                        name="email"
                        value={editValues.email}
                        onChange={handleEditChange}
                        className="w-full px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    ) : (
                      u.email
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700 align-top">
                    {isEditing ? (
                      <>
                        <select
                          name="role"
                          value={editValues.role}
                          onChange={handleEditChange}
                          className="w-full px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        >
                          {roles.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <div className="mt-2">
                          <label className="block text-slate-500 mb-1">
                            New password (optional)
                          </label>
                          <input
                            type="password"
                            name="password"
                            value={editValues.password}
                            onChange={handleEditChange}
                            className="w-full px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                            placeholder="Leave blank to keep existing"
                          />
                        </div>
                      </>
                    ) : (
                      <span className="capitalize">{u.role}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500 align-top">
                    {u.created_at}
                  </td>
                  <td className="px-3 py-2 space-x-2 align-top">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => saveEdit(u.id)}
                          disabled={savingId === u.id}
                          className="px-2 py-0.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        >
                          {savingId === u.id ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-2 py-0.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(u)}
                          className="px-2 py-0.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                        >
                          Edit
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="px-2 py-0.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          >
                            Delete
                          </button>
                        )}
                        {isSelf && (
                          <span className="text-slate-400 ml-1 text-[10px]">
                            You
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UsersPage;
