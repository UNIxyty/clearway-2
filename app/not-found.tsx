import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CompassIcon, HomeIcon } from "lucide-react";

export default function NotFound() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background p-4 sm:p-6 lg:p-10 flex items-center justify-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.14),transparent_40%),radial-gradient(circle_at_80%_20%,hsl(var(--accent)/0.12),transparent_40%),radial-gradient(circle_at_50%_80%,hsl(var(--muted-foreground)/0.08),transparent_50%)]" />
      <Card className="relative w-full max-w-2xl border-border/70 bg-card/95 backdrop-blur-sm shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <img
              src="/header_logo_white.svg"
              alt="Clearway"
              className="h-8 sm:h-10 w-auto object-contain opacity-90"
              style={{ filter: "invert(1)" }}
            />
            <img src="/logo.png" alt="Verxyl" className="h-8 sm:h-10 w-auto object-contain opacity-90" />
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
            <CompassIcon className="size-3.5" />
            Error 404
          </div>
          <CardTitle className="text-xl sm:text-2xl">Page not found</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            The page you are looking for does not exist or was moved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-lg border border-border/60 bg-background/70 p-4 text-muted-foreground">
            Please check the URL or go back to the home page.
          </div>
          <Button asChild type="button" variant="outline" className="gap-2">
            <Link href="/">
              <HomeIcon className="size-4" />
              Go to home
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
