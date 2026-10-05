"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Globe, Briefcase, DollarSign, User, MapPin, Calendar, Star, ChevronLeft, ChevronRight, Image as ImageIcon, X, ZoomIn, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export interface WorkingHours {
  start: string;
  end: string;
}

export interface BlockedDate {
  id: string;
  date: string; // YYYY-MM-DD
  reason?: string;
}

interface TalentProfile {
  name: string;
  originalName?: string;
  username: string;
  bio: string;
  categories: string[];
  rate: string;
  locations: string[];
  photoUrl: string;
  coverUrl?: string;
  gallery: string[];
  galleryLayout?: "grid" | "slider";
  companyId: string;
  workingHours?: WorkingHours;
  blockedDates?: BlockedDate[];
}

export default function PublicProfilePage() {
  const params = useParams();
  const identifier = params.identifier as string;
  const companyId = params.companyId as string;

  const [loading, setLoading] = useState(true);
  const [talent, setTalent] = useState<TalentProfile | null>(null);
  const [talentUid, setTalentUid] = useState<string>("");
  const [reviews, setReviews] = useState<any[]>([]);
  const [averageRating, setAverageRating] = useState<number>(5);
  const [reviewsCount, setReviewsCount] = useState<number>(0);
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const [hasPendingUpdate, setHasPendingUpdate] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(true);
  const [isInactive, setIsInactive] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchProfile() {
      if (!identifier) return;
      try {
        const cleanId = String(identifier).trim();
        const lowerId = cleanId.toLowerCase();
        const slugId = lowerId.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

        const safeGetDoc = async (col: string, docId: string) => {
          try {
            const snap = await getDoc(doc(db, col, docId));
            return snap.exists() ? snap : null;
          } catch (e) {
            return null;
          }
        };

        const safeQuery = async (col: string, field: string, val: string) => {
          try {
            const q = query(collection(db, col), where(field, "==", val));
            const snap = await getDocs(q);
            return snap.empty ? null : snap.docs[0];
          } catch (e) {
            return null;
          }
        };

        let foundDoc: any = null;
        let isPendingDoc = false;
        let rawPendingData: any = null;

        // 1. Parallel execution for instant (<100ms) initial profile lookup
        const spaceName = cleanId.includes("-") ? lowerId.replace(/-/g, " ") : "";
        const [
          tDirect, uDirect,
          tUserLower, uUserLower,
          tUserSlug, uUserSlug,
          tUrlLower, uUrlLower,
          tDispSpace, uDispSpace
        ] = await Promise.all([
          safeGetDoc("talents", cleanId),
          safeGetDoc("users", cleanId),
          safeQuery("talents", "username", lowerId),
          safeQuery("users", "username", lowerId),
          safeQuery("talents", "username", slugId),
          safeQuery("users", "username", slugId),
          safeQuery("talents", "customUrl", lowerId),
          safeQuery("users", "customUrl", lowerId),
          spaceName ? safeQuery("talents", "displayName", spaceName) : Promise.resolve(null),
          spaceName ? safeQuery("users", "name", spaceName) : Promise.resolve(null)
        ]);

        foundDoc = tDirect || uDirect || tUserLower || uUserLower || tUserSlug || uUserSlug || tUrlLower || uUrlLower || tDispSpace || uDispSpace;

        // 2. Check pending_profile_updates directly if not found
        if (!foundDoc) {
          const pDoc = await safeGetDoc("pending_profile_updates", cleanId) ||
                       await safeQuery("pending_profile_updates", "newData.username", lowerId) ||
                       await safeQuery("pending_profile_updates", "newData.username", slugId);
          if (pDoc) {
            foundDoc = pDoc;
            isPendingDoc = true;
            rawPendingData = pDoc.data().newData;
          }
        }

        // 5. Fallback: Search all talent records for this company matching slugified name
        if (!foundDoc && companyId) {
          try {
            const targetCid = companyId.toLowerCase();
            const [tSnaps, uSnaps] = await Promise.all([
              getDocs(query(collection(db, "talents"), where("companyId", "==", targetCid))),
              getDocs(query(collection(db, "users"), where("companyId", "==", targetCid)))
            ]);

            const allDocs = [...tSnaps.docs, ...uSnaps.docs];
            for (const d of allDocs) {
              const data = d.data();
              const uName = (data.username || "").toLowerCase();
              const dName = (data.displayName || data.name || "").toLowerCase();
              const dSlug = dName.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
              const cUrl = (data.customUrl || "").toLowerCase();

              if (
                d.id === cleanId ||
                uName === lowerId ||
                uName === slugId ||
                cUrl === lowerId ||
                cUrl === slugId ||
                dSlug === slugId ||
                dName === lowerId ||
                dName === lowerId.replace(/-/g, " ")
              ) {
                foundDoc = d;
                break;
              }
            }
          } catch (err) {
            console.warn("Fallback talent lookup error:", err);
          }
        }

        if (foundDoc) {
          const uid = isPendingDoc ? (foundDoc.data().talentId || cleanId) : foundDoc.id;

          const [tSnap, uSnap, pSnap] = await Promise.all([
            safeGetDoc("talents", uid),
            safeGetDoc("users", uid),
            safeGetDoc("pending_profile_updates", uid)
          ]);

          const tData = tSnap?.data() || (foundDoc.ref.parent.id === "talents" ? foundDoc.data() : {});
          const uData = uSnap?.data() || (foundDoc.ref.parent.id === "users" ? foundDoc.data() : {});
          const pData = pSnap?.data() || null;

          if (pData && pData.status === "pending") {
            setHasPendingUpdate(true);
            if (!rawPendingData) rawPendingData = pData.newData;
          }

          const photoUrl =
            tData.photoUrl || tData.profileImage || tData.photo || tData.avatar || tData.image ||
            uData.photoUrl || uData.profileImage || uData.photo || uData.avatar || uData.image ||
            rawPendingData?.photoUrl || rawPendingData?.profileImage || "";

          const coverUrl =
            tData.coverUrl || tData.coverPhoto ||
            uData.coverUrl || uData.coverPhoto ||
            rawPendingData?.coverUrl || "";

          const name =
            tData.displayName || tData.name || tData.originalName ||
            uData.displayName || uData.name || uData.originalName ||
            rawPendingData?.displayName || rawPendingData?.name || "Talent";

          const profileData: TalentProfile & { status?: string } = {
            name,
            originalName: tData.originalName || uData.originalName || "",
            username: tData.username || uData.username || identifier,
            bio: tData.bio || uData.bio || rawPendingData?.bio || "No professional bio provided yet.",
            categories: Array.isArray(tData.categories) ? tData.categories : (Array.isArray(uData.categories) ? uData.categories : []),
            rate: tData.rate || uData.rate || rawPendingData?.rate || "0",
            locations: Array.isArray(tData.locations) ? tData.locations : (Array.isArray(uData.locations) ? uData.locations : (uData.city ? [uData.city] : [])),
            photoUrl,
            coverUrl,
            gallery: Array.isArray(tData.gallery) ? tData.gallery : (Array.isArray(uData.gallery) ? uData.gallery : []),
            galleryLayout: tData.galleryLayout || uData.galleryLayout || "grid",
            companyId: tData.companyId || uData.companyId || companyId,
            workingHours: tData.workingHours || uData.workingHours,
            blockedDates: tData.blockedDates || uData.blockedDates,
            status: tData.status || uData.status || "active"
          };

          if (profileData.companyId && profileData.companyId.toLowerCase() !== companyId.toLowerCase()) {
            setIsAuthorized(false);
          } else {
            setTalent(profileData);
            setTalentUid(uid);
            setIsPendingApproval(isPendingDoc);
            if (profileData.status === "inactive") {
              setIsInactive(true);
            }
          }
        }
      } catch (err) {
        console.error("Error fetching talent profile:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [identifier, companyId]);

  useEffect(() => {
    async function fetchReviews() {
      if (!talentUid) return;
      try {
        const q = query(
          collection(db, "reviews"),
          where("toId", "==", talentUid),
          where("fromRole", "==", "client")
        );
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        list.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setReviews(list);

        if (list.length > 0) {
          const total = list.reduce((sum: number, r: any) => sum + Number(r.rating || 5), 0);
          const avg = total / list.length;
          setAverageRating(Number(avg.toFixed(1)));
          setReviewsCount(list.length);
        } else {
          setAverageRating(5.0);
          setReviewsCount(0);
        }
      } catch (e) {
        console.error("Error fetching reviews:", e);
      }
    }
    fetchReviews();
  }, [talentUid]);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo = direction === "left" ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: "smooth" });
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
        <p className="text-slate-400 font-bold animate-pulse">Loading Profile...</p>
      </div>
    </div>
  );

  if (!isAuthorized) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <Card className="max-w-md w-full rounded-[40px] border-none shadow-2xl p-10 text-center">
        <div className="w-20 h-20 bg-amber-50 rounded-[28px] flex items-center justify-center mx-auto mb-6">
          <X className="w-10 h-10 text-amber-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Access Denied</h2>
        <p className="text-slate-500 mt-2 font-medium">This profile does not belong to the current company directory.</p>
        <Button asChild className="mt-8 rounded-2xl bg-slate-900 hover:bg-indigo-600 h-12 px-8">
          <Link href="/">Return Home</Link>
        </Button>
      </Card>
    </div>
  );

  if (!talent) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <Card className="max-w-md w-full rounded-[40px] border-none shadow-2xl p-10 text-center">
        <div className="w-20 h-20 bg-slate-100 rounded-[28px] flex items-center justify-center mx-auto mb-6">
          <User className="w-10 h-10 text-slate-300" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Talent Not Found</h2>
        <p className="text-slate-500 mt-2 font-medium">The profile you are looking for does not exist or has been removed.</p>
        <Button asChild className="mt-8 rounded-2xl bg-slate-900 hover:bg-indigo-600 h-12 px-8">
          <Link href="/">Return Home</Link>
        </Button>
      </Card>
    </div>
  );

  const metaTitle = `${talent.name} - Professional ${talent.categories?.[0] || "Performer"} | Talentum`;
  const metaDesc = talent.bio ? talent.bio.slice(0, 160) : `Book ${talent.name} for your event on Talentum. View rates, portfolio, reviews, and real-time availability.`;
  const metaImage = talent.photoUrl || talent.coverUrl || "";
  const pageUrl = `https://cloud.talentumhq.com/${companyId}/talent/${talent.username || identifier}`;

  return (
    <div className="min-h-screen bg-slate-50/50 pb-24 text-slate-900">
      {/* Dynamic SEO Meta Tags & Schema.org Structured Data */}
      <head>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDesc} />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <link rel="canonical" href={pageUrl} />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="profile" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDesc} />
        {metaImage && <meta property="og:image" content={metaImage} />}

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={pageUrl} />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDesc} />
        {metaImage && <meta name="twitter:image" content={metaImage} />}

        {/* Schema.org Person JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Person",
              "name": talent.name,
              "description": talent.bio,
              "image": metaImage,
              "jobTitle": talent.categories?.[0] || "Performer",
              "priceRange": talent.rate ? `$${talent.rate}/hr` : undefined,
              "url": pageUrl,
              "address": talent.locations?.[0] ? {
                "@type": "PostalAddress",
                "addressLocality": talent.locations[0]
              } : undefined
            })
          }}
        />
      </head>
      
      {/* Status Alert Banners */}
      {(isPendingApproval || hasPendingUpdate) && (
        <div className="max-w-6xl mx-auto px-6 pt-6">
          {isPendingApproval ? (
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex items-center gap-3 animate-in slide-in-from-top duration-300">
              <Clock className="w-6 h-6 text-white shrink-0 animate-spin" />
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider">Profile Setup Pending Agency Approval</h3>
                <p className="text-xs text-amber-100 font-semibold mt-0.5">
                  This talent profile is currently under review by the agency. The public link will become fully live once approved.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-4 sm:p-5 rounded-3xl shadow-xl flex items-center gap-3 animate-in slide-in-from-top duration-300">
              <Clock className="w-6 h-6 text-white shrink-0" />
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider">Pending Profile Edits Under Review</h3>
                <p className="text-xs text-indigo-100 font-semibold mt-0.5">
                  Updated profile modifications have been submitted for agency review. The currently approved active profile is shown below.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hero Section */}
      <div className="relative h-[400px] w-full overflow-hidden">
        {talent.coverUrl ? (
          <img src={talent.coverUrl} alt="Cover" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-black/20" />
      </div>

      <div className="max-w-6xl mx-auto px-6">
        
        {/* Main Identity Card (Floating) */}
        <div className="relative -mt-32 mb-12">
          <Card className="rounded-[48px] border-none shadow-2xl shadow-slate-200/80 bg-white overflow-hidden">
            <CardContent className="p-0">
               <div className="flex flex-col md:flex-row items-center md:items-end gap-8 p-10">
                  <div className="relative">
                    <div className="w-48 h-48 rounded-[56px] bg-slate-100 overflow-hidden border-8 border-white shadow-2xl relative z-20">
                      {talent.photoUrl ? (
                        <img src={talent.photoUrl} alt={talent.name || "Talent"} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300"><User className="w-24 h-24" /></div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 text-center md:text-left mb-4">
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-2">
                       <span className="bg-indigo-50 text-indigo-600 text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-indigo-100/50">Verified Professional</span>
                       {talent.rate && <span className="bg-emerald-50 text-emerald-600 text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-emerald-100/50">${talent.rate}/HR</span>}
                    </div>
                    <div className="mb-3">
                        <h1 className="text-5xl font-black text-slate-900 tracking-tight capitalize">{talent.name || "Talent"}</h1>
                    </div>
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-slate-400 font-bold">
                       <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-indigo-500" /> {talent.locations?.[0] || "Global"}</span>
                       <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-indigo-500" /> Available Now</span>
                       <span className="flex items-center gap-2 text-amber-500">
                         <Star className="w-4 h-4 fill-amber-500" /> 
                         {reviewsCount > 0 ? `${averageRating} (${reviewsCount} review${reviewsCount > 1 ? 's' : ''})` : "5.0 (New)"}
                       </span>
                    </div>
                  </div>

                  <div className="mb-4">
                     {isInactive ? (
                       <div className="px-6 py-4 bg-amber-50 border border-amber-200 rounded-[24px] text-amber-800 text-sm font-bold flex items-center gap-2 shadow-sm">
                         <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                         <span>Profile Currently Inactive</span>
                       </div>
                     ) : (
                       <Button className="h-16 px-10 rounded-[28px] bg-indigo-600 hover:bg-slate-900 text-white font-black text-lg shadow-2xl shadow-indigo-600/20 transition-all hover:-translate-y-1 active:scale-95">
                         Book {(talent.name || "Talent").trim().split(" ")[0]} Now
                       </Button>
                     )}
                  </div>
               </div>
               
               <div className="bg-slate-50/50 border-t border-slate-100 p-8 md:px-10 flex flex-wrap gap-8 items-center">
                  <div className="flex items-center gap-3">
                     <div className="bg-indigo-100 p-2.5 rounded-[18px]"><Briefcase className="w-5 h-5 text-indigo-600" /></div>
                     <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categories</p>
                        <p className="text-sm font-bold text-slate-700">{talent.categories ? talent.categories.join(" • ") : "Performer"}</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <div className="bg-emerald-100 p-2.5 rounded-[18px]"><Globe className="w-5 h-5 text-emerald-600" /></div>
                     <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Service Areas</p>
                        <p className="text-sm font-bold text-slate-700 truncate max-w-[300px]">{talent.locations ? talent.locations.join(", ") : "Global"}</p>
                     </div>
                  </div>
               </div>
            </CardContent>
          </Card>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Main Info */}
          <div className="lg:col-span-8 space-y-10">
             <section>
                <div className="flex items-center gap-3 mb-6">
                   <h2 className="text-2xl font-black text-slate-900 tracking-tight">Professional Bio</h2>
                   <div className="flex-1 h-px bg-slate-100" />
                </div>
                <div className="bg-white rounded-[40px] p-10 shadow-xl shadow-slate-200/50">
                   <p className="text-slate-600 text-lg font-medium leading-[1.8] whitespace-pre-wrap">
                      {talent.bio || "No professional bio provided yet. Contact the talent for more information about their experience and background."}
                   </p>
                </div>
             </section>              <section>
                <div className="flex items-center justify-between gap-3 mb-6">
                   <h2 className="text-2xl font-black text-slate-900 tracking-tight">Portfolio Gallery</h2>
                   <div className="flex-1 h-px bg-slate-100" />
                   <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-wider">{(talent.gallery || []).length} Photos</span>
                </div>
                
                {(talent.gallery || []).length > 0 ? (
                  <>
                    {talent.galleryLayout === "slider" ? (
                      <div className="relative group p-4 bg-white rounded-[40px] shadow-xl shadow-slate-200/50">
                        <div 
                          ref={scrollRef}
                          className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2"
                          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                        >
                          {(talent.gallery || []).map((url, idx) => (
                            <div 
                              key={idx} 
                              onClick={() => setSelectedImage(url)}
                              className="flex-none w-[320px] sm:w-[500px] aspect-[16/10] rounded-[32px] overflow-hidden bg-slate-50 shadow-lg snap-center cursor-zoom-in relative group/item"
                            >
                              <img src={url} alt={`Gallery ${idx}`} loading="lazy" decoding="async" className="w-full h-full object-contain p-2" />
                              <div className="absolute inset-0 bg-black/0 group-hover/item:bg-black/5 transition-colors flex items-center justify-center">
                                 <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover/item:opacity-100 transition-opacity drop-shadow-lg" />
                              </div>
                            </div>
                          ))}
                        </div>
                        <button 
                          onClick={() => scroll("left")}
                          className="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/90 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-slate-600 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover:opacity-100 z-10"
                        >
                          <ChevronLeft className="w-6 h-6" />
                        </button>
                        <button 
                          onClick={() => scroll("right")}
                          className="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/90 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-slate-600 hover:scale-110 active:scale-95 transition-all opacity-0 group-hover:opacity-100 z-10"
                        >
                          <ChevronRight className="w-6 h-6" />
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(talent.gallery || []).map((url, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => setSelectedImage(url)}
                            className="group relative aspect-[4/5] rounded-[32px] overflow-hidden bg-slate-50 shadow-xl hover:shadow-2xl transition-all duration-500 cursor-zoom-in"
                          >
                            <img src={url} alt={`Gallery ${idx}`} loading="lazy" decoding="async" className="w-full h-full object-contain p-4 transition-transform group-hover:scale-105 duration-700" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                               <ZoomIn className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-slate-100/50 rounded-[40px] p-20 text-center border-4 border-dashed border-slate-200/50">
                     <ImageIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                     <p className="text-slate-400 font-bold">No portfolio items added yet</p>
                  </div>
                )}
              </section>

             <section className="mt-12">
                <div className="flex items-center justify-between gap-3 mb-6">
                   <h2 className="text-2xl font-black text-slate-900 tracking-tight">Client Reviews</h2>
                   <div className="flex-1 h-px bg-slate-100" />
                   <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-wider">{reviewsCount} Reviews</span>
                </div>

                {reviews.length > 0 ? (
                  <div className="space-y-6">
                    {reviews.map((rev) => {
                      const dateStr = rev.createdAt 
                        ? new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(rev.createdAt))
                        : "Recent Event";
                      return (
                        <div key={rev.id} className="bg-white rounded-[32px] p-8 shadow-xl shadow-slate-200/40 border border-slate-100 space-y-4 transition-all hover:shadow-2xl">
                           <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                 <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black">
                                    <User className="w-6 h-6" />
                                 </div>
                                 <div>
                                    <h4 className="font-black text-slate-800 leading-tight">Verified Client</h4>
                                    <span className="text-xs text-slate-400 font-bold">{dateStr}</span>
                                 </div>
                              </div>
                              <div className="flex items-center gap-1 text-[11px] font-black text-amber-600 bg-amber-50 border border-amber-100/50 px-3 py-1.5 rounded-xl shadow-sm">
                                 <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> {Number(rev.rating).toFixed(1)}
                              </div>
                           </div>
                           <p className="text-slate-600 font-medium leading-relaxed pl-1">
                              "{rev.comment || "No written comments left by the client."}"
                           </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white rounded-[40px] p-16 text-center border-4 border-dashed border-slate-100/80 shadow-md">
                     <Star className="w-12 h-12 text-slate-300 mx-auto mb-4 stroke-[1.5]" />
                     <p className="text-slate-400 font-bold">No client reviews yet</p>
                     <p className="text-xs text-slate-400/80 mt-1 font-semibold">Gigs completed will show ratings and public feedback here.</p>
                  </div>
                )}
             </section>
          </div>

          {/* Side Info */}
          <div className="lg:col-span-4 space-y-8">
             <Card className="rounded-[40px] border-none shadow-xl shadow-slate-200/50 bg-white">
                <CardContent className="p-8 space-y-8">
                   <div>
                      <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2.5">
                        <DollarSign className="w-5 h-5 text-indigo-600" /> Pricing Detail
                      </h3>
                      <div className="bg-slate-50 p-6 rounded-[28px] border border-slate-100">
                         <div className="flex items-baseline justify-between mb-1">
                            <span className="text-3xl font-black text-slate-900">${talent.rate || "0"}</span>
                            <span className="text-slate-400 font-bold">Per Hour</span>
                         </div>
                         <p className="text-[11px] font-bold text-slate-400 mt-2">Transparent pricing with no hidden fees.</p>
                      </div>
                   </div>

                    <div>
                      <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2.5">
                        <MapPin className="w-5 h-5 text-indigo-600" /> Service Area
                      </h3>
                      <div className="flex flex-wrap gap-2">
                         {(talent.locations || []).map(loc => (
                           <span key={loc} className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-[12px] font-black border border-indigo-100">
                             {loc}
                           </span>
                         ))}
                         {(!talent.locations || talent.locations.length === 0) && (
                           <span className="text-slate-400 font-bold text-xs italic bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                             Not Specified
                           </span>
                         )}
                      </div>
                   </div>                    <div>
                      <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2.5">
                        <Clock className="w-5 h-5 text-indigo-600" /> Availability
                      </h3>
                      {(() => {
                        const wh = talent.workingHours;
                        const is24h = (wh as any)?.mode === "24hours" || (!wh?.start || wh?.start === "00:00") && (!wh?.end || wh?.end === "23:59");

                        if (is24h) {
                          return (
                            <div className="bg-emerald-50/80 border border-emerald-100/80 rounded-[24px] p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
                              <div>
                                 <span className="block text-[10px] font-black text-emerald-600 tracking-widest uppercase mb-1">Standard Hours</span>
                                 <span className="block text-[14px] font-bold text-slate-800">24 Hours / Always Available</span>
                              </div>
                              <div className="bg-emerald-100/80 px-4 py-2 rounded-xl border border-emerald-200 flex items-center justify-center shrink-0">
                                 <span className="text-[13px] font-black text-emerald-800 whitespace-nowrap flex items-center gap-1.5">
                                    <Clock className="w-4 h-4 text-emerald-600" />
                                    24/7 Available
                                 </span>
                              </div>
                            </div>
                          );
                        }

                        if (wh && wh.start && wh.end) {
                          const formatTime = (time24: string) => {
                             if (!time24) return "";
                             const [h, m] = time24.split(":");
                             const hours12 = Number(h) % 12 || 12;
                             return `${hours12}:${m} ${Number(h) >= 12 ? 'PM' : 'AM'}`;
                          };
                          return (
                            <div className="bg-white border border-slate-200 rounded-[24px] p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
                                <div>
                                   <span className="block text-[10px] font-black text-slate-400 tracking-widest uppercase mb-1">Custom Hours</span>
                                   <span className="block text-[14px] font-bold text-slate-700">Available for bookings</span>
                                </div>
                                <div className="bg-indigo-50/80 px-4 py-2.5 rounded-xl border border-indigo-100 flex items-center justify-center shrink-0">
                                   <span className="text-[13px] font-black text-indigo-700 whitespace-nowrap flex items-center gap-1.5">
                                      <Clock className="w-4 h-4 text-indigo-400" />
                                      {formatTime(wh.start)} - {formatTime(wh.end)}
                                   </span>
                                </div>
                            </div>
                          );
                        }

                        return (
                          <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100 text-center">
                             <Clock className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                             <p className="text-[13px] font-bold text-slate-500">Schedule not configured.</p>
                          </div>
                        );
                      })()}
                      
                      {(() => {
                         const today = new Date();
                         today.setHours(0, 0, 0, 0);

                         const futureBlockedDates = (talent.blockedDates || []).reduce((acc, curr) => {
                             const blockObj = typeof curr === 'string' ? { id: curr, date: curr, reason: "" } : curr;
                             if (!blockObj || !blockObj.date) return acc;
                             
                             // Skip past dates
                             const blockDateObj = new Date(blockObj.date);
                             
                             // TimeZone fix for Date parsing - treat YYYY-MM-DD as local midday to compare cleanly 
                             blockDateObj.setHours(12, 0, 0, 0);
                             if (blockDateObj < today) return acc;

                             const month = blockDateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
                             if (!acc[month]) acc[month] = [];
                             acc[month].push(blockObj);
                             return acc;
                         }, {} as Record<string, any[]>);
                         
                         if (Object.keys(futureBlockedDates).length === 0) return null;

                         return (
                            <div className="mt-8 space-y-4">
                                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-orange-400"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                  Upcoming Blackout Dates
                                </h4>
                                <div className="grid grid-cols-1 gap-3">
                                    {Object.entries(futureBlockedDates).map(([month, dates]) => (
                                        <div key={month} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-[0_2px_15px_rgb(0,0,0,0.03)] transition-all hover:border-orange-200">
                                           <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-3 px-1">{month}</h5>
                                           <div className="flex flex-wrap gap-2">
                                              {dates?.map((block: any) => (
                                                <span key={block.id} className="group relative overflow-hidden bg-slate-50 text-slate-700 px-3.5 py-1.5 rounded-xl text-[12px] font-bold border border-slate-200 flex items-center gap-2 transition-all hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700">
                                                    <span className="text-[14px] font-black text-slate-900 group-hover:text-orange-600 transition-colors">{new Date(block.date).getDate()}</span>
                                                    <span className="text-[10px] font-bold uppercase text-slate-400 group-hover:text-orange-400">{new Date(block.date).toLocaleString('default', { weekday: 'short' })}</span>
                                                    {block.reason ? <span className="opacity-60 font-medium text-[11px] border-l border-slate-300 group-hover:border-orange-200 pl-2.5 ml-1">{String(block.reason)}</span> : null}
                                                </span>
                                              ))}
                                           </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                         );
                      })()}
                   </div>

                   <Button className="w-full h-16 rounded-[28px] bg-slate-900 hover:bg-slate-800 text-white font-black text-lg shadow-xl transition-all">
                     Inquire Availability
                   </Button>
                </CardContent>
             </Card>

             <div className="bg-indigo-600 rounded-[40px] p-8 text-white shadow-2xl shadow-indigo-600/30">
                <h3 className="text-xl font-black mb-2">Book with Confidence</h3>
                <p className="text-indigo-100 text-sm font-medium leading-relaxed mb-6 opacity-80">
                  Every booking through Talentum is protected by our professional service agreement.
                </p>
                <div className="space-y-3 opacity-90">
                   {['Secure Payments', 'Vetted Professionals', 'Direct Messaging'].map(item => (
                     <div key={item} className="flex items-center gap-3 text-sm font-bold">
                        <div className="w-2 h-2 rounded-full bg-white shadow-lg shadow-white/50" />
                        {item}
                     </div>
                   ))}
                </div>
             </div>
          </div>

        </div>
      </div>

      {/* Image Popup Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300"
          onClick={() => setSelectedImage(null)}
        >
          <button 
            className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all"
            onClick={() => setSelectedImage(null)}
          >
            <X className="w-6 h-6" />
          </button>
          
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center">
            <img 
              src={selectedImage} 
              alt="Full View" 
              className="max-w-full max-h-full object-contain shadow-2xl rounded-2xl animate-in zoom-in-95 duration-300"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
