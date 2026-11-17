import { useSessions } from '@/store/sessions'
import { Tile } from '@/components/ui'
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconFolder, IconFolderSolid, IconLaptop, IconSearch } from '@/components/Icons'

export function SftpPage() {
  const newConnection = useSessions((s) => s.newConnection)
  return (
    <div className="sftp">
      <section className="fpane">
        <header className="fpane-head">
          <Tile tone="blue" size={34}>
            <IconLaptop size={18} />
          </Tile>
          <span className="fpane-title">Локальный компьютер</span>
          <span className="toolbar-spacer" />
          <button className="tool" disabled>
            <IconSearch size={17} /> Фильтр
          </button>
          <button className="tool" disabled>
            Действия <IconChevronDown size={15} />
          </button>
        </header>
        <div className="crumbs">
          <button className="icon-btn" disabled>
            <IconChevronLeft size={18} />
          </button>
          <button className="icon-btn" disabled>
            <IconChevronRight size={18} />
          </button>
          <IconFolderSolid size={20} className="crumb-folder" />
          <span>C:</span>
          <IconChevronRight size={14} className="muted" />
          <IconFolderSolid size={20} className="crumb-folder" />
          <span>/</span>
        </div>
        <div className="ftable">
          <div className="ftable-head">
            <span>Имя</span>
            <span>Изменён</span>
            <span>Размер</span>
            <span>Тип</span>
          </div>
          <div className="ftable-empty">Локальный файловый браузер, drag&amp;drop и права — шаг 3.</div>
        </div>
      </section>
      <section className="fpane remote">
        <div className="empty-state">
          <span className="empty-icon">
            <IconFolder size={26} />
          </span>
          <h3>Подключитесь к хосту</h3>
          <p>Выберите сохранённый хост, чтобы управлять файлами по SFTP.</p>
          <button className="btn-soft" onClick={newConnection}>
            Выбрать хост
          </button>
        </div>
      </section>
    </div>
  )
}
