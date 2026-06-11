import { PageSkeleton, PageHeaderSkeleton, FormSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton action={false} />
      <FormSkeleton fields={4} />
    </PageSkeleton>
  );
}
