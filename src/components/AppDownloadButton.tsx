import { Download, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

const APK_URL = '/downloads/mt-kalisungan.apk';

type AppDownloadButtonProps = {
  floating?: boolean;
};

export default function AppDownloadButton({ floating = false }: AppDownloadButtonProps) {
  if (floating) {
    return (
      <a
        href={APK_URL}
        download
        aria-label="Download Android app"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-40 inline-flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:right-6 sm:h-auto sm:w-auto sm:gap-2 sm:px-5 sm:py-3"
      >
        <Download className="h-5 w-5" />
        <span className="hidden text-sm font-semibold sm:inline">Download App</span>
      </a>
    );
  }

  return (
    <Button asChild className="gap-2 shrink-0">
      <a href={APK_URL} download>
        <Smartphone className="h-4 w-4" />
        Download App
      </a>
    </Button>
  );
}
