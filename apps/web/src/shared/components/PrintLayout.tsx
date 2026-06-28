import type { ReactNode } from 'react';

interface PrintLayoutProps {
  title?: string;
  children: ReactNode;
}

export function PrintLayout({ title, children }: PrintLayoutProps) {
  return (
    <div className="print:block hidden">
      {title && (
        <header className="mb-4 border-b pb-2">
          <h1 className="text-lg font-semibold">{title}</h1>
        </header>
      )}
      {children}
    </div>
  );
}

/**
 * Wraps content that should be visible both on screen AND in print.
 * Apply `no-print` class to elements that should hide when printing.
 */
export function Printable({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}