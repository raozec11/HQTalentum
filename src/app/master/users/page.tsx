"use client";

import { useState, useEffect, useCallback } from "react";
import { db, firebaseConfig } from "@/lib/firebase";
import {
  collection, getDocs, doc, updateDoc, setDoc, serverTimestamp, deleteDoc
} from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Users, Search, RefreshCw, Loader2, Edit2, CheckCircle,
  XCircle, X, Mail, Lock, User, Plus, ShieldCheck, Settings, Trash2
} from "lucide-react";
import { usePlatformPermissions } from "@/hooks/usePlatformPermissions";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";

// ── All system permissions ─────────────────────────────────────────────────────
const ALL_PERMISSIONS = [
  { id: "view_dashboard",       label: "View Master Dashboard",     group: "Dashboard" },
  { id: "manage_companies",     label: "Manage Companies",          group: "Companies" },
  { id: "create_company",       label: "Create New Company",        group: "Companies" },
  { id: "edit_company",         label: "Edit Company Details",      group: "Companies" },
  { id: "disable_company",      label: "Disable/Enable Company",    group: "Companies" },
  { id: "blacklist_company",    label: "Blacklist Company",         group: "Companies" },
  { id: "view_company_users",   label: "View Company Users",        group: "Company Users" },
  { id: "create_company_user",  label: "Create Company User",       group: "Company Users" },
  { id: "edit_company_user",    label: "Edit Company User",         group: "Company Users" },
  { id: "disable_company_user", label: "Disable Company User",     group: "Company Users" },
  { id: "view_platform_team",   label: "View Platform Team",        group: "Platform Team" },
  { id: "manage_platform_users","label": "Manage Platform Users",   group: "Platform Team" },
  { id: "manage_roles",         label: "Manage Roles & Permissions",group: "Platform Team" },
  { id: "view_reports",         label: "View Platform Reports",     group: "Reports" },
  { id: "manage_settings",      label: "Manage Platform Settings",  group: "Settings" },
  { id: "upload_assets",        label: "Upload Assets & Logos",     group: "Settings" },
];

const PERMISSION_GROUPS = Array.from(new Set(ALL_PERMISSIONS.map(p => p.group)));

// Default roles seeded into Firestore if none exist
const DEFAULT_ROLES: { id: string; label: string; permissions: string[] }[] = [
  {
    id: "platform_admin",
    label: "Platform Admin",
    permissions: ALL_PERMISSIONS.map(p => p.id),
  },
  {
    id: "platform_manager",
    label: "Platform Manager",
    permissions: ["view_dashboard","manage_companies","create_company","edit_company","disable_company","view_company_users","create_company_user","edit_company_user","disable_company_user","view_platform_team","view_reports"],
  },
  {
    id: "platform_support",
    label: "Platform Support",
    permissions: ["view_dashboard","view_company_users","view_platform_team","view_reports"],
  },
  {
    id: "platform_viewer",
    label: "Platform Viewer",
    permissions: ["view_dashboard","view_reports"],
  },
];

interface PlatformRole { id: string; label: string; permissions: string[]; custom?: boolean; }
interface PlatformUser { id: string; name: string; email: string; role: string; status?: string; }

const ROLE_COLORS: Record<string, string> = {
  platform_admin: "bg-indigo-50 text-indigo-700 border-indigo-100",
  platform_manager: "bg-purple-50 text-purple-700 border-purple-100",
  platform_support: "bg-sky-50 text-sky-700 border-sky-100",
  platform_viewer: "bg-slate-50 text-slate-600 border-slate-200",
};

// ── Manage Roles Modal ─────────────────────────────────────────────────────────
function RolesModal({ onClose }: { onClose: () => void }) {
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<PlatformRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [newRoleId, setNewRoleId] = useState("");
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { loadRoles(); }, []);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "platform_roles"));
      if (snap.empty) {
        // Seed defaults
        for (const r of DEFAULT_ROLES) {
          await setDoc(doc(db, "platform_roles", r.id), { label: r.label, permissions: r.permissions, custom: false });
        }
        setRoles(DEFAULT_ROLES.map(r => ({ ...r, custom: false })));
      } else {
        const list: PlatformRole[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() } as PlatformRole));
        setRoles(list);
      }
    } finally { setLoading(false); }
  };

  const togglePermission = (permId: string) => {
    if (!selectedRole) return;
    const has = selectedRole.permissions.includes(permId);
    setSelectedRole({
      ...selectedRole,
      permissions: has
        ? selectedRole.permissions.filter(p => p !== permId)
        : [...selectedRole.permissions, permId],
    });
  };

  const saveRole = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "platform_roles", selectedRole.id), {
        permissions: selectedRole.permissions,
        label: selectedRole.label,
      });
      setRoles(prev => prev.map(r => r.id === selectedRole.id ? selectedRole : r));
    } finally { setSaving(false); }
  };

  const createRole = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    const id = newRoleId.toLowerCase().replace(/\s+/g, "_");
    if (roles.find(r => r.id === id)) { setErr("A role with this ID already exists."); return; }
    const newRole: PlatformRole = { id, label: newRoleLabel, permissions: [], custom: true };
    await setDoc(doc(db, "platform_roles", id), { label: newRoleLabel, permissions: [], custom: true });
    setRoles(prev => [...prev, newRole]);
    setNewRoleId(""); setNewRoleLabel(""); setShowNewForm(false);
    setSelectedRole(newRole);
  };

  const deleteRole = async (rid: string) => {
    if (!(await confirmAction("Delete this role? Users with this role will lose their permissions."))) return;
    await deleteDoc(doc(db, "platform_roles", rid));
    setRoles(prev => prev.filter(r => r.id !== rid));
    if (selectedRole?.id === rid) setSelectedRole(null);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-[20px] font-black text-[#1e1b4b]">Manage Roles & Permissions</h2>
            <p className="text-slate-400 text-sm">Define what each platform role can access.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowNewForm(v => !v)} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold h-9 px-4 rounded-xl text-sm border border-indigo-100">
              <Plus className="w-4 h-4 mr-1" /> New Role
            </Button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 text-slate-400 rounded-xl transition-colors"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* New role form */}
        {showNewForm && (
          <form onSubmit={createRole} className="flex items-end gap-3 px-7 py-3 bg-indigo-50 border-b border-indigo-100 shrink-0">
            {err && <p className="text-red-500 text-xs font-bold">{err}</p>}
            <div className="flex-1">
              <label className="text-[11px] font-bold text-indigo-500 block mb-1">Role ID (slug)</label>
              <Input value={newRoleId} onChange={e => setNewRoleId(e.target.value)} placeholder="e.g. platform_billing" required className="h-9 rounded-xl text-sm" />
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-bold text-indigo-500 block mb-1">Display Name</label>
              <Input value={newRoleLabel} onChange={e => setNewRoleLabel(e.target.value)} placeholder="e.g. Billing Manager" required className="h-9 rounded-xl text-sm" />
            </div>
            <Button type="submit" className="h-9 px-4 bg-[#1e1b4b] text-white font-bold rounded-xl text-sm">Create</Button>
            <button type="button" onClick={() => setShowNewForm(false)} className="h-9 px-3 text-slate-400 hover:text-slate-600 text-sm">Cancel</button>
          </form>
        )}

        {/* Body: role list + permission editor */}
        <div className="flex flex-1 overflow-hidden">
          {/* Role list */}
          <div className="w-56 shrink-0 border-r border-slate-100 overflow-y-auto p-3 space-y-1">
            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : roles.map(r => (
              <div key={r.id} className={`group flex items-center justify-between gap-1 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${selectedRole?.id === r.id ? "bg-indigo-600 text-white" : "hover:bg-slate-50 text-slate-600"}`}
                onClick={() => setSelectedRole(r)}>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-bold truncate ${selectedRole?.id === r.id ? "text-white" : "text-[#1e1b4b]"}`}>{r.label}</div>
                  <div className={`text-[11px] ${selectedRole?.id === r.id ? "text-indigo-200" : "text-slate-400"}`}>{r.permissions.length} perms</div>
                </div>
                {r.custom && (
                  <button onClick={e => { e.stopPropagation(); deleteRole(r.id); }}
                    className={`p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${selectedRole?.id === r.id ? "hover:bg-indigo-700 text-indigo-200" : "hover:bg-red-50 text-red-400"}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Permission editor */}
          <div className="flex-1 overflow-y-auto">
            {!selectedRole ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3">
                <Settings className="w-12 h-12" />
                <p className="font-medium text-sm">Select a role to edit permissions</p>
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-[17px] font-extrabold text-[#1e1b4b]">{selectedRole.label}</h3>
                    <p className="text-slate-400 text-sm">{selectedRole.permissions.length} of {ALL_PERMISSIONS.length} permissions enabled</p>
                  </div>
                  <Button onClick={saveRole} disabled={saving} className="bg-[#1e1b4b] hover:bg-[#312e81] text-white font-bold h-9 px-5 rounded-xl text-sm">
                    {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving</> : "Save Changes"}
                  </Button>
                </div>

                {/* Quick toggle all */}
                <div className="flex gap-2 mb-5">
                  <button onClick={() => setSelectedRole({ ...selectedRole, permissions: ALL_PERMISSIONS.map(p => p.id) })}
                    className="text-[12px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 hover:bg-emerald-100 transition-colors">
                    ✓ Grant All
                  </button>
                  <button onClick={() => setSelectedRole({ ...selectedRole, permissions: [] })}
                    className="text-[12px] font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-100 transition-colors">
                    ✕ Revoke All
                  </button>
                </div>

                {/* Permission groups */}
                <div className="space-y-5">
                  {PERMISSION_GROUPS.map(group => {
                    const perms = ALL_PERMISSIONS.filter(p => p.group === group);
                    const allEnabled = perms.every(p => selectedRole.permissions.includes(p.id));
                    return (
                      <div key={group}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[12px] font-black text-slate-400 uppercase tracking-wider">{group}</h4>
                          <button onClick={() => {
                            const ids = perms.map(p => p.id);
                            if (allEnabled) {
                              setSelectedRole({ ...selectedRole, permissions: selectedRole.permissions.filter(p => !ids.includes(p)) });
                            } else {
                              setSelectedRole({ ...selectedRole, permissions: Array.from(new Set([...selectedRole.permissions, ...ids])) });
                            }
                          }} className="text-[11px] font-bold text-indigo-500 hover:text-indigo-700">
                            {allEnabled ? "Remove all" : "Add all"}
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {perms.map(perm => {
                            const enabled = selectedRole.permissions.includes(perm.id);
                            return (
                              <button key={perm.id} onClick={() => togglePermission(perm.id)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all ${enabled ? "border-emerald-200 bg-emerald-50" : "border-slate-100 bg-white hover:bg-slate-50"}`}>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${enabled ? "border-emerald-500 bg-emerald-500" : "border-slate-300"}`}>
                                  {enabled && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                                </div>
                                <span className={`text-[13px] font-semibold ${enabled ? "text-emerald-700" : "text-slate-500"}`}>{perm.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
const PLATFORM_ROLES = ["platform_admin", "platform_manager", "platform_support", "platform_viewer"];

export default function UsersPage() {
  const { hasPermission } = usePlatformPermissions();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [rolesMeta, setRolesMeta] = useState<Record<string, { label: string; permissions: string[] }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showRolesModal, setShowRolesModal] = useState(false);

  // Edit
  const [editUser, setEditUser] = useState<PlatformUser | null>(null);
  const [editName, setEditName] = useState(""); const [editRole, setEditRole] = useState("");
  const [editSaving, setEditSaving] = useState(false); const [editErr, setEditErr] = useState("");

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState(""); const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState(""); const [newRole, setNewRole] = useState("platform_support");
  const [creating, setCreating] = useState(false); const [createErr, setCreateErr] = useState("");

  const [allRoles, setAllRoles] = useState<string[]>(PLATFORM_ROLES);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load roles metadata
      const rolesSnap = await getDocs(collection(db, "platform_roles"));
      const meta: Record<string, { label: string; permissions: string[] }> = {};
      const roleIds: string[] = [];
      rolesSnap.forEach(d => {
        meta[d.id] = d.data() as any;
        roleIds.push(d.id);
      });
      setRolesMeta(meta);
      if (roleIds.length > 0) setAllRoles(roleIds);

      // Load users with platform roles
      const usersSnap = await getDocs(collection(db, "users"));
      const list: PlatformUser[] = [];
      usersSnap.forEach(d => {
        const data = d.data();
        const isPlatform = PLATFORM_ROLES.includes(data.role) || roleIds.includes(data.role);
        if (isPlatform) list.push({ id: d.id, ...data } as PlatformUser);
      });
      setUsers(list);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleStatus = async (uid: string, cur: string) => {
    const next = cur === "active" ? "disabled" : "active";
    await updateDoc(doc(db, "users", uid), { status: next });
    setUsers(prev => prev.map(u => u.id === uid ? { ...u, status: next } : u));
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setEditSaving(true); setEditErr("");
    try {
      await updateDoc(doc(db, "users", editUser.id), { name: editName, role: editRole });
      setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, name: editName, role: editRole } : u));
      setEditUser(null);
    } catch (err: any) { setEditErr(err.message); }
    finally { setEditSaving(false); }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true); setCreateErr("");
    try {
      const appName = `pu-${Date.now()}`;
      const secondary = initializeApp(firebaseConfig, appName);
      const secAuth = getAuth(secondary);
      try {
        const cred = await createUserWithEmailAndPassword(secAuth, newEmail, newPass);
        await setDoc(doc(db, "users", cred.user.uid), {
          name: newName, email: newEmail, role: newRole, companyId: "master",
          status: "active", createdAt: serverTimestamp()
        });
        setUsers(prev => [...prev, { id: cred.user.uid, name: newName, email: newEmail, role: newRole, status: "active" }]);
        setShowCreate(false);
        setNewName(""); setNewEmail(""); setNewPass(""); setNewRole("platform_support");
      } finally { await deleteApp(secondary); }
    } catch (err: any) { setCreateErr(err.message || "Failed."); }
    finally { setCreating(false); }
  };

  const filtered = users
    .filter(u => roleFilter === "all" || u.role === roleFilter)
    .filter(u => u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()));

  const getRoleColor = (role: string) => ROLE_COLORS[role] || "bg-slate-50 text-slate-600 border-slate-200";
  const getRoleLabel = (role: string) => rolesMeta[role]?.label || role.replace("platform_", "").replace(/_/g, " ");
  const getRolePerms = (role: string) => rolesMeta[role]?.permissions || [];

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-extrabold text-[#1e1b4b] tracking-tight">Platform Team</h1>
            <p className="text-slate-500 font-medium text-sm mt-0.5">Talentum's internal administrators and staff.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {hasPermission("manage_roles") && (
              <Button onClick={() => setShowRolesModal(true)} variant="outline"
                className="h-10 px-4 rounded-xl border-slate-200 text-sm font-bold text-slate-600 flex items-center gap-2">
                <Settings className="w-4 h-4" /> Manage Roles
              </Button>
            )}
            {hasPermission("manage_platform_users") && (
              <Button onClick={() => setShowCreate(true)}
                className="bg-[#5046E5] hover:bg-[#4338CA] text-white font-bold h-10 px-4 rounded-xl shadow-[0_6px_16px_-4px_rgba(79,70,229,0.5)] flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" /> Add Platform User
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search platform users..." value={search} onChange={e => setSearch(e.target.value)}
              className="pl-10 h-10 rounded-xl border-slate-200 bg-white text-sm" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {["all", ...allRoles].map(r => (
              <button key={r} onClick={() => setRoleFilter(r)}
                className={`px-3 py-2 rounded-full text-[12px] font-bold border transition-all whitespace-nowrap capitalize ${roleFilter === r ? "bg-[#1e1b4b] text-white border-[#1e1b4b]" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                {r === "all" ? "All" : (getRoleLabel(r))}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={loadData} className="h-10 px-3 rounded-xl border-slate-200 shrink-0">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Stats */}
        <div className="flex gap-3 flex-wrap">
          {[
            { label: "Total", val: users.length, c: "text-[#1e1b4b]" },
            { label: "Active", val: users.filter(u => u.status !== "disabled").length, c: "text-emerald-600" },
            { label: "Disabled", val: users.filter(u => u.status === "disabled").length, c: "text-amber-600" },
          ].map(({ label, val, c }) => (
            <div key={label} className="bg-white rounded-2xl px-5 py-3 border border-slate-100 shadow-sm flex items-center gap-2">
              <span className={`text-[20px] font-black ${c}`}>{val}</span>
              <span className="text-[12px] font-medium text-slate-400">{label}</span>
            </div>
          ))}
        </div>

        {/* Cards */}
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin" />
            <span className="text-sm font-medium">Loading...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 bg-white rounded-[20px] border border-slate-100 text-center">
            <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No platform users found.</p>
            <p className="text-slate-300 text-sm mt-1">Company users are managed from the Companies page.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(user => {
              const perms = getRolePerms(user.role);
              return (
                <div key={user.id} className="bg-white rounded-[20px] border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.04)] p-5 hover:border-slate-200 transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-indigo-100 flex items-center justify-center shrink-0">
                        <span className="text-indigo-600 font-black text-[16px]">{user.name?.[0]?.toUpperCase() || "?"}</span>
                      </div>
                      <div>
                        <div className="font-bold text-[#1e1b4b] text-[14px] leading-tight">{user.name || "—"}</div>
                        <div className="text-slate-400 text-[11px] truncate max-w-[140px]">{user.email}</div>
                      </div>
                    </div>
                    <span className={`text-[11px] font-black uppercase px-2.5 py-1 rounded-full border capitalize ml-1 shrink-0 ${getRoleColor(user.role)}`}>
                      {user.role?.replace("platform_", "")}
                    </span>
                  </div>

                  {/* Permissions */}
                  {perms.length > 0 && (
                    <div className="mb-4 space-y-1">
                      {perms.slice(0, 3).map(p => {
                        const pm = ALL_PERMISSIONS.find(a => a.id === p);
                        return pm ? (
                          <div key={p} className="flex items-center gap-2 text-[11px] text-slate-400">
                            <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" /> {pm.label}
                          </div>
                        ) : null;
                      })}
                      {perms.length > 3 && (
                        <div className="text-[11px] text-indigo-400 font-bold">+{perms.length - 3} more permissions</div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${user.status === "disabled" ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"}`}>
                      {user.status === "disabled" ? <XCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                      {user.status === "disabled" ? "Disabled" : "Active"}
                    </span>
                    <div className="flex items-center gap-1">
                      {hasPermission("manage_platform_users") && (
                        <>
                          <button onClick={() => { setEditUser(user); setEditName(user.name); setEditRole(user.role); }}
                            className="p-2 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors" title="Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => toggleStatus(user.id, user.status || "active")}
                            className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-all ${user.status === "disabled" ? "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100"}`}>
                            {user.status === "disabled" ? "Enable" : "Disable"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Roles Modal */}
      {showRolesModal && <RolesModal onClose={() => { setShowRolesModal(false); loadData(); }} />}

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl w-full sm:max-w-md p-7 relative animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            <button onClick={() => setEditUser(null)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            <h2 className="text-[20px] font-black text-[#1e1b4b] mb-1">Edit Platform User</h2>
            <p className="text-slate-400 text-sm mb-5">{editUser.email}</p>
            {editErr && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold border border-red-100">{editErr}</div>}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1.5">Full Name</label>
                <div className="relative"><User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="pl-10 h-11 rounded-xl" /></div>
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1.5">Platform Role</label>
                <select value={editRole} onChange={e => setEditRole(e.target.value)}
                  className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none">
                  {allRoles.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
                </select>
              </div>
              {getRolePerms(editRole).length > 0 && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Permissions for this role</p>
                  {getRolePerms(editRole).slice(0, 4).map(p => {
                    const pm = ALL_PERMISSIONS.find(a => a.id === p);
                    return pm ? <div key={p} className="flex items-center gap-2 text-[12px] text-slate-500 py-0.5"><CheckCircle className="w-3 h-3 text-emerald-400" /> {pm.label}</div> : null;
                  })}
                  {getRolePerms(editRole).length > 4 && <p className="text-[11px] text-indigo-400 font-bold mt-1">+{getRolePerms(editRole).length - 4} more</p>}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <Button onClick={() => setEditUser(null)} variant="outline" className="flex-1 h-11 rounded-xl">Cancel</Button>
                <Button onClick={saveEdit} disabled={editSaving} className="flex-1 h-11 rounded-xl bg-[#1e1b4b] hover:bg-[#312e81] text-white font-bold">
                  {editSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl w-full sm:max-w-md p-7 relative animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            <button onClick={() => setShowCreate(false)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            <h2 className="text-[20px] font-black text-[#1e1b4b] mb-1">Add Platform Team Member</h2>
            <p className="text-slate-400 text-sm mb-5">Create an internal Talentum admin with platform-level access.</p>
            {createErr && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold border border-red-100">{createErr}</div>}
            <form onSubmit={createUser} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Full Name</label>
                  <div className="relative"><User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" required className="pl-9 h-10 rounded-xl text-sm" /></div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Role</label>
                  <select value={newRole} onChange={e => setNewRole(e.target.value)}
                    className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none">
                    {allRoles.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
                  </select>
                </div>
              </div>
              <div className="relative"><Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@talentum.com" required className="pl-9 h-10 rounded-xl text-sm" /></div>
              <div className="relative"><Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Min 6 characters" required className="pl-9 h-10 rounded-xl text-sm" /></div>

              {getRolePerms(newRole).length > 0 && (
                <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                  <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-1.5">Permissions included:</p>
                  {getRolePerms(newRole).slice(0, 4).map(p => {
                    const pm = ALL_PERMISSIONS.find(a => a.id === p);
                    return pm ? <div key={p} className="flex items-center gap-2 text-[12px] text-indigo-600 py-0.5"><CheckCircle className="w-3 h-3 text-indigo-400" /> {pm.label}</div> : null;
                  })}
                  {getRolePerms(newRole).length > 4 && <p className="text-[11px] text-indigo-400 font-bold mt-1">+{getRolePerms(newRole).length - 4} more</p>}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button type="button" onClick={() => setShowCreate(false)} variant="outline" className="flex-1 h-10 rounded-xl text-sm">Cancel</Button>
                <Button type="submit" disabled={creating} className="flex-1 h-10 rounded-xl bg-[#1e1b4b] hover:bg-[#312e81] text-white font-bold text-sm">
                  {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
