import Image from "next/image";
import { MeshStatusIndicator } from "./mesh-status";

export function Header() {
  return (
    <header className="border-b border-black bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5">
        <div className="flex items-center gap-4">
          <Image
            src="/logo.png"
            alt="Delphi Duel"
            width={160}
            height={40}
            priority
            // The image is the wordmark; height is the size that matters.
            // width is a starting hint; the actual rendered width is whatever
            // the image's intrinsic aspect ratio dictates at h-10 (40px).
            className="h-10 w-auto"
          />
          <p className="hidden text-xs text-gray-600 sm:block">
            get a second opinion before you bet
          </p>
        </div>
        <MeshStatusIndicator />
      </div>
    </header>
  );
}
