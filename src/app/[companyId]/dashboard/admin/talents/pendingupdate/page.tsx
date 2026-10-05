"use client";

import { useState, useEffect, use } from "react";
import { createPortal } from "react-dom";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, getDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { Loader2, CheckCircle, XCircle, ArrowRight, User, Search, Clock, FileWarning, Check, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showSuccess, showError, showInfo, confirmAction } from "@/lib/alerts";
import { sendNotification } from "@/lib/notifications";

export default function PendingUpdatesPage(props: { params: Promise<{ companyId: string }> }) {
  const params = use(props.params);
  const { user } = useAuth();
  const companyId = params.companyId;

  const [pendingUpdates, setPendingUpdates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [fieldProcessingId, setFieldProcessingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedUpdate, setSelectedUpdate] = useState<any | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    async function loadPending() {
      if (!companyId) return;
      const q = query(
        collection(db, "pending_profile_updates"),
        where("companyId", "==", companyId),
        where("status", "==", "pending")
      );
      const snap = await getDocs(q);
      const updates = await Promise.all(snap.docs.map(async (d) => {
        const talentId = d.data().talentId;
        const [liveDoc, userDoc] = await Promise.all([
          getDoc(doc(db, "talents", talentId)),
          getDoc(doc(db, "users", talentId))
        ]);
        
        const mergedLiveData = {
          ...(userDoc.exists() ? userDoc.data() : {}),
          ...(liveDoc.exists() ? liveDoc.data() : {})
        };

        return {
          id: d.id,
          ...d.data(),
          liveData: mergedLiveData
        };
      }));
      setPendingUpdates(updates);
      setLoading(false);
    }
    loadPending();
  }, [companyId]);

  const recordActivity = async (talentId: string, actionStr: string) => {
    const actRef = doc(collection(db, "talent_activity_logs"));
    await setDoc(actRef, {
      talentId,
      companyId,
      actionStr,
      changedByRawUid: user?.uid,
      changedByRole: "admin",
      timestamp: new Date().toISOString()
    });
  };

  const calculateChanges = (liveData: any, newData: any) => {
    const live = liveData || {};
    const updated = newData || {};
    const allKeys = Array.from(new Set([...Object.keys(live), ...Object.keys(updated)]));
    const excluded = ['updatedAt', 'requestedAt', 'companyId', 'userId', 'talentId', 'numericId', 'status', 'email', 'password'];
    const changes = [];
    
    for (const key of allKeys) {
       if (excluded.includes(key)) continue;
       const oldVal = live[key];
       const newVal = updated[key];
       
       if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          // Rule 1: Hide "Empty/Blank" Requested Changes as per user request to clean UI
          const isNewEmpty = newVal === undefined || newVal === null || newVal === "" || (Array.isArray(newVal) && newVal.length === 0);
          if (isNewEmpty) continue;

          // Rule 2: Skip deep nested objects that look like [object Object] like Working Hours configs for now
          if (typeof newVal === 'object' && newVal !== null && !Array.isArray(newVal)) continue;

          changes.push({ key, oldVal, newVal });
       }
    }
    return changes;
  };

  const handleApprove = async (update: any) => {
    setProcessingId(update.id);
    try {
      // Merge all new data that hasn't been individually rejected, skipping excluded ones just to be safe
      const changes = calculateChanges(update.liveData, update.newData);
      const payload: any = {
        companyId: companyId
      };
      
      const liveDocExists = update.liveData && Object.keys(update.liveData).length > 0;
      if (!liveDocExists) {
        payload.userId = update.talentId;
        payload.rating = 5;
        payload.numericId = Math.floor(100000 + Math.random() * 900000).toString();
        payload.createdAt = new Date().toISOString();
        payload.status = "active";
      }

      changes.forEach(c => { payload[c.key] = c.newVal; });

      await setDoc(doc(db, "talents", update.talentId), payload, { merge: true });
      await deleteDoc(doc(db, "pending_profile_updates", update.id));
      await recordActivity(update.talentId, "Administrator comprehensively approved pending profile edits");
      await sendNotification({
        userId: update.talentId,
        companyId: companyId,
        title: "Profile Updates Approved",
        message: "Your pending profile edits have been reviewed and approved.",
        type: "success",
        link: `/${companyId}/dashboard/talent/profile`
      });
      
      setPendingUpdates(prev => prev.filter(u => u.id !== update.id));
      setSelectedUpdate(null);
      showSuccess("Update approved successfully.");
    } catch (e) {
      console.error(e);
      showError("Failed to approve update.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (update: any) => {
    setProcessingId(update.id);
    try {
      await deleteDoc(doc(db, "pending_profile_updates", update.id));
      await recordActivity(update.talentId, "Administrator comprehensively rejected proposed profile edits");
      await sendNotification({
        userId: update.talentId,
        companyId: companyId,
        title: "Profile Updates Rejected",
        message: "Your pending profile edits have been reviewed and rejected.",
        type: "alert"
      });
      setPendingUpdates(prev => prev.filter(u => u.id !== update.id));
      setSelectedUpdate(null);
      showSuccess("Update rejected successfully.");
    } catch (e) {
      console.error(e);
      showError("Failed to reject update.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleBulkApproveAll = async () => {
    if (!(await confirmAction(`Are you sure you want to approve all ${filtered.length} pending updates at once?`))) return;
    setProcessingId("bulk-approve");
    
    let succeededCount = 0;
    let failedCount = 0;
    const succeededIds: string[] = [];

    try {
      await Promise.all(filtered.map(async (update) => {
        try {
          const changes = calculateChanges(update.liveData, update.newData);
          const payload: any = {
            companyId: companyId
          };
          
          const liveDocExists = update.liveData && Object.keys(update.liveData).length > 0;
          if (!liveDocExists) {
             payload.userId = update.talentId;
             payload.rating = 5;
             payload.numericId = Math.floor(100000 + Math.random() * 900000).toString();
             payload.createdAt = new Date().toISOString();
             payload.status = "active";
          }

          changes.forEach(c => { payload[c.key] = c.newVal; });
          
          await setDoc(doc(db, "talents", update.talentId), payload, { merge: true });
          await deleteDoc(doc(db, "pending_profile_updates", update.id));
          await recordActivity(update.talentId, "Administrator bulk-approved pending profile edits");
          
          succeededIds.push(update.id);
          succeededCount++;
        } catch (err) {
          console.error(`Failed to approve update for talent ${update.talentId}:`, err);
          failedCount++;
        }
      }));

      if (succeededCount > 0) {
        setPendingUpdates(prev => prev.filter(u => !succeededIds.includes(u.id)));
      }

      if (failedCount > 0) {
        showError(`Bulk approval finished with some errors. ${succeededCount} approved, ${failedCount} failed.`);
      } else {
        showSuccess("All pending updates successfully approved!");
      }
    } catch (e) {
      console.error(e);
      showError("Failed to bulk approve.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleBulkRejectAll = async () => {
    if (!(await confirmAction(`Are you sure you want to reject and delete all ${filtered.length} pending updates at once?`))) return;
    setProcessingId("bulk-reject");
    
    let succeededCount = 0;
    let failedCount = 0;
    const succeededIds: string[] = [];

    try {
      await Promise.all(filtered.map(async (update) => {
         try {
           await deleteDoc(doc(db, "pending_profile_updates", update.id));
           await recordActivity(update.talentId, "Administrator bulk-rejected proposed profile edits");
           succeededIds.push(update.id);
           succeededCount++;
         } catch (err) {
           console.error(`Failed to reject update for talent ${update.talentId}:`, err);
           failedCount++;
         }
      }));

      if (succeededCount > 0) {
        setPendingUpdates(prev => prev.filter(u => !succeededIds.includes(u.id)));
      }

      if (failedCount > 0) {
        showError(`Bulk rejection finished with some errors. ${succeededCount} rejected, ${failedCount} failed.`);
      } else {
        showSuccess("All pending updates successfully rejected!");
      }
    } catch (e) {
      console.error(e);
      showError("Failed to bulk reject.");
    } finally {
      setProcessingId(null);
    }
  };

  const handlePartialAction = async (update: any, changeKey: string, payloadValue: any, actionType: "approve" | "reject") => {
     setFieldProcessingId(changeKey);
     try {
       if (actionType === "approve") {
          const payload: any = { 
            [changeKey]: payloadValue,
            companyId: companyId
          };
          
          const liveDocExists = update.liveData && Object.keys(update.liveData).length > 0;
          if (!liveDocExists) {
             payload.userId = update.talentId;
             payload.rating = 5;
             payload.numericId = Math.floor(100000 + Math.random() * 900000).toString();
             payload.createdAt = new Date().toISOString();
             payload.status = "active";
          }

          await setDoc(doc(db, "talents", update.talentId), payload, { merge: true });
          await recordActivity(update.talentId, `Administrator approved specific profile update for: ${changeKey}`);
          await sendNotification({
            userId: update.talentId,
            companyId: companyId,
            title: "Partial Profile Update Approved",
            message: `Your edit for ${changeKey} has been approved.`,
            type: "success"
          });
       } else {
          await recordActivity(update.talentId, `Administrator rejected specific profile update for: ${changeKey}`);
          await sendNotification({
            userId: update.talentId,
            companyId: companyId,
            title: "Partial Profile Update Rejected",
            message: `Your edit for ${changeKey} has been rejected.`,
            type: "alert"
          });
       }

       const newPayload = { ...update.newData };
       // Set it exactly equal to live data or delete it so the differ catches it as unchanged/omitted
       if (update.liveData && changeKey in update.liveData) {
          newPayload[changeKey] = update.liveData[changeKey];
       } else {
          delete newPayload[changeKey];
       }
       
       await setDoc(doc(db, "pending_profile_updates", update.id), { newData: newPayload }, { merge: true });

       // Update liveData locally so the UI updates
       const updatedLiveData = { ...update.liveData };
       if (actionType === "approve") {
          updatedLiveData[changeKey] = payloadValue;
       }

       const remainingChanges = calculateChanges(updatedLiveData, newPayload);
       if (remainingChanges.length === 0) {
          await deleteDoc(doc(db, "pending_profile_updates", update.id));
          setPendingUpdates(prev => prev.filter(u => u.id !== update.id));
          setSelectedUpdate(null);
       } else {
          const syncedUpdate = { ...update, newData: newPayload, liveData: updatedLiveData };
          setPendingUpdates(prev => prev.map(u => u.id === update.id ? syncedUpdate : u));
          setSelectedUpdate(syncedUpdate);
       }
     } catch (e) {
       console.error("Partial action failed:", e);
       showError(`Failed to ${actionType} field.`);
     } finally {
       setFieldProcessingId(null);
     }
  };

  const filtered = pendingUpdates.filter(u => {
      const liveName = u.liveData.displayName?.toLowerCase() || u.liveData.name?.toLowerCase() || "";
      const newName = u.newData.displayName?.toLowerCase() || u.newData.name?.toLowerCase() || "";
      const s = search.toLowerCase();
      return liveName.includes(s) || newName.includes(s) || u.talentId.toLowerCase().includes(s);
  });

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      {/* Header metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-1 md:col-span-3 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
             <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center border border-orange-100">
                   <Clock className="w-7 h-7" />
                </div>
                <div>
                   <h1 className="text-3xl font-black text-slate-900 tracking-tight">Pending Updates</h1>
                   <p className="text-slate-500 font-medium mt-1">Modifications awaiting your approval</p>
                </div>
             </div>
             <div className="text-right hidden sm:block">
               <span className="text-4xl font-black text-slate-900">{pendingUpdates.length}</span>
               <span className="text-slate-400 font-bold ml-2 uppercase tracking-widest text-[11px]">Pending</span>
             </div>
          </div>
      </div>
      {/* Table block */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 h-9 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all bg-slate-50"
            />
          </div>
          <div className="flex items-center gap-3">
             {filtered.length > 0 && (
                <>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleBulkRejectAll} 
                    disabled={processingId === "bulk-reject" || processingId === "bulk-approve"}
                    className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 font-bold"
                  >
                     {processingId === "bulk-reject" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                     Reject All
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handleBulkApproveAll} 
                    disabled={processingId === "bulk-reject" || processingId === "bulk-approve"}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow"
                  >
                     {processingId === "bulk-approve" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                     Approve All
                  </Button>
                </>
             )}
             <span className="text-xs text-slate-400 font-medium whitespace-nowrap ml-2 hidden sm:block">{filtered.length} talent{filtered.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-600 font-semibold">{search ? "No pending updates match your search" : "All caught up!"}</p>
            <p className="text-slate-400 text-sm mt-1">{search ? "Try a different search term" : "No pending updates requiring your attention."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                  <th className="px-5 py-3.5 whitespace-nowrap font-semibold">Talent ID</th>
                  <th className="px-5 py-3.5 whitespace-nowrap font-semibold">Talent Name</th>
                  <th className="px-5 py-3.5 whitespace-nowrap font-semibold">Field Edits</th>
                  <th className="px-5 py-3.5 whitespace-nowrap font-semibold">Submission Date</th>
                  <th className="px-5 py-3.5 whitespace-nowrap font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 bg-white">
                {filtered.map((update) => {
                  const dispName = 
                    update.liveData.displayName || update.liveData.name || update.liveData.originalName ||
                    update.newData?.displayName || update.newData?.name || update.newData?.originalName ||
                    update.talentId;
                  const differences = calculateChanges(update.liveData, update.newData).length;

                  // If purely empty differences trickled down, dynamically block it
                  if (differences === 0 && !loading) {
                     // Fire-and-forget self-heal deletion of ghost drafts
                     deleteDoc(doc(db, "pending_profile_updates", update.id)).catch(() => {});
                     return null;
                  }
                  
                  return (
                    <tr 
                      key={update.id} 
                      onClick={() => setSelectedUpdate(update)}
                      className="hover:bg-indigo-50/50 transition-colors group cursor-pointer"
                    >
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md border border-slate-200/60 transition-colors group-hover:bg-white group-hover:border-indigo-100 group-hover:text-indigo-400">
                          {update.talentId.slice(0, 8).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {update.liveData.profileImage || update.newData.profileImage ? (
                            <img src={update.newData.profileImage || update.liveData.profileImage} alt="User" className="w-9 h-9 rounded-xl object-cover shrink-0 shadow-sm border border-slate-100" />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-50 flex items-center justify-center shrink-0 font-bold text-indigo-500 text-sm border border-indigo-500/10">
                              {dispName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="font-bold text-[13px] text-slate-900 group-hover:text-indigo-700 transition-colors">{dispName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="text-[12px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
                           {differences} Edit{differences !== 1 && 's'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="text-[13px] font-semibold text-slate-500">
                           {new Date(update.requestedAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="text-[10px] uppercase tracking-wider font-black px-2.5 py-1 rounded-full border shadow-sm bg-orange-50 text-orange-600 border-orange-200">
                           Pending Review
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Modal View for the Diff Escaped to Body */}
      {mounted && selectedUpdate && createPortal(
         <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedUpdate(null)}></div>
            <div className="relative w-full max-w-5xl bg-[#f8fafc] rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
               
               {/* Modal Header */}
               <div className="bg-white px-8 py-6 border-b border-slate-100 flex items-center justify-between z-10 shrink-0">
                  <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center border border-indigo-100">
                       <User className="w-6 h-6" />
                     </div>
                     <div>
                       <h2 className="text-xl font-black text-slate-900">
                         {selectedUpdate.liveData.displayName || selectedUpdate.liveData.name || selectedUpdate.liveData.originalName ||
                          selectedUpdate.newData?.displayName || selectedUpdate.newData?.name || selectedUpdate.newData?.originalName ||
                          selectedUpdate.talentId}
                       </h2>
                       <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Submitted {new Date(selectedUpdate.requestedAt).toLocaleString()}</p>
                     </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3">
                    <Button 
                      onClick={() => handleReject(selectedUpdate)} 
                      disabled={processingId === selectedUpdate.id}
                      className="bg-red-50 hover:bg-red-100 text-red-600 font-bold px-6 shadow-none border border-red-100 rounded-xl hover:shadow-sm transition-all"
                    >
                      Reject Remaining
                    </Button>
                    <Button 
                      onClick={() => handleApprove(selectedUpdate)} 
                      disabled={processingId === selectedUpdate.id}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 shadow-md hover:shadow-lg transition-all rounded-xl gap-2"
                    >
                      {processingId === selectedUpdate.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} 
                      Approve All Attached
                    </Button>
                  </div>
               </div>

               {/* Modal Body - Diff viewer */}
               <div className="p-0 overflow-y-auto custom-scrollbar flex-1 bg-slate-50">
                  <div className="px-8 py-5 border-b border-slate-100 bg-white sticky top-0 z-10 flex justify-between items-center">
                    <h4 className="text-[12px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                       <FileWarning className="w-4 h-4" /> Granular Approval List
                    </h4>
                    <span className="text-[11px] font-bold text-slate-400">Total Valid Edits: {calculateChanges(selectedUpdate.liveData, selectedUpdate.newData).length}</span>
                  </div>
                 
                  <div className="p-8 space-y-6">
                    {(() => {
                       const changes = calculateChanges(selectedUpdate.liveData, selectedUpdate.newData);

                       if (changes.length === 0) {
                          return (
                             <div className="text-center py-10">
                                <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                                <h3 className="text-lg font-bold text-slate-700">All Revisions Cleared</h3>
                                <p className="text-sm text-slate-500">No more valid edits left. Modal closing...</p>
                             </div>
                          );
                       }

                       const isImageUrl = (urlStr: string) => {
                          if (typeof urlStr !== 'string') return false;
                          const lower = urlStr.toLowerCase();
                          if (lower.startsWith('data:image/')) return true;
                          if (!lower.startsWith('http') && !lower.startsWith('/')) return false;
                          if (
                             lower.includes('/api/files/') ||
                             lower.includes('/uploads/') ||
                             lower.includes('firebasestorage') ||
                             lower.includes('storage.googleapis.com') ||
                             lower.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp|heic)(\?.*)?$/)
                          ) {
                             return true;
                          }
                          return false;
                       };

                       const formatValue = (val: any) => {
                          if (val === undefined || val === null || val === "") return <span className="text-slate-300 italic">Empty</span>;
                          if (Array.isArray(val)) {
                             if (val.length === 0) return <span className="text-slate-300 italic">Empty List</span>;
                             return (
                               <div className="flex flex-wrap gap-2">
                                 {val.filter((item: any) => {
                                    // Skip visually rendering past blackout dates
                                    if (typeof item === 'object' && item !== null && 'date' in item) {
                                        const dateObj = new Date(item.date);
                                        dateObj.setHours(12, 0, 0, 0);
                                        const localToday = new Date();
                                        localToday.setHours(0, 0, 0, 0);
                                        return dateObj >= localToday;
                                    }
                                    return true;
                                 }).map((item, i) => {
                                   if (typeof item === 'object' && item !== null) {
                                      // Specific aesthetic layout for date objects (Blackouts)
                                      if ('date' in item) {
                                         return (
                                           <span key={i} className="px-2.5 py-1 bg-red-50 text-red-600 rounded-lg text-[11px] font-black uppercase tracking-wider border border-red-100 flex items-center gap-1.5 shadow-sm">
                                             <Calendar className="w-3.5 h-3.5" /> {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                             {item.reason && <span className="opacity-70 capitalize ml-1 border-l border-red-200 pl-1.5">{item.reason}</span>}
                                           </span>
                                         );
                                      }
                                      
                                      // Generic dynamic aesthetic fallback
                                      const objStr = Object.entries(item).map(([k,v]) => `${k}: ${v}`).join(', ');
                                      return (
                                         <span key={i} className="px-2 py-0.5 bg-slate-100/50 text-slate-500 rounded-md text-[10px] font-bold border border-slate-200" title={objStr}>
                                           {objStr.length > 50 ? objStr.slice(0, 50) + "..." : objStr}
                                         </span>
                                      );
                                   }

                                   if (typeof item === 'string' && isImageUrl(item)) {
                                      return (
                                        <a
                                          key={i}
                                          href={item}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="group relative block overflow-hidden rounded-xl border border-slate-200 shadow-sm hover:opacity-90 transition-opacity bg-slate-100 shrink-0"
                                          title="Click to view full image"
                                        >
                                          <img src={item} alt="Asset" className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-xl" />
                                        </a>
                                      );
                                   }

                                   const renderStr = String(item);
                                   return (
                                     <span key={i} className="px-2.5 py-1 bg-indigo-50/50 text-indigo-700 rounded-lg text-[12px] font-bold border border-indigo-100 shadow-sm">
                                       {renderStr}
                                     </span>
                                   );
                                 })}
                               </div>
                             );
                          }
                          if (typeof val === 'string' && isImageUrl(val)) {
                             return (
                               <a
                                 href={val}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="group relative block overflow-hidden rounded-xl border border-slate-200 shadow-sm hover:opacity-90 transition-opacity bg-slate-100 shrink-0"
                                 title="Click to view full image"
                               >
                                 <img src={val} alt="Asset" className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-xl" />
                               </a>
                             );
                          }
                          return <span className="text-[13px] text-slate-700 font-medium">{String(val)}</span>;
                       };

                       return changes.map((change, idx) => (
                         <div key={idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            
                            <div className="bg-slate-50/80 px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                               <span className="text-[11px] font-black uppercase text-indigo-600 tracking-widest">{change.key.replace(/([A-Z])/g, ' $1').trim()}</span>
                               <div className="flex gap-2">
                                 <Button
                                    size="sm"
                                    onClick={() => handlePartialAction(selectedUpdate, change.key, change.newVal, "reject")}
                                    disabled={fieldProcessingId === change.key}
                                    className="bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-red-200 rounded-lg h-7 px-3 text-[11px] font-bold shadow-sm"
                                 >
                                    {fieldProcessingId === change.key ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <XCircle className="w-3 h-3 mr-1" />} Reject
                                 </Button>
                                 <Button
                                    size="sm"
                                    onClick={() => handlePartialAction(selectedUpdate, change.key, change.newVal, "approve")}
                                    disabled={fieldProcessingId === change.key}
                                    className="bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white border border-indigo-100 hover:border-indigo-600 rounded-lg h-7 px-3 text-[11px] font-bold shadow-sm transition-colors"
                                 >
                                    {fieldProcessingId === change.key ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />} Approve
                                 </Button>
                               </div>
                            </div>

                            <div className="grid grid-cols-[1fr_auto_1fr] items-center p-5 gap-6">
                               <div className="flex flex-col gap-2">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current State</span>
                                  {formatValue(change.oldVal)}
                               </div>
                               <div className="flex items-center justify-center">
                                  <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                                     <ArrowRight className="w-4 h-4 text-indigo-400" />
                                  </div>
                               </div>
                               <div className="flex flex-col gap-2 bg-emerald-50/30 p-3 rounded-xl border border-emerald-50 -my-3">
                                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Requested Change</span>
                                  {formatValue(change.newVal)}
                               </div>
                            </div>
                         </div>
                       ));
                    })()}
                  </div>
               </div>

            </div>
         </div>,
         document.body
      )}
    </div>
  );
}
