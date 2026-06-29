import { PageSkeleton, PageHeaderSkeleton, CardGridSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton action={false} />
      {/* 4 consolidated KPI tiles, then a 6-card company grid. */}
      <CardGridSkeleton count={4} columns={4} />
      <CardGridSkeleton count={6} columns={3} />
    </PageSkeleton>
  );
}
