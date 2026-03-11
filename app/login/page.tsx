import LoginCard from "./ui/LoginCard";

// This page uses useSearchParams() in a client component; force dynamic rendering
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-3">
            {/* Inline SVG so it renders even if external SVGs are blocked by CORP/CSP. */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 1337.11 243.2"
              className="h-8 w-auto text-foreground"
              aria-label="Clearway"
              role="img"
            >
              <title>Clearway</title>
              <g fill="currentColor">
                <path d="M121.6,0A121.6,121.6,0,1,0,243.2,121.6,121.74,121.74,0,0,0,121.6,0ZM104.23,222.05a101.7,101.7,0,0,1-49.48-23.56c35.58-29.25,73.75-46.34,105.39-56.29a163.11,163.11,0,0,0-36.07,38.27A155.1,155.1,0,0,0,104.23,222.05ZM121.6,19.64a102.09,102.09,0,0,1,101.09,88.91H184.63a63.38,63.38,0,0,0-126.11,0h-38A102.09,102.09,0,0,1,121.6,19.64Zm43.24,88.91H78.3a43.74,43.74,0,0,1,86.54,0Zm-145,19.64H139.6a330.1,330.1,0,0,0-98.39,56A101.41,101.41,0,0,1,19.87,128.19Zm104.53,95.3c7.56-22.13,31.33-70.35,98.67-92A102.1,102.1,0,0,1,124.4,223.49Z" />
                <path d="M372.12,158.83c-9.89,9.72-20.3,13.53-33,13.53-24.82,0-45.47-14.92-45.47-45.29s20.65-45.29,45.47-45.29c12.14,0,21.51,3.47,30.88,12.67l-13.36,14.06a25.94,25.94,0,0,0-17.18-6.77c-14.23,0-24.64,10.41-24.64,25.33,0,16.31,11.11,25,24.3,25,6.76,0,13.53-1.91,18.74-7.11Z" />
                <path d="M402.51,48.46v121.3h-21V48.46Z" />
                <path d="M439.14,134.53c1.39,10.59,10.59,18.22,25.51,18.22,7.81,0,18-2.94,22.9-8l13.54,13.36c-9,9.37-23.78,13.89-36.79,13.89-29.5,0-47-18.22-47-45.64,0-26,17.7-44.77,45.47-44.77,28.63,0,46.51,17.7,43.21,52.92ZM485.64,117c-1.38-11.11-10.06-16.66-22.21-16.66-11.45,0-20.82,5.55-23.94,16.66Z" />
                <path d="M590.14,84.21h20.3v85.55h-20l-1-12.49c-4.86,10.06-18.23,14.92-27.77,15.09-25.34.18-44.08-15.44-44.08-45.46,0-29.5,19.61-44.94,44.6-44.77,11.45,0,22.39,5.38,27.25,13.88ZM538.77,126.9c0,16.31,11.28,26,25.34,26,33.31,0,33.31-51.89,0-51.89C550.05,101,538.77,110.59,538.77,126.9Z" />
                <path d="M648,84.21l1.56,9.89C656.11,83.52,665,82,673.63,82c8.85,0,17.36,3.46,22,8.15l-9.54,18.4c-4.34-3.65-8.33-5.56-15.27-5.56-11.11,0-21.35,5.9-21.35,21.69v45.12H628.34V84.21Z" />
                <path d="M780.3,84,799,148.42,818.65,84h23.43l-29.85,86.07H787.59l-8.85-25.34-7.64-28.63-7.63,28.63-8.85,25.34H730L700,84h23.6l19.61,64.38L761.73,84Z" />
                <path d="M918.89,84.21H939.2v85.55h-20l-1-12.49c-4.86,10.06-18.22,14.92-27.76,15.09-25.34.18-44.08-15.44-44.08-45.46C846.36,97.4,866,82,891,82.13c11.45,0,22.38,5.38,27.24,13.88ZM867.53,126.9c0,16.31,11.28,26,25.34,26,33.31,0,33.31-51.89,0-51.89C878.81,101,867.53,110.59,867.53,126.9Z" />
                <path d="M1046.53,84.21l-52.24,121.3H971l16-37.14L952.82,84.21h24.64l13,37,8.15,24.12,8.86-23.6,15.61-37.48Z" />
              </g>
            </svg>
            <div className="h-6 w-px bg-border/70" />
            <div className="flex items-center gap-2">
              <img
                src="/logo.png"
                alt="Verxyl"
                className="hidden sm:block h-7 w-auto opacity-90"
              />
              <span className="text-xs font-semibold tracking-[0.35em] uppercase text-foreground/80">
                VERXYL
              </span>
            </div>
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

