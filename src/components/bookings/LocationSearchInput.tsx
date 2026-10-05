"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search, MapPin, Loader2 } from "lucide-react";

interface LocationSearchInputProps {
  value: string;
  onChange: (city: string, state: string, full: string) => void;
  placeholder?: string;
  className?: string;
  error?: boolean;
}

export function LocationSearchInput({
  value,
  onChange,
  placeholder = "Search US City...",
  className = "",
  error = false
}: LocationSearchInputProps) {
  const [inputValue, setInputValue] = useState(value || "");
  const [predictions, setPredictions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchLocations = async (val: string) => {
    setLoading(true);
    try {
      // Use Nominatim (OpenStreetMap) — free, no API key needed
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&countrycodes=us,pk,gb,ae,ca,au&format=json&limit=6&addressdetails=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const formatted: string[] = [];
        data.forEach((item: any) => {
          const city = item.address?.city || item.address?.town || item.address?.village || item.address?.county || item.name;
          const state = item.address?.state || item.address?.region;
          const country = item.address?.country_code?.toUpperCase();
          if (city) {
            const label = state ? `${city}, ${state}${country && country !== "US" ? `, ${country}` : ""}` : city;
            if (!formatted.includes(label)) formatted.push(label);
          }
        });
        setPredictions(formatted);
      } else {
        setPredictions([]);
      }
    } catch (err) {
      console.error("Location search failed", err);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.length > 2) {
      setIsOpen(true);
      debounceRef.current = setTimeout(() => searchLocations(val), 350);
    } else {
      setIsOpen(false);
      setPredictions([]);
    }

    // Always fire onChange so parent formValues.city/state stay in sync with typed text
    const parts = val.split(",").map(p => p.trim());
    onChange(parts[0] || "", parts[1] || "", val);
  };

  const handleBlur = () => {
    // On blur, fire onChange with whatever is currently typed so city/state are captured
    const parts = inputValue.split(",").map(p => p.trim());
    onChange(parts[0] || "", parts[1] || "", inputValue);
  };

  const handleSelect = (place: string) => {
    setInputValue(place);
    setIsOpen(false);
    const parts = place.split(",").map(p => p.trim());
    const city = parts[0] || "";
    const state = parts[1] || "";
    onChange(city, state, place);
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div className="relative">
        <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${
          inputValue ? "text-indigo-500" : "text-slate-400"
        }`} />
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={`pl-10 h-11 rounded-xl transition-all border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/5 font-medium ${className} ${
            error ? "border-red-300 bg-red-50/10" : "bg-white"
          }`}
        />
        {loading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          </div>
        )}
      </div>

      {isOpen && predictions.length > 0 && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white border border-slate-100 rounded-2xl shadow-xl z-[100] py-2 animate-in fade-in slide-in-from-top-2 duration-200">
          {predictions.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(p)}
              className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-3 group"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-indigo-600">
                <MapPin className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-slate-700 group-hover:text-indigo-900 truncate">
                {p}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
