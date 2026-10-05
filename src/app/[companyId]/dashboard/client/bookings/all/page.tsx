import { ClientBookingsView } from "@/components/client/ClientBookingsView";

export default async function AllBookingsPage(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  return <ClientBookingsView companyId={params.companyId} viewType="all" />;
}
