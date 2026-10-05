"use client";

import { useState, useEffect, use } from "react";
import { getCompanyTalents } from "@/lib/db-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Briefcase } from "lucide-react";
import Link from "next/link";

export default function DirectoryPage(props: { params: Promise<{ companyId: string }> }) {
  const params = use(props.params);
  const [talents, setTalents] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTalents() {
      try {
        const data = await getCompanyTalents(params.companyId);
        setTalents(data);
      } catch (err) {
        console.error("Failed to load talents", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTalents();
  }, [params.companyId]);

  const filteredTalents = talents.filter((t) => 
    t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.service?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.location?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b py-6 px-4 md:px-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Talent Directory</h1>
            <p className="text-slate-500">Find the perfect performer for your event with {params.companyId}.</p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Link href={`/${params.companyId}/login`}>
              <Button variant="outline">Sign In</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto py-8 px-4 md:px-8 space-y-6">
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input 
            className="pl-9"
            placeholder="Search by name, service, or location..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500">Loading talents...</div>
        ) : filteredTalents.length === 0 ? (
           <div className="py-12 text-center text-slate-500 bg-white rounded-lg border border-dashed">
             No talents found matching your search.
           </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredTalents.map((talent) => (
              <Card key={talent.id} className="hover:shadow-md transition-shadow">
                <div className="h-48 bg-slate-200 w-full overflow-hidden">
                  {/* Photo placeholder or image */}
                  {talent.photoUrl ? (
                    <img src={talent.photoUrl} alt={talent.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">No Photo</div>
                  )}
                </div>
                <CardHeader className="pb-2">
                  <CardTitle>{talent.name}</CardTitle>
                  <CardDescription className="flex items-center gap-1 mt-1">
                    <Briefcase className="h-3 w-3" /> {talent.service || "Entertainer"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-2 text-sm text-slate-600 flex items-center gap-1">
                   <MapPin className="h-3 w-3" /> {talent.location || "Anywhere"}
                </CardContent>
                <CardFooter>
                  <Link href={`/${params.companyId}/book/${talent.id}`} className="w-full">
                    <Button variant="default" className="w-full">Book Now</Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
