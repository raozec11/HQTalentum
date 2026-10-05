"use client";

import { useState, use } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { UserRole } from "@/context/AuthContext";

export default function RegisterPage(props: { params: Promise<{ companyId: string }> }) {
  const params = use(props.params);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("client");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Create user document in Firestore bound to this company
      await setDoc(doc(db, "users", user.uid), {
        name,
        email,
        role,
        companyId: params.companyId.toLowerCase(),
        createdAt: new Date().toISOString()
      });

      // Route based on role
      if (role === "admin" || role === "staff") {
        router.push(`/${params.companyId}/dashboard/admin`);
      } else if (role === "talent") {
        router.push(`/${params.companyId}/dashboard/talent`);
      } else if (role === "client") {
        router.push(`/${params.companyId}/dashboard/client`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to register");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">Registration</CardTitle>
          <CardDescription>
            Join company: <span className="font-mono text-blue-600">{params.companyId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            {error && <div className="p-3 bg-red-100 text-red-600 rounded-md text-sm">{error}</div>}
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">I am a...</label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-300 bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                value={role || "client"}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                <option value="client">Client (Looking to book talent)</option>
                <option value="talent">Talent (Looking for gigs)</option>
                {/* Normally staff/admin registration would be hidden or invite-only, exposing it here for MVP simplicity */}
                <option value="staff">Staff Member</option>
              </select>
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Register"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center flex-col space-y-2 text-sm text-slate-500">
          <div>
            Already have an account?{" "}
            <Link href={`/${params.companyId}/login`} className="text-blue-600 hover:underline">
              Sign in here
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
