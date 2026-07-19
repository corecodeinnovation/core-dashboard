export default function HomePage() {
  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="font-mono text-sm text-cci-slate">homelab CCI</p>
      <h1 className="font-display text-4xl font-semibold sm:text-5xl">
        Core <span className="text-cci-orange">Dashboard</span>
      </h1>
      <p className="max-w-md text-cci-muted">
        Panel de control del homelab en tiempo real. Estado de servicios, logs y métricas — en
        construcción.
      </p>
      <div className="rounded-cci border border-cci-line bg-cci-surface px-4 py-2 shadow-cci">
        <p className="font-mono text-xs text-cci-muted">
          ws: <span className="text-cci-warn">offline</span> · sprint 0
        </p>
      </div>
    </section>
  );
}
