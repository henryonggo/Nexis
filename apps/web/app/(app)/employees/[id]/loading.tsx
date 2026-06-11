import { PageSkeleton, PageHeaderSkeleton, FormSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <PageHeaderSkeleton action={false} />
      <FormSkeleton fields={8} />
    </PageSkeleton>
  );
}
