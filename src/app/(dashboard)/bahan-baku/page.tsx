"use client";
import BahanBakuView from "@/components/BahanBakuView";

export default function BahanBakuPage() {
  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-800">Bahan Baku</h1>
      <BahanBakuView />
    </div>
  );
}
