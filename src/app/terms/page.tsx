import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 md:px-8">
      <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 rounded-xl shadow-sm border border-slate-100">
        <div className="mb-8">
          <Link href="/">
            <Button variant="outline" size="sm">&larr; Back to Home</Button>
          </Link>
        </div>
        
        <h1 className="text-4xl font-extrabold tracking-tight mb-8">Terms of Service</h1>
        
        <div className="prose prose-slate max-w-none space-y-6 text-slate-700">
          <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Last Updated: March 2026</p>
          
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900">1. Acceptance of Terms</h2>
            <p>
              By accessing and using Talentum ("the Platform"), you accept and agree to be bound by the terms and provision of this agreement.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900">2. Multi-Tenant Use</h2>
            <p>
              Talentum operates as a multi-tenant platform. Companies register workspaces, and Users (Clients, Talents, Staff) operate within those bounded contexts. You agree not to attempt to access data outside your designated Company workspace.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900">3. Booking & Payments</h2>
            <p>
              All bookings made through the platform are binding agreements between the Client and the Talent/Company. Platform administration takes no responsibility for missed events or disputes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900">4. User Content</h2>
            <p>
              Talents are responsible for the media (photos, videos, text) they upload. By uploading, you grant Talentum and your associated Company a license to display this media publicly via the Directory.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
