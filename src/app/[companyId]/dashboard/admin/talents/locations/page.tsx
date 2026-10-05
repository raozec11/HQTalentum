"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { MapPin, Search, ChevronRight, ChevronLeft, User, Globe, DollarSign, Loader2, Building2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LocationsPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const companyId = (params?.companyId || user?.companyId) as string;

  const [talents, setTalents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Navigation levels: 'states' | 'cities' | 'talents'
  const [viewLevel, setViewLevel] = useState<'states' | 'cities' | 'talents'>('states');
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTalentsAndUsers() {
      if (!companyId) return;
      setLoading(true);
      try {
        const cids = Array.from(new Set([companyId, companyId.toLowerCase(), companyId.toUpperCase()]));
        
        // Fetch all talents for this company
        const [uSnap, tSnap] = await Promise.all([
          getDocs(query(collection(db, "users"), where("companyId", "in", cids), where("role", "==", "talent"))),
          getDocs(query(collection(db, "talents"), where("companyId", "in", cids)))
        ]);

        const tDocs: Record<string, any> = {};
        tSnap.docs.forEach(d => { tDocs[d.id] = d.data(); });
        
        const list = uSnap.docs.map(d => {
          const uD = d.data();
          const tD = tDocs[d.id] || {};
          return {
            ...uD, ...tD, id: d.id,
            displayName: tD.displayName || tD.name || uD.name || uD.displayName || uD.email || "Unknown Talent",
            profileImage: tD.photoUrl || tD.profileImage || uD.profileImage || null,
            locations: tD.locations || []
          };
        });

        setTalents(list);
      } catch (err) {
        console.error("Failed to fetch talents and users for locations:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchTalentsAndUsers();
  }, [companyId]);

  // Build State -> City -> Talents location tree
  const locationTree = useMemo(() => {
    const tree: Record<string, Record<string, any[]>> = {};

    talents.forEach(talent => {
      const locs = talent.locations || [];
      locs.forEach((loc: string) => {
        if (!loc) return;
        
        let city = "General";
        let state = "Other";

        const commaIndex = loc.indexOf(",");
        if (commaIndex !== -1) {
          city = loc.substring(0, commaIndex).trim();
          state = loc.substring(commaIndex + 1).trim();
        } else {
          state = loc.trim();
        }

        if (!tree[state]) {
          tree[state] = {};
        }
        if (!tree[state][city]) {
          tree[state][city] = [];
        }
        
        // Avoid duplicate talents in same city list
        if (!tree[state][city].some(t => t.id === talent.id)) {
          tree[state][city].push(talent);
        }
      });
    });

    return tree;
  }, [talents]);

  // 1. States level data
  const statesList = useMemo(() => {
    return Object.entries(locationTree).map(([stateName, citiesMap]) => {
      let count = 0;
      Object.values(citiesMap).forEach(list => {
        count += list.length;
      });
      return {
        name: stateName,
        citiesCount: Object.keys(citiesMap).length,
        talentsCount: count
      };
    }).sort((a, b) => b.talentsCount - a.talentsCount || a.name.localeCompare(b.name));
  }, [locationTree]);

  // 2. Cities level data (for currently selected state)
  const citiesList = useMemo(() => {
    if (!selectedState || !locationTree[selectedState]) return [];
    return Object.entries(locationTree[selectedState]).map(([cityName, list]) => {
      return {
        name: cityName,
        talentsCount: list.length,
        talents: list
      };
    }).sort((a, b) => b.talentsCount - a.talentsCount || a.name.localeCompare(b.name));
  }, [locationTree, selectedState]);

  // 3. Talents level list (for selected state + city)
  const talentsList = useMemo(() => {
    if (!selectedState || !selectedCity || !locationTree[selectedState] || !locationTree[selectedState][selectedCity]) {
      return [];
    }
    return locationTree[selectedState][selectedCity];
  }, [locationTree, selectedState, selectedCity]);

  // Filtered views based on search query
  const filteredStates = useMemo(() => {
    if (!search.trim()) return statesList;
    return statesList.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));
  }, [statesList, search]);

  const filteredCities = useMemo(() => {
    if (!search.trim()) return citiesList;
    return citiesList.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  }, [citiesList, search]);

  const filteredTalents = useMemo(() => {
    if (!search.trim()) return talentsList;
    const s = search.toLowerCase();
    return talentsList.filter(t => 
      t.displayName.toLowerCase().includes(s) || 
      t.email.toLowerCase().includes(s) ||
      t.categories?.some((c: string) => c.toLowerCase().includes(s))
    );
  }, [talentsList, search]);

  // Navigation handlers
  const handleSelectState = (stateName: string) => {
    setSelectedState(stateName);
    setViewLevel('cities');
    setSearch(""); // clear search on drill-down
  };

  const handleSelectCity = (cityName: string) => {
    setSelectedCity(cityName);
    setViewLevel('talents');
    setSearch(""); // clear search on drill-down
  };

  const handleBackToStates = () => {
    setViewLevel('states');
    setSelectedState(null);
    setSelectedCity(null);
    setSearch("");
  };

  const handleBackToCities = () => {
    setViewLevel('cities');
    setSelectedCity(null);
    setSearch("");
  };

  const getInitials = (name: string) => {
    if (!name) return "TL";
    return name
      .split(' ')
      .map(n => n.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const totalMappedTalents = talents.filter(t => t.locations && t.locations.length > 0).length;
  const unlocatedTalents = talents.filter(t => !t.locations || t.locations.length === 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 px-4 sm:px-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="bg-teal-50 border border-teal-100 p-2.5 rounded-2xl shadow-sm">
            <MapPin className="w-5 h-5 text-teal-600" />
          </div>
          <h1 className="text-[28px] font-black text-slate-955 tracking-tight leading-none">Roster Locations</h1>
        </div>
        <p className="text-sm text-slate-500 ml-12 font-medium">Browse regions where your talents are available for bookings</p>
      </div>

      {/* Navigation Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-50 border border-slate-200/60 px-4 py-2.5 rounded-2xl w-fit shadow-sm">
        <button 
          onClick={handleBackToStates}
          className={cn("hover:text-teal-600 transition-colors", viewLevel === 'states' ? "text-teal-600 font-extrabold" : "")}
        >
          States
        </button>
        {selectedState && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <button 
              onClick={handleBackToCities}
              className={cn("hover:text-teal-600 transition-colors", viewLevel === 'cities' ? "text-teal-600 font-extrabold" : "")}
            >
              {selectedState}
            </button>
          </>
        )}
        {selectedCity && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="text-teal-600 font-extrabold">{selectedCity}</span>
          </>
        )}
      </div>

      {/* Main Container Card */}
      <div className="bg-white border border-slate-200/60 rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] overflow-hidden">
        {/* Search Header */}
        <div className="px-6 py-4 border-b border-slate-100/80 bg-slate-50/50 flex items-center justify-between gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={
                viewLevel === 'states' ? "Search states..." :
                viewLevel === 'cities' ? "Search cities..." :
                "Search talent by name, email..."
              }
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 h-10 rounded-xl border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-all bg-white"
            />
          </div>
          <div className="flex items-center gap-3">
            {viewLevel !== 'states' && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={viewLevel === 'talents' ? handleBackToCities : handleBackToStates}
                className="rounded-xl border border-slate-200 text-xs font-bold text-slate-500 bg-white hover:bg-slate-50 h-9"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            )}
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
              {viewLevel === 'states' ? `${filteredStates.length} States` :
               viewLevel === 'cities' ? `${filteredCities.length} Cities` :
               `${filteredTalents.length} Talents`} Found
            </span>
          </div>
        </div>

        {/* Content list block */}
        <div className="p-6">
          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Records...</p>
            </div>
          ) : viewLevel === 'states' ? (
            // ── LEVEL 1: STATES VIEW ──
            filteredStates.length === 0 ? (
              <div className="py-14 text-center">
                <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-bold text-sm">No states found matching your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {filteredStates.map(state => (
                  <div
                    key={state.name}
                    onClick={() => handleSelectState(state.name)}
                    className="p-5 bg-white border border-slate-200/70 hover:border-teal-500 hover:shadow-md rounded-[20px] transition-all cursor-pointer group flex flex-col justify-between h-32"
                  >
                    <div className="flex items-start justify-between">
                      <div className="bg-teal-50 border border-teal-100 p-2.5 rounded-xl group-hover:scale-110 transition-transform">
                        <MapPin className="w-4 h-4 text-teal-600" />
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-teal-600 transition-colors" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-[15px] group-hover:text-teal-700 transition-colors truncate">{state.name}</h4>
                      <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-1 flex items-center gap-2">
                        <span>{state.citiesCount} {state.citiesCount === 1 ? "City" : "Cities"}</span>
                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                        <span className="text-teal-600 font-black">{state.talentsCount} {state.talentsCount === 1 ? "Talent" : "Talents"}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : viewLevel === 'cities' ? (
            // ── LEVEL 2: CITIES VIEW ──
            filteredCities.length === 0 ? (
              <div className="py-14 text-center">
                <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-bold text-sm">No cities found matching your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {filteredCities.map(city => (
                  <div
                    key={city.name}
                    onClick={() => handleSelectCity(city.name)}
                    className="p-5 bg-white border border-slate-200/70 hover:border-teal-500 hover:shadow-md rounded-[20px] transition-all cursor-pointer group flex flex-col justify-between h-32"
                  >
                    <div className="flex items-start justify-between">
                      <div className="bg-teal-50 border border-teal-100 p-2.5 rounded-xl group-hover:scale-110 transition-transform">
                        <Building2 className="w-4 h-4 text-teal-600" />
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-teal-600 transition-colors" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-[15px] group-hover:text-teal-700 transition-colors truncate">{city.name}</h4>
                      <p className="text-[11px] text-teal-600 font-black uppercase tracking-wider mt-1">
                        {city.talentsCount} {city.talentsCount === 1 ? "Talent" : "Talents"} Available
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            // ── LEVEL 3: TALENTS COMPACT LIST VIEW ──
            filteredTalents.length === 0 ? (
              <div className="py-14 text-center">
                <User className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-bold text-sm">No talents configured for this city</p>
              </div>
            ) : (
              <div className="space-y-2 max-w-2xl mx-auto">
                {filteredTalents.slice(0, 10).map(talent => (
                  <div 
                    key={talent.id} 
                    className="flex items-center justify-between p-3.5 bg-white border border-slate-100 hover:border-slate-200 rounded-xl transition-all shadow-sm"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {talent.profileImage ? (
                        <img src={talent.profileImage} alt={talent.displayName} className="w-8.5 h-8.5 rounded-full object-cover border border-slate-100 shadow-sm shrink-0" />
                      ) : (
                        <div className="w-8.5 h-8.5 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100 shadow-sm shrink-0 font-black text-xs">
                          {getInitials(talent.displayName)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="font-extrabold text-slate-800 text-[14.5px] truncate block leading-tight">{talent.displayName}</span>
                        <span className="text-[11px] text-slate-400 font-semibold truncate block mt-0.5 leading-none">
                          {talent.categories && talent.categories.length > 0 
                            ? talent.categories.join(', ') 
                            : 'No categories'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3.5 shrink-0">
                      {talent.rate && (
                        <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                          ${talent.rate}/hr
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/${companyId}/talent/${talent.username || talent.id}`, "_blank")}
                        className="h-7 px-3 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}
                
                {filteredTalents.length > 10 && (
                  <button
                    onClick={() => router.push(`/${companyId}/dashboard/admin/talents?search=${encodeURIComponent(selectedCity + ", " + selectedState)}`)}
                    className="w-full py-2.5 mt-2.5 text-xs font-black text-indigo-600 bg-indigo-50/30 hover:bg-indigo-50 border border-indigo-100/60 rounded-xl flex items-center justify-center gap-1.5 transition-all hover:scale-[1.01]"
                  >
                    View All {filteredTalents.length} Talents in Roster <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* Unlocated Talents Banner */}
      {!loading && unlocatedTalents.length > 0 && viewLevel === 'states' && (
        <div className="bg-amber-50 border border-amber-200/80 rounded-[24px] p-5 flex items-start gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200/50">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-amber-950 text-sm uppercase tracking-wider mb-1">Unlocated Talents ({unlocatedTalents.length})</h4>
            <p className="text-[13px] text-amber-800 font-semibold leading-relaxed">
              The following talents haven't configured any work locations on their profiles yet:
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {unlocatedTalents.map(talent => (
                <span 
                  key={talent.id} 
                  onClick={() => window.open(`/${companyId}/talent/${talent.username || talent.id}`, "_blank")}
                  className="bg-white border border-amber-200/60 hover:border-amber-300 text-[11px] font-bold text-amber-900 px-3 py-1.5 rounded-xl cursor-pointer shadow-sm hover:scale-105 transition-all flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  {talent.displayName}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
