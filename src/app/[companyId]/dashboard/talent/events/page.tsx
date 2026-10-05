"use client";

import { useState } from "react";
import { Calendar, Filter, Clock, MapPin, ChevronRight, Search } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function TalentEventsPage() {
  const [status, setStatus] = useState("upcoming");

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12 px-4 sm:px-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight">Gigs & Events</h1>
          <p className="text-slate-500 mt-2 font-medium text-base">Track your upcoming, completed, and cancelled bookings.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
             <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
             <Input placeholder="Search gigs..." className="pl-10 h-11 rounded-2xl border-slate-200 w-full md:w-64 bg-white shadow-sm" />
          </div>
          <select 
            value={status} 
            onChange={(e) => setStatus(e.target.value)}
            className="w-[180px] h-11 px-4 rounded-2xl bg-white border-slate-200 shadow-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all appearance-none cursor-pointer"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1rem' }}
          >
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <Card className="rounded-[32px] border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden min-h-[500px] flex flex-col">
        <CardContent className="flex-1 flex flex-col items-center justify-center p-20 text-center">
            <div className="w-24 h-24 bg-indigo-50 rounded-[32px] flex items-center justify-center mb-8 border border-indigo-100">
              <Calendar className="w-12 h-12 text-indigo-400" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 capitalize">No {status} gigs found</h3>
            <p className="text-slate-500 max-w-sm mx-auto mt-4 font-medium text-base leading-relaxed">
              {status === 'upcoming' 
                ? "You're all caught up! When a client books you, the event details will appear here." 
                : `No ${status} bookings to show at this time.`
              }
            </p>
        </CardContent>
      </Card>
    </div>
  );
}
