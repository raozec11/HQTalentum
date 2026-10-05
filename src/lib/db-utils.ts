import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc, setDoc, addDoc, updateDoc } from "firebase/firestore";

// Normalize companyId to lowercase so ACE === ace === Ace throughout the app
export const normalizeCompanyId = (companyId: string) => companyId.toLowerCase();

// Helper strictly enforces company boundary in queries

export const getCompanyUsers = async (companyId: string) => {
  const id = normalizeCompanyId(companyId);
  const q = query(collection(db, "users"), where("companyId", "==", id));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getCompanyTalents = async (companyId: string) => {
  const id = normalizeCompanyId(companyId);
  const q = query(collection(db, "talents"), where("companyId", "==", id));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getCompanyBookings = async (companyId: string) => {
  const id = normalizeCompanyId(companyId);
  const q = query(collection(db, "bookings"), where("companyId", "==", id));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Generic create with companyId enforcement - always stores lowercase companyId
export const createCompanyDocument = async (collectionName: string, companyId: string, data: any) => {
  return await addDoc(collection(db, collectionName), {
    ...data,
    companyId: normalizeCompanyId(companyId),
    createdAt: new Date().toISOString()
  });
};
