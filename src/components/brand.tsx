import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';

/** Full chaJoy logo. Swaps to the white-lettered version in dark mode. */
export function BrandLogo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex shrink-0 items-center', className)} aria-label="chaJoy loyality">
      <Image src="/brand/chajoy-logo-light.png" alt="" width={2172} height={724} priority className="h-10 w-auto dark:hidden md:h-12" />
      <Image src="/brand/chajoy-logo-dark.png" alt="" width={2172} height={724} priority className="hidden h-10 w-auto dark:block md:h-12" />
    </Link>
  );
}

/** Round badge logo, used as the app icon and for small marks. */
export function BrandIcon({ size = 40, className }: { size?: number; className?: string }) {
  return <Image src="/brand/chajoy-icon.png" alt="chaJoy loyality" width={size} height={size} className={className} />;
}
