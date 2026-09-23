import Link from 'next/link';

const LINKS = [
  { href: '/live', label: 'LIVE' },
  { href: '/prospects', label: 'Prospects' },
  { href: '/calls', label: 'Historique' },
  { href: '/knowledge', label: 'Méthode' },
];

export default function Nav({ current }: { current: string }) {
  return (
    <header className="border-b border-[var(--color-line)] bg-[var(--color-panel)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/live" className="text-sm font-bold tracking-[0.2em]">
          AWC LIVE
        </Link>

        <nav className="order-2 flex w-full flex-wrap gap-1 sm:w-auto sm:flex-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                current === l.href
                  ? 'bg-[var(--color-panel-2)] text-white'
                  : 'text-[var(--color-muted)] hover:text-white'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
