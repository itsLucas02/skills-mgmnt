export default function Loading() {
  return (
    <main className="min-h-svh bg-background">
      <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
        <div className="h-20 animate-pulse rounded-lg bg-muted/30" />
        <div className="h-12 w-72 animate-pulse rounded-lg bg-muted/30" />
        <div className="h-96 animate-pulse rounded-lg bg-muted/20" />
      </section>
    </main>
  )
}
