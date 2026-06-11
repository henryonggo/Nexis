import { PageSkeleton, PageHeaderSkeleton, CardGridSkeleton, TableSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton action={false} />
      <CardGridSkeleton count={4} columns={4} />
      <TableSkeleton columns={4} rows={6} />
    </PageSkeleton>
  );
}
