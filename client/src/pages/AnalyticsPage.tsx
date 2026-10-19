import { Activity, ArrowUpRight, Bot, Clock3, Target } from 'lucide-react';

const metrics = [
  { label: 'Engagement', value: '92%', icon: Activity },
  { label: 'AI coverage', value: '87%', icon: Bot },
  { label: 'Follow-up speed', value: '1.4x', icon: Clock3 },
  { label: 'Goal completion', value: '79%', icon: Target },
];

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">Analytics</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Performance and collaboration insights</h1>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon }) => (
            <div key={label} className="glass rounded-3xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">{label}</span>
                <Icon className="h-5 w-5 text-sky-300" />
              </div>
              <p className="mt-6 text-3xl font-bold text-white">{value}</p>
              <div className="mt-3 flex items-center gap-1 text-xs text-emerald-300">
                <ArrowUpRight className="h-3.5 w-3.5" />
                +12% vs prior period
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="glass rounded-3xl p-6">
            <h2 className="text-xl font-semibold text-white">Monthly trend</h2>
            <div className="mt-6 flex h-52 items-end gap-3">
              {[45, 52, 66, 58, 72, 81, 92].map((height, index) => (
                <div key={index} className="flex flex-1 items-end justify-center">
                  <div className="w-full rounded-t-2xl bg-gradient-to-t from-sky-600 to-cyan-400" style={{ height: `${height}%` }} />
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-3xl p-6">
            <h2 className="text-xl font-semibold text-white">AI-generated insights</h2>
            <ul className="mt-6 space-y-4 text-sm text-slate-200">
              <li className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">Launch readiness rose 18% because action items were assigned within 24 hours.</li>
              <li className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">Decision velocity improves when meeting summaries are reviewed within the same day.</li>
              <li className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">The product team is spending 12% less time in follow-up meetings after AI summaries are shared.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
