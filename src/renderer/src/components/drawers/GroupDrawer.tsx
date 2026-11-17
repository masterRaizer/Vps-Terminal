import { useState } from 'react'
import { HOST_COLORS, type GroupInput } from '@shared/vault'
import { groupPath, useVault } from '@/store/vault'
import { Drawer, Field } from '../ui'
import { IconTrash } from '../Icons'

export function GroupDrawer({ groupId, parentId }: { groupId?: string; parentId?: string | null }) {
  const { groups, saveGroup, deleteGroup, edit } = useVault()
  const existing = groupId ? groups.find((g) => g.id === groupId) : undefined
  const [form, setForm] = useState<GroupInput>(() =>
    existing ? { id: existing.id, name: existing.name, parentId: existing.parentId, color: existing.color } : { name: '', parentId: parentId ?? null, color: null }
  )
  const [error, setError] = useState<string>()
  const [confirmDelete, setConfirmDelete] = useState(false)

  // A group cannot be moved under itself or its descendants.
  const blocked = new Set<string>()
  if (existing) for (const g of groups) if (groupPath(g.id, groups).some((p) => p.id === existing.id)) blocked.add(g.id)

  const save = async (): Promise<void> => {
    try {
      const g = await saveGroup(form)
      edit({ kind: 'group', id: g.id })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Drawer
      title={existing ? 'Группа' : 'Новая группа'}
      onClose={() => edit(null)}
      actions={
        existing && (
          <button
            className={`icon-btn ${confirmDelete ? 'danger' : ''}`}
            title={confirmDelete ? 'Нажмите ещё раз: хосты переедут в родительскую группу' : 'Удалить группу'}
            onClick={() => (confirmDelete ? void deleteGroup(existing.id) : setConfirmDelete(true))}
            onBlur={() => setConfirmDelete(false)}
            type="button"
          >
            <IconTrash size={18} />
          </button>
        )
      }
      footer={
        <button className="btn-cta" type="button" onClick={() => void save()}>
          Сохранить
        </button>
      }
    >
      <form
        className="drawer-form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <section className="drawer-group">
          <Field label="Название" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus={!existing} placeholder="Production" />
          <label className="field">
            <span className="field-label">Родительская группа</span>
            <span className="field-row">
              <select value={form.parentId ?? ''} onChange={(e) => setForm({ ...form, parentId: e.target.value || null })}>
                <option value="">Верхний уровень</option>
                {groups
                  .filter((g) => !blocked.has(g.id))
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {groupPath(g.id, groups).map((x) => x.name).join(' / ')}
                    </option>
                  ))}
              </select>
            </span>
          </label>
          <div className="swatches">
            {HOST_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={(form.color ?? HOST_COLORS[0]) === c ? 'on' : ''}
                style={{ background: c }}
                onClick={() => setForm({ ...form, color: c === HOST_COLORS[0] ? null : c })}
                aria-label={c}
              />
            ))}
          </div>
        </section>
        {error && <div className="form-error">{error}</div>}
        <button type="submit" hidden />
      </form>
    </Drawer>
  )
}
