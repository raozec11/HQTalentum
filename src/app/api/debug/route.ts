import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export async function GET() {
  try {
     const snap = await getDocs(collection(db, 'users'));
     const users = snap.docs.map(d => ({id: d.id, ...(d.data() as any)})).filter((u: any) => u.role === 'talent');
     
     const bSnap = await getDocs(collection(db, 'bookings'));
     const bookings = bSnap.docs.map(d => ({id: d.id, ...d.data()}));
     
     const tSnap = await getDocs(collection(db, 'talents'));
     const talents = tSnap.docs.map(d => ({id: d.id, ...d.data()}));

     return NextResponse.json({ users, bookings, talents });
  } catch(e) {
     return NextResponse.json({ error: String(e) });
  }
}

