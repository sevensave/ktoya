/** Выбор одного из нескольких. readOnly — для тех, кто видит, но не меняет (не хост). */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  readOnly,
  block,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange(v: T): void
  readOnly?: boolean
  block?: boolean
}) {
  return (
    <div className={`segmented ${block ? 'segmented--block' : ''} ${readOnly ? 'is-readonly' : ''}`} role="group">
      {options.map((o) => (
        <button key={String(o.id)} aria-pressed={o.id === value} disabled={readOnly} onClick={() => o.id !== value && onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
