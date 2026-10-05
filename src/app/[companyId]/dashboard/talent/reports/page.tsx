"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useParams } from "next/navigation";
import { 
  BarChart3, Loader2, DollarSign, Calendar, Users, Briefcase, 
  MapPin, CheckCircle, AlertCircle, TrendingUp, Filter, 
  ChevronDown, Search, Download, Printer, ArrowUpDown, 
  ChevronRight, X, Clock, Coins, Info, RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface BookingRecord {
  id: string;
  clientName: string;
  clientEmail: string;
  clientGender?: string;
  eventDate: string;
  eventTime?: string;
  duration?: number;
  address?: string;
  city: string;
  state: string;
  jobType: string;
  payRate: number;
  tipAmount: number;
  tipStatus: string;
  tipPaymentMethod?: string;
  status: string;
  paymentStatus?: string;
  paymentMethod?: string;
  applicants: string[];
  talentId: string;
  selectedTalentId: string;
  selectedTalentIds?: string[];
  assignmentHistory?: any[];
  createdAt: string;
}

export default function TalentReportsPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allData, setAllData] = useState<BookingRecord[]>([]);
  
  // Filter States
  const [dateFilter, setDateFilter] = useState("All");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [jobFilter, setJobFilter] = useState("All");
  const [locationFilter, setLocationFilter] = useState("All");
  const [genderFilter, setGenderFilter] = useState("All");
  const [clientFilter, setClientFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Sorting & Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<string>("eventDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Expandable Row State
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // tab state for distribution cards
  const [distTab, setDistTab] = useState<"service" | "client" | "location">("service");

  // Interactive Chart Tooltip Index
  const [activeTooltipIndex, setActiveTooltipIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!user || !companyId) return;
    loadReportData();
  }, [user, companyId]);

  const loadReportData = async (isRef = false) => {
    if (!user) return;
    if (isRef) setRefreshing(true);
    else setLoading(true);
    
    try {
      const ids = Array.from(new Set([companyId, companyId.toLowerCase(), companyId.toUpperCase()]));
      
      // We run parallel queries to construct a complete footprint of bookings relevant to the talent
      const querySet = ids.flatMap(id => [
        query(collection(db, "bookings"), where("companyId", "==", id), where("applicants", "array-contains", user.uid)),
        query(collection(db, "bookings"), where("companyId", "==", id), where("selectedTalentId", "==", user.uid)),
        query(collection(db, "bookings"), where("companyId", "==", id), where("selectedTalentIds", "array-contains", user.uid)),
        query(collection(db, "bookings"), where("companyId", "==", id), where("talentId", "==", user.uid)),
      ]);

      const snaps = await Promise.all(querySet.map(q => getDocs(q)));
      
      const recordMap = new Map<string, BookingRecord>();
      snaps.forEach(snap => {
        snap.docs.forEach(doc => {
          const data = doc.data();
          recordMap.set(doc.id, {
            id: doc.id,
            clientName: data.clientName || data.__clientName || "Unknown Client",
            clientEmail: data.clientEmail || data.__email || data.__clientEmail || "",
            clientGender: data.gender || data.__gender || "any",
            eventDate: data.eventDate || "",
            eventTime: data.eventTime || "",
            duration: parseFloat(data.duration || 0),
            address: data.address || data.__address || "",
            city: data.city || data.__city || "",
            state: data.state || data.__state || "",
            jobType: data.jobType || data.__jobType || "Unspecified",
            payRate: parseFloat(data.payRate || 0),
            tipAmount: parseFloat(data.tipAmount || 0),
            tipStatus: data.tipStatus || "",
            tipPaymentMethod: data.tipPaymentMethod || "",
            status: data.status || "Pending",
            paymentStatus: data.paymentStatus || "",
            paymentMethod: data.paymentMethod || "",
            applicants: data.applicants || [],
            talentId: data.talentId || "",
            selectedTalentId: data.selectedTalentId || "",
            selectedTalentIds: data.selectedTalentIds || [],
            assignmentHistory: data.assignmentHistory || [],
            createdAt: data.createdAt || ""
          });
        });
      });

      const records = Array.from(recordMap.values());
      records.sort((a, b) => new Date(b.eventDate || b.createdAt).getTime() - new Date(a.eventDate || a.createdAt).getTime());
      
      setAllData(records);
    } catch (err) {
      console.error("Failed to load report data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Extract unique options for filter dropdowns dynamically
  const jobOptions = useMemo(() => {
    return Array.from(new Set(allData.map(r => r.jobType).filter(Boolean))).sort();
  }, [allData]);

  const locationOptions = useMemo(() => {
    return Array.from(new Set(allData.map(r => [r.city, r.state].filter(Boolean).join(", ")).filter(Boolean))).sort();
  }, [allData]);

  const clientOptions = useMemo(() => {
    return Array.from(new Set(allData.map(r => r.clientName).filter(Boolean))).sort();
  }, [allData]);

  // Helper: check if a date is within custom or preset range
  const isDateInRange = (dateStr: string, filterType: string, customStart: string, customEnd: string) => {
    if (!dateStr) return false;
    const eventDate = new Date(dateStr);
    if (isNaN(eventDate.getTime())) return false;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (filterType) {
      case "All":
        return true;
      case "Today":
        return eventDate >= today && eventDate < new Date(today.getTime() + 24 * 60 * 60 * 1000);
      case "Yesterday": {
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        return eventDate >= yesterday && eventDate < today;
      }
      case "This Week": {
        const startOfWeek = new Date(today.getTime() - today.getDay() * 24 * 60 * 60 * 1000);
        return eventDate >= startOfWeek;
      }
      case "Last Week": {
        const startOfLastWeek = new Date(today.getTime() - (today.getDay() + 7) * 24 * 60 * 60 * 1000);
        const endOfLastWeek = new Date(today.getTime() - today.getDay() * 24 * 60 * 60 * 1000);
        return eventDate >= startOfLastWeek && eventDate < endOfLastWeek;
      }
      case "This Month":
        return eventDate.getFullYear() === now.getFullYear() && eventDate.getMonth() === now.getMonth();
      case "Last Month": {
        const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        return eventDate.getFullYear() === prevYear && eventDate.getMonth() === prevMonth;
      }
      case "Last 30 Days":
        return now.getTime() - eventDate.getTime() <= 30 * 24 * 60 * 60 * 1000;
      case "Last 90 Days":
        return now.getTime() - eventDate.getTime() <= 90 * 24 * 60 * 60 * 1000;
      case "This Year":
        return eventDate.getFullYear() === now.getFullYear();
      case "Custom Range": {
        if (!customStart && !customEnd) return true;
        let startMatch = true;
        let endMatch = true;
        if (customStart) {
          const startDate = new Date(customStart);
          const cmpStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          const cmpEvent = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
          startMatch = cmpEvent >= cmpStart;
        }
        if (customEnd) {
          const endDate = new Date(customEnd);
          const cmpEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          const cmpEvent = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
          endMatch = cmpEvent <= cmpEnd;
        }
        return startMatch && endMatch;
      }
      default:
        return true;
    }
  };

  // Helper: map a booking record to the current user's specific context status
  const getTalentBookingStatus = (record: BookingRecord) => {
    const isConfirmedPerformer = record.talentId === user?.uid;
    const isCandidate = record.applicants?.includes(user?.uid || "");
    const isSelected = record.selectedTalentId === user?.uid || record.selectedTalentIds?.includes(user?.uid || "");
    const hasDeclined = record.assignmentHistory?.some((h: any) => h.type === 'declined' && h.talentId === user?.uid);
    const hasBeenUnassigned = record.assignmentHistory?.some((h: any) => h.type === 'unassigned' && h.talentId === user?.uid);
    
    if (isConfirmedPerformer) {
      if (record.status === "Completed") return "Completed";
      if (record.status === "Confirmed" || record.status === "Assigned") return "Confirmed";
      return record.status; 
    }
    
    if (hasDeclined) return "Declined";
    if (hasBeenUnassigned) return "Unassigned";
    
    if (isSelected) {
      return "Selected";
    }
    
    if (isCandidate) {
      if (record.talentId && record.talentId !== user?.uid) return "Rejected";
      if (record.status === "Cancelled") return "Cancelled";
      return "Applied";
    }
    
    return record.status;
  };

  // Perform filtering over fetched bookings dataset
  const filteredData = useMemo(() => {
    return allData.filter(record => {
      // 1. Text Search Query
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchId = record.id.toLowerCase().includes(q);
        const matchClient = record.clientName.toLowerCase().includes(q);
        const matchJob = record.jobType.toLowerCase().includes(q);
        const matchLoc = `${record.city} ${record.state}`.toLowerCase().includes(q);
        if (!matchId && !matchClient && !matchJob && !matchLoc) {
          return false;
        }
      }

      // 2. Date Range Filter
      const dateToCheck = record.eventDate || record.createdAt;
      if (!isDateInRange(dateToCheck, dateFilter, customStartDate, customEndDate)) {
        return false;
      }

      // 3. Job Type Filter
      if (jobFilter !== "All" && record.jobType !== jobFilter) {
        return false;
      }

      // 4. Location Filter
      const fullLoc = [record.city, record.state].filter(Boolean).join(", ");
      if (locationFilter !== "All" && fullLoc !== locationFilter) {
        return false;
      }

      // 5. Client Requested Gender
      if (genderFilter !== "All") {
        const gPref = (record.clientGender || "any").toLowerCase();
        if (gPref !== genderFilter.toLowerCase()) {
          return false;
        }
      }

      // 6. Client Filter
      if (clientFilter !== "All" && record.clientName !== clientFilter) {
        return false;
      }

      // 7. Booking status (specific to the talent)
      if (statusFilter !== "All") {
        const tStatus = getTalentBookingStatus(record);
        if (tStatus.toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
      }

      // 8. Payout Status Filter
      if (paymentFilter !== "All") {
        const isConfirmed = record.talentId === user?.uid;
        const isPaid = isConfirmed && record.status === "Completed";
        const isPending = isConfirmed && (record.status === "Confirmed" || record.status === "Assigned");
        
        if (paymentFilter === "Paid" && !isPaid) return false;
        if (paymentFilter === "Pending" && !isPending) return false;
        if (paymentFilter === "Unpaid" && (isPaid || isPending)) return false;
      }

      return true;
    });
  }, [allData, searchQuery, dateFilter, customStartDate, customEndDate, jobFilter, locationFilter, genderFilter, clientFilter, statusFilter, paymentFilter, user]);

  // Aggregate Calculations
  const statsCalculations = useMemo(() => {
    // Financial aggregates
    const baseGigEarnings = filteredData
      .filter(r => r.talentId === user?.uid && r.status === "Completed")
      .reduce((sum, r) => sum + r.payRate, 0);

    const tipsEarnings = filteredData
      .filter(r => r.talentId === user?.uid && r.tipStatus === "Paid")
      .reduce((sum, r) => sum + r.tipAmount, 0);

    const totalEarnings = baseGigEarnings + tipsEarnings;

    const pendingPayouts = filteredData
      .filter(r => r.talentId === user?.uid && (r.status === "Assigned" || r.status === "Confirmed"))
      .reduce((sum, r) => sum + r.payRate, 0);

    // Funnel aggregates
    const totalApplied = filteredData.filter(r => r.applicants?.includes(user?.uid || "")).length;
    
    const totalSelected = filteredData.filter(r => {
      const isApplicant = r.applicants?.includes(user?.uid || "");
      const isSel = r.selectedTalentId === user?.uid || r.selectedTalentIds?.includes(user?.uid || "");
      const isFinalized = r.talentId === user?.uid;
      return isApplicant && (isSel || isFinalized);
    }).length;

    const totalConfirmed = filteredData.filter(r => r.talentId === user?.uid && (r.status === "Confirmed" || r.status === "Assigned" || r.status === "Completed")).length;
    const totalCompleted = filteredData.filter(r => r.talentId === user?.uid && r.status === "Completed").length;

    const totalRejected = filteredData.filter(r => {
      const isApplicant = r.applicants?.includes(user?.uid || "");
      const isAssignedToOther = r.talentId && r.talentId !== user?.uid;
      const isClosedLost = r.status === "Cancelled" || (r.status === "Completed" && r.talentId !== user?.uid);
      return isApplicant && (isAssignedToOther || isClosedLost);
    }).length;

    const totalDeclined = filteredData.filter(r => 
      r.assignmentHistory?.some((h: any) => h.type === 'declined' && h.talentId === user?.uid)
    ).length;

    const successRate = totalApplied > 0 ? (totalConfirmed / totalApplied) * 100 : 0;
    const avgEarningsPerCompleted = totalCompleted > 0 ? baseGigEarnings / totalCompleted : 0;

    return {
      baseGigEarnings,
      tipsEarnings,
      totalEarnings,
      pendingPayouts,
      totalApplied,
      totalSelected,
      totalConfirmed,
      totalCompleted,
      totalRejected,
      totalDeclined,
      successRate,
      avgEarningsPerCompleted
    };
  }, [filteredData, user]);

  // Dynamic distribution calculations (Services, Clients, Locations)
  const distributions = useMemo(() => {
    const serviceMap: Record<string, number> = {};
    const clientMap: Record<string, number> = {};
    const locationMap: Record<string, number> = {};

    filteredData.forEach(r => {
      if (r.talentId === user?.uid && r.status === "Completed") {
        const earnings = r.payRate + (r.tipStatus === "Paid" ? r.tipAmount : 0);
        
        const service = r.jobType || "Unspecified";
        serviceMap[service] = (serviceMap[service] || 0) + earnings;

        const client = r.clientName || "Unknown Client";
        clientMap[client] = (clientMap[client] || 0) + earnings;

        const loc = [r.city, r.state].filter(Boolean).join(", ") || "Unspecified Location";
        locationMap[loc] = (locationMap[loc] || 0) + earnings;
      }
    });

    const sortMapToSortedArray = (map: Record<string, number>) => {
      return Object.entries(map)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
    };

    return {
      service: sortMapToSortedArray(serviceMap),
      client: sortMapToSortedArray(clientMap),
      location: sortMapToSortedArray(locationMap),
    };
  }, [filteredData, user]);

  // Construct Monthly historical stats for Area Chart
  const monthlyChartData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const monthlyMap: Record<string, { base: number; tips: number; total: number }> = {};
    const monthsList: string[] = [];

    // Last 6 months list
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${months[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
      monthlyMap[key] = { base: 0, tips: 0, total: 0 };
      monthsList.push(key);
    }

    filteredData.forEach(r => {
      if (r.talentId === user?.uid && r.status === "Completed" && r.eventDate) {
        const ed = new Date(r.eventDate);
        const key = `${months[ed.getMonth()]} ${ed.getFullYear().toString().slice(-2)}`;
        if (monthlyMap[key] !== undefined) {
          const base = r.payRate || 0;
          const tips = r.tipStatus === "Paid" ? (r.tipAmount || 0) : 0;
          monthlyMap[key].base += base;
          monthlyMap[key].tips += tips;
          monthlyMap[key].total += base + tips;
        }
      }
    });

    return monthsList.map(month => ({
      month,
      base: monthlyMap[month].base,
      tips: monthlyMap[month].tips,
      total: monthlyMap[month].total
    }));
  }, [filteredData, user]);

  // SVG Area Chart Calculations
  const chartHeight = 160;
  const chartWidth = 520;
  const paddingLeft = 50;
  const paddingTop = 20;

  const maxChartVal = useMemo(() => {
    const peak = Math.max(...monthlyChartData.map(d => d.total), 100);
    return Math.ceil(peak / 100) * 100; // Round to nearest 100
  }, [monthlyChartData]);

  const svgCoordinates = useMemo(() => {
    const pointsTotal: { x: number; y: number }[] = [];
    const pointsBase: { x: number; y: number }[] = [];

    monthlyChartData.forEach((d, i) => {
      const x = paddingLeft + i * (chartWidth / (monthlyChartData.length - 1));
      const yTotal = paddingTop + chartHeight - (d.total / maxChartVal) * chartHeight;
      const yBase = paddingTop + chartHeight - (d.base / maxChartVal) * chartHeight;

      pointsTotal.push({ x, y: yTotal });
      pointsBase.push({ x, y: yBase });
    });

    const getLinePath = (points: { x: number; y: number }[]) => {
      if (points.length === 0) return "";
      return `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ");
    };

    const getAreaPath = (points: { x: number; y: number }[]) => {
      if (points.length === 0) return "";
      const baseLineY = paddingTop + chartHeight;
      return `M ${points[0].x} ${baseLineY} ` + points.map(p => `L ${p.x} ${p.y}`).join(" ") + ` L ${points[points.length - 1].x} ${baseLineY} Z`;
    };

    return {
      lineTotal: getLinePath(pointsTotal),
      areaTotal: getAreaPath(pointsTotal),
      lineBase: getLinePath(pointsBase),
      areaBase: getAreaPath(pointsBase),
      pointsTotal,
      pointsBase
    };
  }, [monthlyChartData, maxChartVal]);

  // Ledger sorting logic
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      let aVal: any = a[sortField as keyof BookingRecord] || "";
      let bVal: any = b[sortField as keyof BookingRecord] || "";

      if (sortField === "eventDate") {
        aVal = new Date(a.eventDate || a.createdAt).getTime();
        bVal = new Date(b.eventDate || b.createdAt).getTime();
      } else if (sortField === "earning") {
        aVal = a.talentId === user?.uid ? a.payRate + (a.tipStatus === "Paid" ? a.tipAmount : 0) : 0;
        bVal = b.talentId === user?.uid ? b.payRate + (b.tipStatus === "Paid" ? b.tipAmount : 0) : 0;
      } else if (sortField === "status") {
        aVal = getTalentBookingStatus(a);
        bVal = getTalentBookingStatus(b);
      } else if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortField, sortOrder, user]);

  // Pagination bounds
  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  // Reset pagination if total items count shrinks below current range
  useEffect(() => {
    if (currentPage > 1 && currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages));
    }
  }, [totalPages, currentPage]);

  // Reset currentPage to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFilter, customStartDate, customEndDate, jobFilter, locationFilter, genderFilter, clientFilter, statusFilter, paymentFilter, searchQuery]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setDateFilter("All");
    setJobFilter("All");
    setLocationFilter("All");
    setGenderFilter("All");
    setClientFilter("All");
    setStatusFilter("All");
    setPaymentFilter("All");
    setSearchQuery("");
    setCustomStartDate("");
    setCustomEndDate("");
  };

  const handleExportCSV = () => {
    const headers = [
      "Booking ID", 
      "Event Date", 
      "Event Time",
      "Duration (Hrs)",
      "Client Name", 
      "Client Email", 
      "Service/Job Type", 
      "Location", 
      "Base Pay Rate", 
      "Tip Amount", 
      "Tip Status", 
      "Booking Status", 
      "Payment Status", 
      "Payment Method"
    ];
    
    const rows = filteredData.map(r => [
      r.id,
      r.eventDate,
      r.eventTime || "TBD",
      r.duration || 0,
      r.clientName,
      r.clientEmail,
      r.jobType,
      [r.city, r.state].filter(Boolean).join(", ") || "Unspecified",
      r.payRate,
      r.tipAmount,
      r.tipStatus || "Unpaid",
      getTalentBookingStatus(r),
      r.paymentStatus || "N/A",
      r.paymentMethod || "N/A"
    ]);
    
    const csvString = [
      headers.join(","),
      ...rows.map(row => row.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(","))
    ].join("\r\n");
    
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `talent_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Assembling Analytics Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-16 px-4 sm:px-6 lg:px-8 animate-in fade-in duration-500 print-container">
      
      {/* Custom Global CSS rules for Print Mode */}
      <style>{`
        @media print {
          aside, nav, header, footer, .print-hide, button, select, input, .no-print {
            display: none !important;
          }
          body, html, main, .print-container {
            background: white !important;
            color: black !important;
            position: static !important;
            overflow: visible !important;
            height: auto !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-card {
            border: 1px solid #cbd5e1 !important;
            box-shadow: none !important;
            border-radius: 8px !important;
            margin-bottom: 20px !important;
            page-break-inside: avoid !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          tr {
            page-break-inside: avoid !important;
          }
          th, td {
            border-bottom: 1px solid #cbd5e1 !important;
            padding: 10px 12px !important;
            font-size: 10pt !important;
            color: black !important;
          }
          th {
            background-color: #f1f5f9 !important;
            font-weight: bold !important;
          }
        }
      `}</style>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200/60 pb-6 print-header">
        <div>
           <div className="flex items-center gap-3 mb-2 print-hide">
             <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-100">
                <BarChart3 className="w-5 h-5 text-white" />
             </div>
             <p className="text-xs font-black text-indigo-600 uppercase tracking-widest leading-none mt-1">Analytics Studio</p>
           </div>
           <h1 className="text-[32px] md:text-[40px] font-black text-slate-900 tracking-tight leading-none">Advance Reports</h1>
           <p className="text-slate-500 mt-2 font-medium print-hide">Perform detailed diagnostic analysis over bookings, earnings, and operations.</p>
        </div>
        <div className="flex items-center gap-3 print-hide">
          <button 
            onClick={() => loadReportData(true)} 
            disabled={refreshing}
            className="p-3 bg-slate-100 border border-slate-200/50 hover:bg-slate-200/70 text-slate-700 rounded-2xl flex items-center justify-center transition-all disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-indigo-600" : ""}`} />
          </button>
          
          <button 
            onClick={handleExportCSV}
            className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-slate-950/15 hover:shadow-slate-950/20 active:scale-98 transition-all"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>

          <button 
            onClick={() => window.print()}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/15 hover:shadow-indigo-600/25 active:scale-98 transition-all"
          >
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Advanced Filter Box */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-100/40 p-6 space-y-6 print-hide">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-600" />
            <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Reports Query Filters</h3>
          </div>
          {(dateFilter !== "All" || jobFilter !== "All" || locationFilter !== "All" || genderFilter !== "All" || clientFilter !== "All" || statusFilter !== "All" || paymentFilter !== "All" || searchQuery !== "") && (
            <button 
              onClick={handleClearFilters}
              className="text-xs text-rose-500 font-extrabold flex items-center gap-1 hover:text-rose-600 active:scale-95 transition-all"
            >
              <X className="w-3.5 h-3.5" /> Clear All Filters
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Date Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Date Preset</label>
            <div className="relative">
              <select 
                value={dateFilter} 
                onChange={(e) => setDateFilter(e.target.value)} 
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="All">All Time</option>
                <option value="Today">Today</option>
                <option value="Yesterday">Yesterday</option>
                <option value="This Week">This Week</option>
                <option value="Last Week">Last Week</option>
                <option value="This Month">This Month</option>
                <option value="Last Month">Last Month</option>
                <option value="Last 30 Days">Last 30 Days</option>
                <option value="Last 90 Days">Last 90 Days</option>
                <option value="This Year">This Year</option>
                <option value="Custom Range">Custom Range...</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-3.5 pointer-events-none" />
            </div>
          </div>

          {/* Job Type Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Service Type</label>
            <div className="relative">
              <select 
                value={jobFilter} 
                onChange={(e) => setJobFilter(e.target.value)} 
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="All">All Services</option>
                {jobOptions.map(job => <option key={job} value={job}>{job}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-3.5 pointer-events-none" />
            </div>
          </div>

          {/* Location Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Location / Venue</label>
            <div className="relative">
              <select 
                value={locationFilter} 
                onChange={(e) => setLocationFilter(e.target.value)} 
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="All">All Locations</option>
                {locationOptions.map(loc => <option key={loc} value={loc}>{loc}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-3.5 pointer-events-none" />
            </div>
          </div>

          {/* Client Requested Gender Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Req. Gender</label>
            <div className="relative">
              <select 
                value={genderFilter} 
                onChange={(e) => setGenderFilter(e.target.value)} 
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="All">All Prefs</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Any">Any / Not Specified</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-3.5 pointer-events-none" />
            </div>
          </div>

          {/* Client Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Client Name</label>
            <div className="relative">
              <select 
                value={clientFilter} 
                onChange={(e) => setClientFilter(e.target.value)} 
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="All">All Clients</option>
                {clientOptions.map(client => <option key={client} value={client}>{client}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-3.5 pointer-events-none" />
            </div>
          </div>

          {/* Booking Status Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Booking Status</label>
            <div className="relative">
              <select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)} 
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="All">All Statuses</option>
                <option value="Applied">Applied</option>
                <option value="Selected">Selected</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Completed">Completed</option>
                <option value="Rejected">Rejected</option>
                <option value="Declined">Declined</option>
                <option value="Cancelled">Cancelled</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-3.5 pointer-events-none" />
            </div>
          </div>

          {/* Payout Status Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Payout Status</label>
            <div className="relative">
              <select 
                value={paymentFilter} 
                onChange={(e) => setPaymentFilter(e.target.value)} 
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="All">All Payouts</option>
                <option value="Paid">Paid Earnings</option>
                <option value="Pending">Pending Payouts</option>
                <option value="Unpaid">Unpaid / Inactive</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-3.5 pointer-events-none" />
            </div>
          </div>

          {/* Custom Date Inputs (Conditional) */}
          {dateFilter === "Custom Range" && (
            <div className="flex gap-2 items-center sm:col-span-2 lg:col-span-2 animate-in slide-in-from-top-2 duration-300">
              <div className="flex-1 space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Start Date</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => { setCustomStartDate(e.target.value); setCurrentPage(1); }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">End Date</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => { setCustomEndDate(e.target.value); setCurrentPage(1); }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Financial & Funnel Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Earnings Card */}
        <Card className="rounded-[32px] border-slate-100 shadow-xl shadow-slate-200/50 bg-[#1e1b4b] text-white print-card">
          <CardContent className="p-8">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-white/10 p-3 rounded-2xl"><DollarSign className="w-6 h-6 text-indigo-200" /></div>
              <span className="text-indigo-200/60 text-[10px] font-black uppercase tracking-widest">Lifetime Earnings</span>
            </div>
            <h2 className="text-3xl font-black">${statsCalculations.totalEarnings.toFixed(2)}</h2>
            <div className="flex justify-between text-[11px] text-indigo-200/50 mt-4 border-t border-indigo-200/10 pt-3 font-semibold">
              <span>Gigs: ${statsCalculations.baseGigEarnings.toFixed(0)}</span>
              <span>Tips: ${statsCalculations.tipsEarnings.toFixed(0)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Pending Payouts Card */}
        <Card className="rounded-[32px] border-slate-100 shadow-xl shadow-slate-200/50 bg-white print-card">
          <CardContent className="p-8">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600"><Clock className="w-6 h-6" /></div>
              <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Pending Payouts</span>
            </div>
            <h2 className="text-3xl font-black text-slate-900">${statsCalculations.pendingPayouts.toFixed(2)}</h2>
            <div className="flex justify-between text-[11px] text-slate-400 mt-4 border-t border-slate-100 pt-3 font-semibold">
              <span>Avg/Gig: ${statsCalculations.avgEarningsPerCompleted.toFixed(0)}</span>
              <span>Pending Gigs: {filteredData.filter(r => r.talentId === user?.uid && (r.status === "Assigned" || r.status === "Confirmed")).length}</span>
            </div>
          </CardContent>
        </Card>

        {/* Application Funnel Statistics Card */}
        <Card className="rounded-[32px] border-slate-100 shadow-xl shadow-slate-200/50 bg-white print-card">
          <CardContent className="p-8">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-amber-50 p-3 rounded-2xl text-amber-600"><Briefcase className="w-6 h-6" /></div>
              <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Applications Funnel</span>
            </div>
            <h2 className="text-3xl font-black text-slate-900">{statsCalculations.totalApplied} Gigs</h2>
            <div className="flex justify-between text-[11px] text-slate-400 mt-4 border-t border-slate-100 pt-3 font-semibold">
              <span className="text-indigo-600">Selected: {statsCalculations.totalSelected}</span>
              <span className="text-emerald-600">Confirmed: {statsCalculations.totalConfirmed}</span>
            </div>
          </CardContent>
        </Card>

        {/* Acceptance / Selection Success Rate */}
        <Card className="rounded-[32px] border-slate-100 shadow-xl shadow-slate-200/50 bg-white print-card">
          <CardContent className="p-8">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600"><CheckCircle className="w-6 h-6" /></div>
              <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Selection Rate</span>
            </div>
            <h2 className="text-3xl font-black text-slate-900">{statsCalculations.successRate.toFixed(1)}%</h2>
            <div className="flex justify-between items-center gap-1 mt-4 border-t border-slate-100 pt-3">
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(statsCalculations.successRate, 100)}%` }} />
              </div>
              <span className="text-[10px] font-black text-slate-400 ml-2">Rate</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 no-print">
        
        {/* Earnings Over Time Area Chart */}
        <Card className="lg:col-span-2 rounded-[32px] border-slate-200/60 shadow-xl shadow-slate-100/40 bg-white relative overflow-hidden">
          <CardHeader className="p-8 border-b border-slate-100">
            <CardTitle className="font-black text-slate-900">Earning Performance Chart</CardTitle>
            <CardDescription className="font-medium text-slate-400">Monthly breakdown of base rate pay vs additional tips received (completed gigs).</CardDescription>
          </CardHeader>
          
          <CardContent className="p-8 h-[270px] relative flex flex-col justify-end">
            
            {/* SVG Chart Container */}
            <div className="w-full h-[190px] relative">
              <svg 
                viewBox={`0 0 600 ${chartHeight + paddingTop}`} 
                width="100%" 
                height="100%" 
                className="overflow-visible"
              >
                {/* Definitions for gradients */}
                <defs>
                  <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Gridlines */}
                {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
                  const y = paddingTop + chartHeight - p * chartHeight;
                  const labelVal = p * maxChartVal;
                  return (
                    <g key={`grid-${idx}`}>
                      <line 
                        x1={paddingLeft} 
                        y1={y} 
                        x2={paddingLeft + chartWidth} 
                        y2={y} 
                        stroke="#f1f5f9" 
                        strokeDasharray="4 4" 
                      />
                      <text 
                        x={paddingLeft - 8} 
                        y={y + 4} 
                        textAnchor="end" 
                        className="text-[9px] font-black fill-slate-400 font-mono"
                      >
                        ${labelVal.toFixed(0)}
                      </text>
                    </g>
                  );
                })}

                {/* X Axis labels */}
                {monthlyChartData.map((d, i) => {
                  const x = paddingLeft + i * (chartWidth / (monthlyChartData.length - 1));
                  return (
                    <text 
                      key={`label-x-${i}`}
                      x={x} 
                      y={paddingTop + chartHeight + 16} 
                      textAnchor="middle" 
                      className="text-[9px] font-black fill-slate-400 uppercase tracking-wider"
                    >
                      {d.month.split(" ")[0]}
                    </text>
                  );
                })}

                {/* Fill Area curves */}
                {svgCoordinates.areaTotal && (
                  <path 
                    d={svgCoordinates.areaTotal} 
                    fill="url(#totalGrad)" 
                  />
                )}
                {svgCoordinates.areaBase && (
                  <path 
                    d={svgCoordinates.areaBase} 
                    fill="url(#baseGrad)" 
                  />
                )}

                {/* Stroke Line curves */}
                {svgCoordinates.lineTotal && (
                  <path 
                    d={svgCoordinates.lineTotal} 
                    fill="none" 
                    stroke="#4f46e5" 
                    strokeWidth="3.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                  />
                )}
                {svgCoordinates.lineBase && (
                  <path 
                    d={svgCoordinates.lineBase} 
                    fill="none" 
                    stroke="#06b6d4" 
                    strokeWidth="2" 
                    strokeDasharray="3 2"
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                  />
                )}

                {/* Interactive hovered column indicator line */}
                {activeTooltipIndex !== null && (
                  <line 
                    x1={svgCoordinates.pointsTotal[activeTooltipIndex].x} 
                    y1={paddingTop} 
                    x2={svgCoordinates.pointsTotal[activeTooltipIndex].x} 
                    y2={paddingTop + chartHeight} 
                    stroke="#cbd5e1" 
                    strokeWidth="1.5" 
                    strokeDasharray="2 2"
                  />
                )}

                {/* Curve Points Circles */}
                {svgCoordinates.pointsTotal.map((pt, i) => (
                  <circle 
                    key={`dot-tot-${i}`}
                    cx={pt.x} 
                    cy={pt.y} 
                    r={activeTooltipIndex === i ? 6 : 4} 
                    fill="#4f46e5" 
                    stroke="#ffffff" 
                    strokeWidth="2.5"
                    className="transition-all duration-150"
                  />
                ))}

                {/* Hidden interactive vertical columns overlay (captures mouse hovered indexes) */}
                {monthlyChartData.map((d, idx) => {
                  const x = paddingLeft + idx * (chartWidth / (monthlyChartData.length - 1));
                  const colWidth = chartWidth / (monthlyChartData.length - 1);
                  return (
                    <rect
                      key={`overlay-${idx}`}
                      x={idx === 0 ? paddingLeft : x - colWidth / 2}
                      y={paddingTop}
                      width={idx === 0 || idx === monthlyChartData.length - 1 ? colWidth / 2 : colWidth}
                      height={chartHeight}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setActiveTooltipIndex(idx)}
                      onMouseLeave={() => setActiveTooltipIndex(null)}
                    />
                  );
                })}
              </svg>
            </div>

            {/* Custom Floating Tooltip */}
            {activeTooltipIndex !== null && (
              <div 
                className="absolute bg-slate-950 text-white p-3 rounded-xl shadow-2xl text-xs flex flex-col gap-1 border border-slate-800 pointer-events-none transition-all duration-150 z-20"
                style={{ 
                  left: `${50 + activeTooltipIndex * (chartWidth / (monthlyChartData.length - 1)) - 70}px`,
                  top: `${(150 - (monthlyChartData[activeTooltipIndex].total / maxChartVal) * chartHeight) + 10}px`
                }}
              >
                <p className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px] mb-1">
                  {monthlyChartData[activeTooltipIndex].month}
                </p>
                <div className="flex justify-between gap-6">
                  <span className="text-slate-400 font-medium">Base Pay:</span>
                  <span className="font-bold text-indigo-400">${monthlyChartData[activeTooltipIndex].base.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-slate-400 font-medium">Tips:</span>
                  <span className="font-bold text-amber-400">${monthlyChartData[activeTooltipIndex].tips.toFixed(2)}</span>
                </div>
                <div className="border-t border-slate-800 mt-1 pt-1 flex justify-between gap-6">
                  <span className="font-bold text-slate-200">Total:</span>
                  <span className="font-extrabold text-emerald-400">${monthlyChartData[activeTooltipIndex].total.toFixed(2)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Funnel & Dynamic Distributions Multi-Tab Panel */}
        <Card className="lg:col-span-1 rounded-[32px] border-slate-200/60 shadow-xl shadow-slate-100/40 bg-white">
          <CardHeader className="p-8 border-b border-slate-100">
            <div className="flex justify-between items-center">
              <CardTitle className="font-black text-slate-900">Revenue Breakdown</CardTitle>
              
              {/* Tab Selector */}
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                {(["service", "client", "location"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setDistTab(tab)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                      distTab === tab ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            <CardDescription className="font-medium text-slate-400">Top earning sources by base rate + tips.</CardDescription>
          </CardHeader>
          
          <CardContent className="p-8 space-y-5">
            {distributions[distTab].length === 0 ? (
              <div className="py-12 text-center">
                <Info className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">No completed revenue found</p>
                <p className="text-slate-400 text-[10.5px] mt-1">Distributions calculate completed gig earnings only.</p>
              </div>
            ) : (
              distributions[distTab].map((item, idx) => {
                const maxVal = distributions[distTab][0]?.value || 100;
                const pct = (item.value / maxVal) * 100;
                return (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-slate-800">
                      <span className="truncate max-w-[200px] flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-mono">#{idx+1}</span>
                        {item.name}
                      </span>
                      <span>${item.value.toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-500 ${
                          idx === 0 ? "bg-indigo-600" : idx === 1 ? "bg-indigo-500" : idx === 2 ? "bg-cyan-500" : "bg-slate-400"
                        }`}
                        style={{ width: `${pct}%` }} 
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Funnel conversion overview list */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 no-print">
         <div className="bg-slate-50 border border-slate-200/50 p-6 rounded-2xl flex flex-col justify-between">
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stage 1: Applied</p>
              <h4 className="text-2xl font-black text-slate-800 mt-2">{statsCalculations.totalApplied} Bookings</h4>
           </div>
           <p className="text-[10.5px] text-slate-500 font-medium mt-4">Total expressions of interest submitted.</p>
         </div>

         <div className="bg-slate-50 border border-slate-200/50 p-6 rounded-2xl flex flex-col justify-between relative">
           <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-white border border-slate-200 p-1 rounded-full text-slate-400 z-10 hidden md:block">
              <ChevronRight className="w-4 h-4" />
           </div>
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stage 2: Selected</p>
              <h4 className="text-2xl font-black text-indigo-600 mt-2">{statsCalculations.totalSelected} Bookings</h4>
           </div>
           <div className="mt-4 flex items-center justify-between text-[10.5px]">
              <span className="text-indigo-600 font-bold">Select Rate: {(statsCalculations.totalApplied > 0 ? (statsCalculations.totalSelected / statsCalculations.totalApplied) * 100 : 0).toFixed(0)}%</span>
              <span className="text-slate-400 font-medium">({statsCalculations.totalApplied - statsCalculations.totalSelected} drop-off)</span>
           </div>
         </div>

         <div className="bg-slate-50 border border-slate-200/50 p-6 rounded-2xl flex flex-col justify-between relative">
           <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-white border border-slate-200 p-1 rounded-full text-slate-400 z-10 hidden md:block">
              <ChevronRight className="w-4 h-4" />
           </div>
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stage 3: Confirmed</p>
              <h4 className="text-2xl font-black text-emerald-600 mt-2">{statsCalculations.totalConfirmed} Bookings</h4>
           </div>
           <div className="mt-4 flex items-center justify-between text-[10.5px]">
              <span className="text-emerald-600 font-bold">Confirm Rate: {(statsCalculations.totalApplied > 0 ? (statsCalculations.totalConfirmed / statsCalculations.totalApplied) * 100 : 0).toFixed(0)}%</span>
              <span className="text-slate-400 font-medium">({statsCalculations.totalSelected - statsCalculations.totalConfirmed} drop-off)</span>
           </div>
         </div>

         <div className="bg-slate-50 border border-slate-200/50 p-6 rounded-2xl flex flex-col justify-between relative">
           <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-white border border-slate-200 p-1 rounded-full text-slate-400 z-10 hidden md:block">
              <ChevronRight className="w-4 h-4" />
           </div>
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stage 4: Completed</p>
              <h4 className="text-2xl font-black text-cyan-600 mt-2">{statsCalculations.totalCompleted} Bookings</h4>
           </div>
           <div className="mt-4 flex items-center justify-between text-[10.5px]">
              <span className="text-cyan-600 font-bold">Completion: {(statsCalculations.totalConfirmed > 0 ? (statsCalculations.totalCompleted / statsCalculations.totalConfirmed) * 100 : 0).toFixed(0)}%</span>
              <span className="text-slate-400 font-medium">({statsCalculations.totalConfirmed - statsCalculations.totalCompleted} active)</span>
           </div>
         </div>
      </div>

      {/* Transaction Filter Ledger Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-3xl border border-slate-100 shadow-sm print-hide">
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 w-full md:max-w-md">
          <Search className="w-5 h-5 text-indigo-400" />
          <input 
            type="text" 
            placeholder="Search ledger by Client, Job type, Location, or ID..." 
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="border-none outline-none text-xs font-bold text-slate-800 bg-transparent placeholder:text-slate-400 w-full"
          />
        </div>

        {/* Ledger Page size dropdown */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rows:</span>
          <select 
            value={itemsPerPage} 
            onChange={(e) => { setItemsPerPage(parseInt(e.target.value)); setCurrentPage(1); }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-extrabold text-slate-700 outline-none cursor-pointer"
          >
            <option value="10">10 Rows</option>
            <option value="25">25 Rows</option>
            <option value="50">50 Rows</option>
          </select>
        </div>
      </div>

      {/* Detailed Ledger Table */}
      <Card className="rounded-[32px] border-slate-200/60 shadow-xl shadow-slate-100/40 overflow-hidden bg-white print-card">
        <CardHeader className="p-8 border-b border-slate-100 bg-[#fbfcfd]">
          <CardTitle className="font-black text-slate-900">Reports Ledger</CardTitle>
          <CardDescription className="font-medium text-slate-400">Detailed logs matching filters. Expand rows to view timelines & metadata.</CardDescription>
        </CardHeader>
        
        {paginatedData.length === 0 ? (
          <CardContent className="p-20 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <Calendar className="w-7 h-7 text-slate-300" />
            </div>
            <h3 className="text-md font-bold text-slate-800">No records match filters</h3>
            <p className="text-slate-400 text-xs mt-1">Try modifying your dropdown metrics or search query above.</p>
          </CardContent>
        ) : (
          <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider print-hide"></th>
                  
                  <th 
                    onClick={() => handleSort("eventDate")} 
                    className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      Date & ID
                      <ArrowUpDown className={`w-3 h-3 ${sortField === "eventDate" ? "text-indigo-600" : "text-slate-300"}`} />
                    </div>
                  </th>
                  
                  <th 
                    onClick={() => handleSort("clientName")} 
                    className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      Client
                      <ArrowUpDown className={`w-3 h-3 ${sortField === "clientName" ? "text-indigo-600" : "text-slate-300"}`} />
                    </div>
                  </th>
                  
                  <th 
                    onClick={() => handleSort("jobType")} 
                    className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      Service
                      <ArrowUpDown className={`w-3 h-3 ${sortField === "jobType" ? "text-indigo-600" : "text-slate-300"}`} />
                    </div>
                  </th>
                  
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider">Location</th>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider">Pref. Gender</th>
                  
                  <th 
                    onClick={() => handleSort("earning")} 
                    className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      Earnings
                      <ArrowUpDown className={`w-3 h-3 ${sortField === "earning" ? "text-indigo-600" : "text-slate-300"}`} />
                    </div>
                  </th>
                  
                  <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider">Tips</th>
                  
                  <th 
                    onClick={() => handleSort("status")} 
                    className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      Status
                      <ArrowUpDown className={`w-3 h-3 ${sortField === "status" ? "text-indigo-600" : "text-slate-300"}`} />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {paginatedData.map((item) => {
                  let dateStr = "TBD";
                  try {
                    if (item.eventDate) {
                      dateStr = new Date(item.eventDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      });
                    }
                  } catch (e) {}

                  const isConfirmedPerformer = item.talentId === user?.uid;
                  const isExpanded = expandedRow === item.id;
                  const talentStatus = getTalentBookingStatus(item);

                  return (
                    <Fragment key={item.id}>
                      {/* Standard Table Row */}
                      <tr 
                        key={item.id} 
                        onClick={() => setExpandedRow(isExpanded ? null : item.id)}
                        className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                      >
                        <td className="py-5 px-6 print-hide">
                          <ChevronRight className={`w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-transform ${isExpanded ? "rotate-90 text-indigo-600" : ""}`} />
                        </td>
                        <td className="py-5 px-6">
                          <div className="flex flex-col gap-1">
                            <span className="text-[12px] font-bold font-mono text-slate-400">ID:{item.id.slice(0, 8).toUpperCase()}</span>
                            <span className="text-xs font-semibold text-slate-700">{dateStr}</span>
                          </div>
                        </td>
                        <td className="py-5 px-6">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900">{item.clientName}</span>
                            {item.clientEmail && <span className="text-[11px] font-medium text-slate-400 truncate max-w-[150px]">{item.clientEmail}</span>}
                          </div>
                        </td>
                        <td className="py-5 px-6">
                          <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200/40">{item.jobType}</span>
                        </td>
                        <td className="py-5 px-6">
                          <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" /> 
                            {[item.city, item.state].filter(Boolean).join(", ") || "Unspecified"}
                          </span>
                        </td>
                        <td className="py-5 px-6">
                          <span className="text-xs font-bold text-slate-600 capitalize">{item.clientGender || "Any"}</span>
                        </td>
                        <td className="py-5 px-6">
                          {isConfirmedPerformer ? (
                            <span className="text-sm font-black text-emerald-600">${item.payRate.toFixed(2)}</span>
                          ) : (
                            <span className="text-sm font-bold text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-5 px-6">
                          {isConfirmedPerformer && item.tipAmount > 0 && item.tipStatus === "Paid" ? (
                            <span className="text-sm font-black text-amber-600 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded-md">+${item.tipAmount.toFixed(2)}</span>
                          ) : (
                            <span className="text-sm font-bold text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-5 px-6">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm ${
                            talentStatus === 'Completed' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                            talentStatus === 'Confirmed' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' :
                            talentStatus === 'Selected' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                            talentStatus === 'Applied' ? 'bg-cyan-50 text-cyan-600 border-cyan-200' :
                            talentStatus === 'Declined' || talentStatus === 'Rejected' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                            'bg-amber-50 text-amber-600 border-amber-200'
                          }`}>
                            {talentStatus}
                          </span>
                        </td>
                      </tr>

                      {/* Expandable Meta details and Event timelines */}
                      {isExpanded && (
                        <tr className="bg-slate-50/40 print-hide">
                          <td colSpan={9} className="p-6 border-b border-slate-200/50">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">
                              
                              {/* Left details panel */}
                              <div className="space-y-3">
                                <h5 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider border-b pb-1.5">Booking Metadata</h5>
                                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-semibold text-slate-600">
                                  <span className="text-slate-400">Date/Time:</span>
                                  <span>{dateStr} @ {item.eventTime || "TBD"}</span>
                                  <span className="text-slate-400">Duration:</span>
                                  <span>{item.duration ? `${item.duration} Hours` : "TBD"}</span>
                                  <span className="text-slate-400">Exact Venue Address:</span>
                                  <span>{item.address || "Not specified"}</span>
                                  <span className="text-slate-400">Client Payout Status:</span>
                                  <span className="capitalize">{item.paymentStatus || "Awaiting Payout"}</span>
                                  <span className="text-slate-400">Method of Payout:</span>
                                  <span>{item.paymentMethod || "Credit Card / Bank"}</span>
                                </div>
                              </div>

                              {/* Center Tips & Details panel */}
                              <div className="space-y-3">
                                <h5 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider border-b pb-1.5">Payout Diagnoses</h5>
                                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-semibold text-slate-600">
                                  <span className="text-slate-400">Base Gig Rate:</span>
                                  <span>${item.payRate.toFixed(2)}</span>
                                  <span className="text-slate-400">Tip Revenue:</span>
                                  <span>${item.tipAmount.toFixed(2)}</span>
                                  <span className="text-slate-400">Tip Payout Status:</span>
                                  <span>{item.tipStatus || "No tip logged"}</span>
                                  {item.tipPaymentMethod && (
                                    <>
                                      <span className="text-slate-400">Tip Payout Method:</span>
                                      <span>{item.tipPaymentMethod}</span>
                                    </>
                                  )}
                                  <span className="text-slate-400">Your selection context:</span>
                                  <span>
                                    {item.talentId === user?.uid ? "Confirmed Performer" : 
                                     item.selectedTalentId === user?.uid || item.selectedTalentIds?.includes(user?.uid || "") ? "Selected Candidate" : 
                                     "Applied Applicant"}
                                  </span>
                                </div>
                              </div>

                              {/* Right timeline panel */}
                              <div className="space-y-3">
                                <h5 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider border-b pb-1.5">Assignment History</h5>
                                {item.assignmentHistory && item.assignmentHistory.length > 0 ? (
                                  <div className="relative border-l border-indigo-100 pl-4 space-y-3.5 pt-1">
                                    {item.assignmentHistory.map((h: any, hIdx: number) => {
                                      let actionText = "";
                                      let actionColor = "bg-slate-400";
                                      
                                      switch (h.type) {
                                        case 'applied':
                                          actionText = `Applied for the gig`;
                                          actionColor = "bg-cyan-500";
                                          break;
                                        case 'selected':
                                          actionText = `Selected by Client`;
                                          actionColor = "bg-emerald-500";
                                          break;
                                        case 'confirmed':
                                          actionText = `Confirmed booking contract`;
                                          actionColor = "bg-indigo-600";
                                          break;
                                        case 'declined':
                                          actionText = `Declined selected offer`;
                                          actionColor = "bg-rose-500";
                                          break;
                                        case 'unassigned':
                                          actionText = `Unassigned from gig`;
                                          actionColor = "bg-amber-500";
                                          break;
                                        case 'completed':
                                          actionText = `Marked booking completed`;
                                          actionColor = "bg-slate-600";
                                          break;
                                        default:
                                          actionText = h.message || `${h.type} transition`;
                                      }

                                      let displayTime = "";
                                      if (h.at) {
                                        try {
                                          displayTime = new Date(h.at).toLocaleDateString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit"
                                          });
                                        } catch (e) {}
                                      }

                                      return (
                                        <div key={hIdx} className="relative text-xs">
                                          <div className={`absolute -left-[21.5px] top-0.5 w-2.5 h-2.5 rounded-full border border-white ${actionColor}`} />
                                          <p className="font-bold text-slate-800 leading-none">{actionText}</p>
                                          {displayTime && <span className="text-[10px] text-slate-400 font-semibold">{displayTime}</span>}
                                          {h.talentName && h.talentId !== user?.uid && (
                                            <span className="block text-[9.5px] text-slate-400 font-semibold italic mt-0.5">Affected Talent: {h.talentName}</span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="flex gap-2 items-center text-xs font-semibold text-slate-400 py-3">
                                    <Info className="w-4 h-4 shrink-0" />
                                    <span>No assignment history logs logged.</span>
                                  </div>
                                )}
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="md:hidden divide-y divide-slate-100">
            {paginatedData.map((item) => {
              let dateStr = "TBD";
              try {
                if (item.eventDate) {
                  dateStr = new Date(item.eventDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  });
                }
              } catch (e) {}

              const isConfirmedPerformer = item.talentId === user?.uid;
              const talentStatus = getTalentBookingStatus(item);

              return (
                <div key={item.id} className="p-6 space-y-4">
                  {/* Header: ID + Status */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold font-mono text-slate-400">
                      ID:{item.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-sm ${
                      talentStatus === 'Completed' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                      talentStatus === 'Confirmed' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' :
                      talentStatus === 'Selected' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                      talentStatus === 'Applied' ? 'bg-cyan-50 text-cyan-600 border-cyan-200' :
                      talentStatus === 'Declined' || talentStatus === 'Rejected' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                      'bg-amber-50 text-amber-600 border-amber-200'
                    }`}>
                      {talentStatus}
                    </span>
                  </div>

                  {/* Client & Service */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{item.clientName}</h4>
                      {item.clientEmail && <p className="text-[11px] font-medium text-slate-400">{item.clientEmail}</p>}
                    </div>
                    <span className="text-[11px] font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/40">{item.jobType}</span>
                  </div>

                  {/* Metadata: Date, Location, Gender */}
                  <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-50 pt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 w-16">Date:</span>
                      <span className="font-semibold">{dateStr}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 w-16">Location:</span>
                      <span className="font-semibold flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        {[item.city, item.state].filter(Boolean).join(", ") || "Unspecified"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 w-16">Gender:</span>
                      <span className="font-semibold capitalize">{item.clientGender || "Any"}</span>
                    </div>
                  </div>

                  {/* Finance Payout details */}
                  <div className="grid grid-cols-2 gap-4 border-t border-slate-50 pt-3">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Base Gig Pay</p>
                      <span className="text-sm font-black text-emerald-600">
                        {isConfirmedPerformer ? `$${item.payRate.toFixed(2)}` : "—"}
                      </span>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Tips</p>
                      <span className="text-sm font-black text-amber-600">
                        {isConfirmedPerformer && item.tipAmount > 0 && item.tipStatus === "Paid" ? `+$${item.tipAmount.toFixed(2)}` : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Context and Method details */}
                  <div className="bg-slate-50 rounded-xl p-3 text-[11px] font-semibold text-slate-500 space-y-1">
                    <div className="flex justify-between">
                      <span>Selection Context:</span>
                      <span className="text-slate-800">
                        {item.talentId === user?.uid ? "Confirmed Performer" : 
                         item.selectedTalentId === user?.uid || item.selectedTalentIds?.includes(user?.uid || "") ? "Selected Candidate" : 
                         "Applied Applicant"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Payout Status:</span>
                      <span className="text-slate-800 capitalize">{item.paymentStatus || "Awaiting Payout"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}

        {/* Dynamic Pagination & Info Footer */}
        {sortedData.length > 0 && (
          <div className="p-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#fbfcfd] print-hide">
            <span className="text-xs font-semibold text-slate-400">
              Showing {Math.min((currentPage - 1) * itemsPerPage + 1, sortedData.length)} to {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length} records
            </span>
            
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-xs font-bold text-slate-600 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-40"
                >
                  Previous
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      currentPage === page 
                        ? "bg-slate-900 text-white" 
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-xs font-bold text-slate-600 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
      
    </div>
  );
}
