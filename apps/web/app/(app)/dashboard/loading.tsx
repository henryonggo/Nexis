import { PageSkeleton, PageHeaderSkeleton, CardGridSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton action={false} />
      <CardGridSkeleton count={3} columns={3} />
    </PageSkeleton>
  );
}
