import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendEmailNotification } from "@/lib/mail-server";
import { sendSmsNotification } from "@/lib/sms-server";
import admin from "firebase-admin";

interface TalentProfile {
  gender: string | string[];
  talentType: string;
  categories: string[];
  locations: string[];
}

interface MatchResult {
  matched: boolean;
  locationMatch: boolean;
  genderMatch: boolean;
  jobMatch: boolean;
  debugInfo: any;
}

// US state abbreviation to full name map for location matching
const STATE_ABBR: Record<string, string> = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california",
  co: "colorado", ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia",
  hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
  ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
  ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi",
  mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire",
  nj: "new jersey", nm: "new mexico", ny: "new york", nc: "north carolina",
  nd: "north dakota", oh: "ohio", ok: "oklahoma", or: "oregon", pa: "pennsylvania",
  ri: "rhode island", sc: "south carolina", sd: "south dakota", tn: "tennessee",
  tx: "texas", ut: "utah", vt: "vermont", va: "virginia", wa: "washington",
  wv: "west virginia", wi: "wisconsin", wy: "wyoming", dc: "district of columbia"
};

function doesMatch(booking: any, profile: TalentProfile): MatchResult {
  const safeString = (val: any): string => {
    if (val === undefined || val === null) return "";
    if (typeof val === "string") return val;
    if (typeof val === "object") {
      return val.description || val.formatted_address || val.name || val.id || val.label || JSON.stringify(val) || "";
    }
    return String(val);
  };

  const talentLocations = (profile.locations || []).map((l) => safeString(l).toLowerCase().trim());
  const bookingCity = safeString(booking.city || booking.__city).toLowerCase().trim();
  const bookingStateRaw = safeString(booking.state || booking.__state).toLowerCase().trim();
  // Expand state abbreviation to full name (e.g. "nv" → "nevada")
  const bookingStateFull = STATE_ABBR[bookingStateRaw] || bookingStateRaw;
  const bookingLocation = `${bookingCity} ${bookingStateFull}`.trim();
  const bookingLocationAbbr = `${bookingCity} ${bookingStateRaw}`.trim();

  const locationMatch =
    talentLocations.length === 0 ||
    !bookingCity ||
    talentLocations.some((loc) => {
      // Normalize separators: "las vegas, nevada" → "las vegas nevada"
      const locNorm = loc.replace(/,\s*/g, " ").trim();
      return (
        // City match
        (bookingCity && locNorm.includes(bookingCity)) ||
        // Full state name match
        (bookingStateFull && locNorm.includes(bookingStateFull)) ||
        // Abbr state match
        (bookingStateRaw && locNorm.includes(bookingStateRaw)) ||
        // Full combined "las vegas nevada" match
        (bookingLocation && locNorm.includes(bookingLocation)) ||
        (bookingLocation && bookingLocation.includes(locNorm)) ||
        // Abbr combined "las vegas nv" match
        (bookingLocationAbbr && locNorm.includes(bookingLocationAbbr)) ||
        // Original loc without normalization
        (bookingCity && loc.includes(bookingCity)) ||
        (bookingStateFull && loc.includes(bookingStateFull))
      );
    });

  const bookingGender = safeString(booking.gender).toLowerCase().trim();
  const talentGenders = (
    Array.isArray(profile.gender) 
      ? profile.gender 
      : [profile.gender]
  ).map((g) => safeString(g).toLowerCase().trim()).filter(Boolean);

  const genderMatch =
    !bookingGender ||
    bookingGender === "any" ||
    talentGenders.length === 0 ||
    talentGenders.some((g) => 
      g === bookingGender || 
      g.includes(bookingGender) || 
      bookingGender.includes(g) || 
      (bookingGender === "male" && g.includes("male")) || 
      (bookingGender === "female" && g.includes("female"))
    );

  const bookingJob = safeString(booking.jobType || booking.__jobType).toLowerCase().trim();
  
  const talentTypes = (
    Array.isArray(profile.talentType)
      ? profile.talentType
      : [profile.talentType]
  ).map((t) => safeString(t).toLowerCase().trim()).filter(Boolean);

  const talentCategories = (profile.categories || []).map((c) => safeString(c).toLowerCase().trim());
  
  // If talent has no job type/categories at all → match any job (open to all)
  const jobMatch =
    !bookingJob ||
    (talentTypes.length === 0 && talentCategories.length === 0) ||
    talentTypes.some((t) => t === bookingJob || t.includes(bookingJob) || bookingJob.includes(t)) ||
    talentCategories.some((c) => c === bookingJob || c.includes(bookingJob) || bookingJob.includes(c));

  return {
    matched: locationMatch && genderMatch && jobMatch,
    locationMatch,
    genderMatch,
    jobMatch,
    debugInfo: {
      talentLocations,
      bookingCity,
      bookingStateFull,
      bookingLocation,
      talentGenders,
      bookingGender,
      talentTypes,
      talentCategories,
      bookingJob
    }
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, payload, bookingData } = body;

    if (!companyId || !payload || !payload.title || !payload.message) {
      return NextResponse.json(
        { error: "Missing required fields (companyId, payload with title & message)" },
        { status: 400 }
      );
    }

    const isCancellationNotification =
      payload.title.toLowerCase().includes("cancelled") ||
      payload.title.toLowerCase().includes("cancellation");

    if (!isCancellationNotification && bookingData && bookingData.status === "Cancelled") {
      console.log("Suppressing talent broadcast for cancelled booking");
      return NextResponse.json({ success: true, count: 0, skipped: true, reason: "Booking is cancelled" });
    }

    const hasCredentials = !!(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL)
    );

    const ids = Array.from(new Set([companyId, companyId.toLowerCase(), companyId.toUpperCase()]));
    
    // 1. Fetch all users with role 'talent' in company
    const userDocsMap = new Map<string, any>();
    for (const cid of ids) {
      try {
        const snap = await adminDb
          .collection("users")
          .where("companyId", "==", cid)
          .get();
        snap.docs.forEach((d) => {
          const userData = d.data();
          if (userData.role === "talent") {
            userDocsMap.set(d.id, userData);
          }
        });
      } catch (err) {
        console.warn(`sendNotificationToTalents users query failed for ${cid}:`, err);
      }
    }

    // 2. Fetch all talent profiles in company
    const talentDocsMap = new Map<string, any>();
    for (const cid of ids) {
      try {
        const snap = await adminDb
          .collection("talents")
          .where("companyId", "==", cid)
          .get();
        snap.docs.forEach((d) => {
          talentDocsMap.set(d.id, d.data());
        });
      } catch (err) {
        console.warn(`sendNotificationToTalents talents query failed for ${cid}:`, err);
      }
    }

    const allTalentUids = Array.from(new Set([...userDocsMap.keys(), ...talentDocsMap.keys()]));
    const evaluatedTalents: any[] = [];
    const matchingTalentsList: { uid: string; email: string; phone: string; name: string }[] = [];

    for (const uid of allTalentUids) {
      const userData = userDocsMap.get(uid) || {};
      const talentData = talentDocsMap.get(uid) || {};

      // Skip inactive (deactivated) talents
      if (userData.status === "inactive" || talentData.status === "inactive") {
        console.log(`Skipping inactive/deactivated talent ${uid} from broadcast notifications.`);
        continue;
      }

      const email = userData.email || talentData.email || "";
      const phone = userData.phoneNumber || userData.phone || userData.mobile || talentData.phoneNumber || talentData.phone || talentData.mobile || "";

      const rawLocs = talentData.locations || userData.locations || userData.coverageArea || [];
      const safeLocs = Array.isArray(rawLocs) 
        ? rawLocs.map(l => typeof l === 'string' ? l : (l.description || l.name || JSON.stringify(l)))
        : [];
      if (safeLocs.length === 0 && userData.city) safeLocs.push(userData.city);

      const rawCats = talentData.categories || userData.categories || userData.services || [];
      const safeCats = Array.isArray(rawCats)
        ? rawCats.map(c => typeof c === 'string' ? c : JSON.stringify(c))
        : [];
      if (safeCats.length === 0 && userData.talentType) safeCats.push(userData.talentType);

      const profile: TalentProfile = {
        gender: userData.gender || talentData.gender || "",
        talentType: userData.talentType || talentData.talentType || "",
        categories: safeCats,
        locations: safeLocs,
      };

      let matchResult: MatchResult = {
        matched: true,
        locationMatch: true,
        genderMatch: true,
        jobMatch: true,
        debugInfo: {}
      };

      const talentPublicName = talentData.displayName || talentData.publicName || talentData.stageName || talentData.name || userData.displayName || userData.name || "";

      if (bookingData) {
        matchResult = doesMatch(bookingData, profile);
        if (matchResult.matched) {
          matchingTalentsList.push({ uid, email, phone, name: talentPublicName });
        }
      } else {
        matchingTalentsList.push({ uid, email, phone, name: talentPublicName });
      }

      evaluatedTalents.push({
        uid,
        email: email || null,
        phone: phone || null,
        displayName: talentPublicName || null,
        matchResult
      });
    }

    // 3. Dispatch notifications
    const dispatchDetails: any[] = [];
    const notificationPromises = matchingTalentsList.map(async ({ uid, email, phone, name }) => {
      const detail: any = {
        uid,
        email,
        phone,
        dbSaved: false,
        dbError: null,
        emailResult: null,
        smsResult: null
      };

      try {
        await adminDb.collection("notifications").add({
          userId: uid,
          companyId: companyId ?? null,
          title: payload.title,
          message: payload.message,
          type: payload.type || "info",
          link: payload.link ?? null,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        detail.dbSaved = true;

        if (email) {
          const res = await sendEmailNotification(uid, payload.title, payload.message, payload.link, email, companyId, name);
          detail.emailResult = res;
        } else {
          detail.emailResult = { success: false, error: "No email address found" };
        }

        if (phone) {
          const res = await sendSmsNotification(uid, payload.title, payload.message, phone, companyId, payload.link, name);
          detail.smsResult = res;
        } else {
          detail.smsResult = { success: false, error: "No phone number found" };
        }
      } catch (err: any) {
        detail.dbError = err.message || String(err);
        console.error(`Failed to send notification to talent ${uid}:`, err);
      }
      dispatchDetails.push(detail);
    });

    await Promise.all(notificationPromises);

    return NextResponse.json({
      success: true,
      count: matchingTalentsList.length,
      hasAdminCredentials: hasCredentials,
      evaluatedCount: evaluatedTalents.length,
      evaluatedTalents,
      details: dispatchDetails
    });
  } catch (error: any) {
    console.error("Error in send-to-talents API route:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to process talent notifications",
        hasAdminCredentials: !!(
          process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
          (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL)
        )
      },
      { status: 500 }
    );
  }
}
