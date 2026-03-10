import LoginCard from "./ui/LoginCard";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-primary/10 border border-primary/20">
            <span className="font-semibold text-primary">CW</span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use email (confirmation code) or Google to access the portal.
          </p>
        </div>
        <LoginCard />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing, you agree to use this data for operational purposes only.
        </p>
      </div>
    </div>
  );
}

