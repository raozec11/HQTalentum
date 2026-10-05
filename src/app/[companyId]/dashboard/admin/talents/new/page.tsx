import { Users } from "lucide-react";

export default function AddNewTalentPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Add New Talent</h1>
          <p className="text-sm text-slate-500 mt-1">Register a new talent to your roster.</p>
        </div>
        <div className="bg-[#5046E5]/10 p-3 rounded-xl">
          <Users className="w-6 h-6 text-[#5046E5]" />
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <p className="text-slate-500">Talent registration form will go here.</p>
      </div>
    </div>
  );
}
