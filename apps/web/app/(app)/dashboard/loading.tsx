import { DelayedLoading } from "@/components/layout/delayed-loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <DelayedLoading>
      <Skeleton className="mb-4 h-20 w-full motion-reduce:animate-none" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-24 w-full motion-reduce:animate-none" />
        <Skeleton className="h-24 w-full motion-reduce:animate-none" />
        <Skeleton className="h-24 w-full motion-reduce:animate-none" />
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <Skeleton className="h-16 w-full motion-reduce:animate-none" />
        <Skeleton className="h-16 w-full motion-reduce:animate-none" />
        <Skeleton className="h-16 w-full motion-reduce:animate-none" />
        <Skeleton className="h-16 w-full motion-reduce:animate-none" />
      </div>
    </DelayedLoading>
  );
}
