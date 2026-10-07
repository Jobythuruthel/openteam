import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-24">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-4">
        <Link className="underline" href="/">
          Go to the home page
        </Link>
      </p>
    </main>
  );
}
