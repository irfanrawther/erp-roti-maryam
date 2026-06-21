"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin, hashPin, getRoleLabel, getScopeLabel, type UserSession } from "@/lib/auth";
import { homeRoute, ROLE_OPTIONS, SCOPE_OPTIONS } from "@/lib/permissions";
import { formatTanggalWaktu } from "@/lib/utils";
import { Plus, X, Users, ShieldAlert, Pencil } from "lucide-react";

interface User {
  id: string;
  nama: string;
  role: string;
  access_scope: string | null;
  aktif: boolean;
  created_at: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [users,      setUsers]      = useState<User[]>([]);
  const [showForm,   setShowForm]   = useState(false);
  const [editUser,   setEditUser]   = useState<User | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [formError,  setFormError]  = useState("");

  const [form, setForm] = useState({
    nama: "", pin: "", pin_confirm: "", role: "spv", access_scope: "adonan_rendam",
  });

  useEffect(() => {
    const u = getUserSession();
    setCurrentUser(u);
    if (!u || !canAccessAdmin(u.role)) {
      router.replace(homeRoute(u));
      return;
    }
    fetchUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchUsers() {
    const { data } = await supabase
      .from("users")
      .select("id, nama, role, access_scope, aktif, created_at")
      .order("nama");
    if (data) setUsers(data as User[]);
  }

  function openCreate() {
    setEditUser(null);
    setForm({ nama: "", pin: "", pin_confirm: "", role: "spv", access_scope: "adonan_rendam" });
    setFormError("");
    setShowForm(true);
  }

  function openEdit(u: User) {
    setEditUser(u);
    setForm({ nama: u.nama, pin: "", pin_confirm: "", role: u.role, access_scope: u.access_scope ?? "adonan_rendam" });
    setFormError("");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!form.nama.trim()) { setFormError("Nama tidak boleh kosong."); return; }

    const pinRequired = !editUser;
    if (pinRequired || form.pin) {
      if (!/^\d{6}$/.test(form.pin)) {
        setFormError("PIN harus 6 digit angka.");
        return;
      }
      if (form.pin !== form.pin_confirm) {
        setFormError("Konfirmasi PIN tidak cocok.");
        return;
      }
    }

    setLoading(true);

    const scope = form.role === "spv" ? form.access_scope : null;

    if (form.pin) {
      // Hash PIN dan cek unik
      const pinHash = await hashPin(form.pin);
      const { data: clash } = await supabase
        .from("users").select("id, nama").eq("pin_hash", pinHash);
      const conflict = (clash as { id: string; nama: string }[] | null)
        ?.find((c) => c.id !== editUser?.id);
      if (conflict) {
        setLoading(false);
        setFormError(`PIN sudah dipakai oleh ${conflict.nama}. Gunakan PIN lain.`);
        return;
      }

      if (!editUser) {
        // CREATE
        const { error } = await supabase.from("users").insert({
          nama:         form.nama.trim(),
          pin_hash:     pinHash,
          role:         form.role,
          access_scope: scope,
          aktif:        true,
        });
        if (error) {
          setLoading(false);
          setFormError("Gagal menyimpan: " + error.message);
          return;
        }
      } else {
        // EDIT dengan PIN baru
        const { error } = await supabase.from("users").update({
          nama:         form.nama.trim(),
          role:         form.role,
          access_scope: scope,
          pin_hash:     pinHash,
        }).eq("id", editUser.id);
        if (error) {
          setLoading(false);
          setFormError("Gagal menyimpan: " + error.message);
          return;
        }
      }
    } else if (editUser) {
      // EDIT tanpa ubah PIN
      const { error } = await supabase.from("users").update({
        nama:         form.nama.trim(),
        role:         form.role,
        access_scope: scope,
      }).eq("id", editUser.id);
      if (error) {
        setLoading(false);
        setFormError("Gagal menyimpan: " + error.message);
        return;
      }
    }

    setLoading(false);
    setShowForm(false);
    await fetchUsers();
  }

  async function toggleAktif(u: User) {
    await supabase.from("users").update({ aktif: !u.aktif }).eq("id", u.id);
    fetchUsers();
  }

  // Tampil loading saat currentUser belum diload
  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canAccessAdmin(currentUser.role)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <ShieldAlert size={32} className="text-red-400 mx-auto mb-2" />
          <p className="text-gray-500">Akses ditolak</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Kelola User</h1>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Tambah User
        </button>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-amber-500" />
          <span className="font-medium text-gray-700">{users.length} User Terdaftar</span>
        </div>
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id}
              className={`flex items-center justify-between p-3 rounded-xl border border-gray-100 ${!u.aktif ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center font-bold text-amber-700">
                  {u.nama.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-sm text-gray-800">{u.nama}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {getRoleLabel(u.role)}
                    </span>
                    {getScopeLabel(u.access_scope) && (
                      <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                        {getScopeLabel(u.access_scope)}
                      </span>
                    )}
                    {!u.aktif && (
                      <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Nonaktif</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{formatTanggalWaktu(u.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(u)}
                  className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg">
                  <Pencil size={16} />
                </button>
                {u.id !== currentUser.id && (
                  <button onClick={() => toggleAktif(u)}
                    className={`text-xs px-3 py-1 rounded-full font-medium ${
                      u.aktif ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-green-50 text-green-500 hover:bg-green-100"
                    }`}>
                    {u.aktif ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal tambah / edit */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-gray-800">{editUser ? "Edit User" : "Tambah User Baru"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <div>
                <label className="label">Nama Lengkap *</label>
                <input className="input" required value={form.nama}
                  onChange={(e) => setForm({ ...form, nama: e.target.value })}
                  placeholder="Nama user..." />
              </div>
              <div>
                <label className="label">Role *</label>
                <select className="input" value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {form.role === "spv" && (
                <div>
                  <label className="label">Akses SPV *</label>
                  <select className="input" value={form.access_scope}
                    onChange={(e) => setForm({ ...form, access_scope: e.target.value })}>
                    {SCOPE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Menentukan tab Produksi yang bisa diakses SPV ini.</p>
                </div>
              )}

              <div>
                <label className="label">PIN 6 Digit {editUser ? "(kosongkan jika tidak diubah)" : "*"}</label>
                <input
                  type="tel" inputMode="numeric" maxLength={6}
                  className="input tracking-widest text-center text-lg font-bold"
                  required={!editUser}
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
                  placeholder="••••••"
                />
              </div>
              <div>
                <label className="label">Konfirmasi PIN {editUser ? "(isi jika PIN diubah)" : "*"}</label>
                <input
                  type="tel" inputMode="numeric" maxLength={6}
                  className="input tracking-widest text-center text-lg font-bold"
                  required={!editUser || !!form.pin}
                  value={form.pin_confirm}
                  onChange={(e) => setForm({ ...form, pin_confirm: e.target.value.replace(/\D/g, "") })}
                  placeholder="••••••"
                />
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                  {formError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">
                  Batal
                </button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
