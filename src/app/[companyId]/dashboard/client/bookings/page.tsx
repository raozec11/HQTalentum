import { redirect } from "next/navigation";

export default async function ClientBookingsRoot(props: { params: Promise<{ companyId: string }> }) {
  const params = await props.params;
  redirect(`/${params.companyId}/dashboard/client/bookings/pending`);
}
