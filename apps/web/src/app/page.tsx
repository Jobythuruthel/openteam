export default function HomePage() {
  return (
    <main id="main" className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Open Team</h1>
      <p className="text-lg text-neutral-700 dark:text-neutral-300">
        A free, open-source home for AI creators, game developers and engineers to share work, find
        collaborators and discover transparent jobs.
      </p>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        The platform is under active development. Accounts open once authentication ships.
      </p>
    </main>
  );
}
