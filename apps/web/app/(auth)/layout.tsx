import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 pt-10 pb-8">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-8 block text-center text-h3 font-semibold text-foreground"
          >
            RechnungsAI
          </Link>
          {children}
        </div>
      </div>
      <footer className="border-t border-border py-4 text-center text-body-sm text-muted-foreground">
        🇩🇪 Gehostet in Deutschland · DSGVO · GoBD
      </footer>
    </main>
  );
}
