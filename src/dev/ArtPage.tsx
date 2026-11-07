/* ArtPage — dev-only (/__kit/art, DESIGN.md §20c).
 *
 * Every scene, light and dark, at the size it ships and at half of it, so a new
 * drawing can be compared against the other seven instead of argued about in a
 * pull request. Not in the bundle: main.tsx imports this inside
 * `import.meta.env.DEV`.
 */
import { SCENES, type SceneName } from '../components/art/Scenes';

const NAMES: { key: SceneName; label: string; where: string }[] = [
  { key: 'waiting', label: 'Waiting', where: 'Send screen, before the other device joins' },
  { key: 'connected', label: 'Connected', where: 'the moment a room comes up' },
  { key: 'emptyRoom', label: 'EmptyRoom', where: 'a room with nothing in it yet' },
  { key: 'offline', label: 'Offline', where: 'the banner and the offline screen' },
  { key: 'codeExpired', label: 'CodeExpired', where: 'a six-digit code that ran out' },
  { key: 'roomEnded', label: 'RoomEnded', where: 'after End session' },
  { key: 'notFound', label: 'NotFound', where: 'the 404' },
  { key: 'arrived', label: 'Arrived', where: 'a transfer that landed' },
];

export function ArtPage() {
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-8 px-5 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] font-semibold tracking-tight text-apple-ink dark:text-white">Beacon</h1>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60">
          Eight scenes, one character, four colours. Dev only.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        {NAMES.map(({ key, label, where }) => {
          const Scene = SCENES[key];
          return (
            <figure key={key} className="flex flex-col gap-2">
              <div className="flex items-center justify-center rounded-[14px] border border-apple-divider bg-white p-3 text-apple-ink dark:border-white/10 dark:bg-night-800 dark:text-white">
                <Scene />
              </div>
              <figcaption className="text-[12px] leading-snug text-apple-ink-muted dark:text-white/55">
                <span className="font-semibold text-apple-ink dark:text-white">{label}</span>
                <br />
                {where}
              </figcaption>
            </figure>
          );
        })}
      </div>

      {/* Dark plate: the same eight on the dark surface, because the palette is
          two sets of four and only a look can confirm they match. */}
      <div className="rounded-[18px] bg-night-900 p-6">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {NAMES.map(({ key }) => {
            const Scene = SCENES[key];
            return (
              <div key={key} className="flex items-center justify-center text-white/80">
                <Scene size={104} />
              </div>
            );
          })}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-apple-ink-muted dark:text-white/40">
          Half size
        </h2>
        <div className="flex flex-wrap items-center gap-4 text-apple-ink dark:text-white">
          {NAMES.map(({ key }) => {
            const Scene = SCENES[key];
            return (
              <div key={key}>
                <Scene size={72} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
