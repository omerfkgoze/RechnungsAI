import { DelayedLoading } from "@/components/layout/delayed-loading";
import { Skeleton } from "@/components/ui/skeleton";

export default function ArchivLoading() {
  return (
    <DelayedLoading>
      <Skeleton className="mb-4 h-12 w-full motion-reduce:animate-none" />
      <Skeleton className="mb-4 h-32 w-full motion-reduce:animate-none" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full motion-reduce:animate-none" />
        <Skeleton className="h-16 w-full motion-reduce:animate-none" />
        <Skeleton className="h-16 w-full motion-reduce:animate-none" />
        <Skeleton className="h-16 w-full motion-reduce:animate-none" />
        <Skeleton className="h-16 w-full motion-reduce:animate-none" />
      </div>
    </DelayedLoading>
  );
}
