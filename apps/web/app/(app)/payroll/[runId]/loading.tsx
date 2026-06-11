import { PageSkeleton, PageHeaderSkeleton, CardGridSkeleton, TableSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton />
      <CardGridSkeleton count={3} columns={3} />
      <TableSkeleton columns={6} rows={8} />
    </PageSkeleton>
  );
}
