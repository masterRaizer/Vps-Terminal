/** Turns ssh2 / socket errors into one clear Russian sentence. */
export function humanizeSshError(e: unknown, host?: string): string {
  const err = e as NodeJS.ErrnoException & { level?: string }
  const msg = err?.message ?? String(e)
  const where = host ? ` (${host})` : ''
  if (/Host denied|verification failed/i.test(msg)) return `Подключение отменено: ключ сервера${where} не подтверждён`
  if (/Timed out while waiting for handshake/i.test(msg))
    return `Сервер${where} не ответил на SSH-рукопожатие за 20 с: sshd завис или соединение режется по пути (провайдер, файрвол)`
  if (/before handshake|banner/i.test(msg)) return `Соединение оборвалось до SSH-рукопожатия${where}: сервер не прислал приветствие`
  if (/All configured authentication methods failed/i.test(msg)) return `Сервер${where} не принял ни ключ, ни пароль (проверьте пользователя и authorized_keys)`
  switch (err?.code) {
    case 'ECONNREFUSED':
      return `Порт закрыт${where}: на нём не работает SSH`
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `Имя хоста не найдено${where}`
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `Хост недоступен${where}: нет маршрута`
    case 'ETIMEDOUT':
      return `Нет ответа${where}: таймаут TCP-подключения`
    case 'ECONNRESET':
      return `Соединение сброшено${where}`
  }
  return msg
}
