import { TopBar } from '../ui'

export function ComingSoon({ title, phase, text }: { title: string; phase: string; text: string }) {
  return (
    <>
      <TopBar title={title} back="/" />
      <div className="panel stack">
        <div className="eyebrow">Phase {phase} · being built next</div>
        <p>{text}</p>
      </div>
    </>
  )
}
