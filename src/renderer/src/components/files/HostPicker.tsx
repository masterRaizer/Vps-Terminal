import { useState } from 'react'
import { useVault } from '@/store/vault'
import { useSftp } from '@/store/sftp'
import { Card } from '../ui'
import { IconSearch, IconServer } from '../Icons'

export function HostPicker() {
  const { picking, setPicking, connect } = useSftp()
  const hosts = useVault((s) => s.hosts)
  const [q, setQ] = useState('')
  if (!picking) return null
  const list = hosts.filter((h) => !q || `${h.label} ${h.address} ${h.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPicking(false)}>
      <div className="modal picker-modal" onKeyDown={(e) => e.key === 'Escape' && setPicking(false)}>
        <h2>Выберите хост</h2>
        <label className="rc-input wide">
          <IconSearch size={15} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" />
        </label>
        <div className="picker-list">
          {list.map((h) => (
            <Card key={h.id} icon={<IconServer size={20} />} tone={h.color ?? undefined} flag={h.country} title={h.label} subtitle={`${h.username}@${h.address}`} onClick={() => void connect(h)} />
          ))}
          {!list.length && <p className="hint">Нет сохранённых хостов — добавьте их в «Хранилище».</p>}
        </div>
      </div>
    </div>
  )
}
