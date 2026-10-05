import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 md:px-8">
      <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 rounded-xl shadow-sm border border-slate-100">
        <div className="mb-8">
          <Link href="/">
            <Button variant="outline" size="sm">&larr; Back to Home</Button>
          </Link>
        </div>
        
        <h1 className="text-4xl font-extrabold tracking-tight mb-8">Privacy Policy</h1>
        
        <div className="prose prose-slate max-w-none space-y-6 text-slate-700">
          <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Last Updated: March 2026</p>
          
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900">1. Information We Collect</h2>
            <p>
              We collect information you provide directly to us, such as your name, email address, password, phone number, location, and any media or textual content you upload to your profile.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900">2. How We Use Your Information</h2>
            <p>
              We use the information we collect to provide, maintain, and improve our services, to process transactions (bookings), and to communicate with you explicitly via Email and SMS notifications regarding your account and events.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900">3. Data Sharing Within Workspaces</h2>
            <p>
              As a multi-tenant platform, your profile and booking data is securely scoped to the specific Company workspace you joined. We do not sell your personal data to third parties.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
