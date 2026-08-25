import { useState, useEffect } from 'react';
import { Download, Smartphone, Apple, Share, PlusSquare, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

const APK_URL = '/downloads/mt-kalisungan.apk';

type AppDownloadButtonProps = {
  floating?: boolean;
};

export default function AppDownloadButton({ floating = false }: AppDownloadButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isApple = /iphone|ipad|ipod/.test(userAgent) || 
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    setIsIOS(isApple);
  }, []);

  const handleButtonClick = (e: React.MouseEvent) => {
    if (isIOS) {
      e.preventDefault();
      setModalOpen(true);
    }
    // On Android / Desktop, default to opening modal or direct download
  };

  return (
    <>
      {floating ? (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-label="Download or Install Mobile App"
          className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-40 inline-flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:right-6 sm:h-auto sm:w-auto sm:gap-2 sm:px-5 sm:py-3"
        >
          <Download className="h-5 w-5" />
          <span className="hidden text-sm font-semibold sm:inline">Get App</span>
        </button>
      ) : (
        <Button
          type="button"
          onClick={() => setModalOpen(true)}
          className="gap-2 shrink-0"
        >
          <Smartphone className="h-4 w-4" />
          Get App
        </Button>
      )}

      {/* Download / Installation Guide Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-bold">Install Mt. Kalisungan App</DialogTitle>
              {isIOS ? (
                <Badge className="bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30 gap-1 text-xs">
                  <Apple className="h-3.5 w-3.5" /> iOS / iPhone
                </Badge>
              ) : (
                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 text-xs">
                  <Smartphone className="h-3.5 w-3.5" /> Android APK
                </Badge>
              )}
            </div>
            <DialogDescription className="text-xs">
              Install the mobile app on your smartphone for real-time tracking, offline trail maps, and QR permits.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* iOS Instructions */}
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 font-bold text-sm">
                <Apple className="h-4 w-4 shrink-0" />
                <span>For iPhone & iPad Users (PWA App)</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Apple allows installing web applications directly to your home screen with zero app store downloads:
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2.5 bg-background/60 p-2.5 rounded-xl border border-border/40">
                  <div className="grid h-6 w-6 place-items-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 shrink-0 font-bold text-[11px]">
                    1
                  </div>
                  <div>
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      Tap the <Share className="h-3.5 w-3.5 text-sky-500" /> Share Button
                    </p>
                    <p className="text-[11px] text-muted-foreground">In Safari bottom toolbar, tap the square share icon with arrow up.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 bg-background/60 p-2.5 rounded-xl border border-border/40">
                  <div className="grid h-6 w-6 place-items-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 shrink-0 font-bold text-[11px]">
                    2
                  </div>
                  <div>
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      Select <PlusSquare className="h-3.5 w-3.5 text-sky-500" /> "Add to Home Screen"
                    </p>
                    <p className="text-[11px] text-muted-foreground">Scroll down the share sheet and tap "Add to Home Screen".</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 bg-background/60 p-2.5 rounded-xl border border-border/40">
                  <div className="grid h-6 w-6 place-items-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 shrink-0 font-bold text-[11px]">
                    3
                  </div>
                  <div>
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      Tap <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> "Add"
                    </p>
                    <p className="text-[11px] text-muted-foreground">The Mt. Kalisungan app will launch like a native iOS application!</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Android Direct APK */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-sm">
                <Smartphone className="h-4 w-4 shrink-0" />
                <span>For Android Devices</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Download the standalone Android application package (.APK) directly to your device:
              </p>
              <Button asChild className="w-full gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-md">
                <a href={APK_URL} download>
                  <Download className="h-4 w-4" />
                  Download Android APK (.apk)
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
