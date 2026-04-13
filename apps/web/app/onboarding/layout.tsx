export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Centered, no AppShell. Pages render their own <OnboardingStepper /> so
  // layouts don't need to read the current segment.
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">{children}</div>
    </main>
  );
}
