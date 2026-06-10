"use client";
import { Menu } from "lucide-react";
import { formatTanggal } from "@/lib/utils";

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
}

export default function Header({ title, onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600"
      >
        <Menu size={20} />
      </button>
      <div className="flex-1">
        <h1 className="font-bold text-gray-800 text-lg">{title}</h1>
        <p className="text-xs text-gray-400">{formatTanggal(new Date())}</p>
      </div>
    </header>
  );
}
