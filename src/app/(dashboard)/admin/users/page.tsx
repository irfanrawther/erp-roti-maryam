"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getUserSession, canAccessAdmin, hashPin, getRoleLabel } from "@/lib/auth";
import { formatTanggalWaktu } from "@/lib/utils";
import { Plus, X, Users, ShieldAlert, Pencil } from "lucide-react";

interface User {
  id: string;
  nama: string;
  role: string;
  aktif: boolean;
  created_at: string;
}

const ROLES = ["owner", "manager", "spv_pagi", "spv_siang", "staff"];

export default function AdminUsersPage() {
  const router = useRouter();
  const currentUser = getUserSession();
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [pinError, setPinError] = useState("");

  const [form, setForm] = useState({ nama: "", pin: "", pin_confirm: "", role: "staff" });

  useEffect(() => {
    if (!currentUser || !canAccessAdmin(currentUser.role)) {
      router.replace("/dashboard");
      return;
    }
    fetchUsers();
  }, []);

  async function fetchUsers() {
    const { data } = await supabase.from("users").select("id, nama, role, aktif, created_at").order("nama");
    if (data) setUsers(data);
  }

  function openCreate() {
    setEditUser(null);
    setForm({ nama: "", pin: "", pin_confirm: "", role: "staff" });
    setPinError("");
    setShowForm(true);
  }

  function openEdit(u: User) {
    setEditUser(u);
    setForm({ nama: u.nama, pin: "", pin_confirm: "", role: u.role });
    setPinError("");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPinError("");

    if (!editUser) {
      // Create: PIN wajib
      if (form.pin.length !== 6 || !/^\d{6}$/.test(form.pin)) {
        setPinError("PIN harus 6 digit angka");
        return;
      }
      if (form.pin !== form.pin_confirm) {
        setPinError("Konfirmasi PIN tidak cocok");
        return;
      }
    } else if (form.pin) {
      // Edit: PIN opsional, jika diisi harus valid
      if (form.pin.length !== 6 || !/^\d{6}$/.test(form.pin)) {
        setPinError("PIN harus 6 digit angka");
        return;
      }
      if (form.pin !== form.pin_confirm) {
        setPinError("Konfirmasi PIN tidak cocok");
        return;
      }
    }

    setLoading(true);

    if (!editUser) {
      const pinHash = await hashPin(form.pin);
      await supabase.from("users").insert({ nama: form.nama, pin_hash: pinHash, role: form.role });
    } else {
      const updateData: Record<string, string> = { nama: form.nama, role: form.role };
      if (form.pin) updateData.pin_hash = await hashPin(form.pin);
      await supabase.from("users").update(updateData).eq("id", editUser.id);
    }

    setLoading(false);
    setShowForm(false);
    fetchUsers();
  }

  async function toggleAktif(u: User) {
    await supabase.from("users").update({ aktif: !u.aktif }).eq("id", u.id);
    fetchUsers();
  }

  if (!currentUser || !canAccessAdmin(currentUser.role)) {
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
            <div key={u.id} className={`flex items-center justify-between p-3 rounded-xl border ${u.aktif ? "border-gray-100" : "border-gray-100 opacity-50"}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center font-bold text-amber-700">
                  {u.nama.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-sm text-gray-800">{u.nama}</p>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{getRoleLabel(u.role)}</span>
                  <p className="text-xs text-gray-400 mt-0.5">{formatTanggalWaktu(u.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(u)} className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg">
                  <Pencil size={16} />
                </button>
                {u.id !== currentUser.id && (
                  <button
                    onClick={() => toggleAktif(u)}
                    className={`text-xs px-3 py-1 rounded-full font-medium ${u.aktif ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-green-50 text-green-500 hover:bg-green-100"}`}
                  >
                    {u.aktif ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-gray-800">{editUser ? "Edit User" : "Tambah User Baru"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <div>
                <label className="label">Nama Lengkap *</label>
                <input className="input" required value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Nama user..." />
              </div>
              <div>
                <label className="label">Role *</label>
                <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{getRoleLabel(r)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">PIN 6 Digit {editUser && "(kosongkan jika tidak diubah)"}</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={6}
                  pattern="\d{6}"
                  className="input tracking-widest text-center text-lg font-bold"
                  required={!editUser}
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
                  placeholder="••••••"
                />
              </div>
              <div>
                <label className="label">Konfirmasi PIN {editUser && "(isi jika PIN diubah)"}</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={6}
                  className="input tracking-widest text-center text-lg font-bold"
                  required={!editUser || !!form.pin}
                  value={form.pin_confirm}
                  onChange={(e) => setForm({ ...form, pin_confirm: e.target.value.replace(/\D/g, "") })}
                  placeholder="••••••"
                />
              </div>
              {pinError && <p className="text-red-500 text-sm">{pinError}</p>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Batal</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? "Menyimpan..." : "Simpan"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
