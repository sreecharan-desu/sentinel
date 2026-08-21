export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6">
      <h1 className="font-display text-4xl font-medium tracking-tight text-primary">
        Not found
      </h1>
      <p className="mt-3 text-secondary">That page does not exist.</p>
      <a
        href="/"
        className="mt-8 inline-flex h-11 w-fit items-center rounded-full bg-primary px-5 text-sm font-medium text-background"
      >
        Back home
      </a>
    </main>
  );
}
