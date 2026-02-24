let contentEl = null

export function initTranscription() {
  contentEl = document.getElementById('transcription-content')
}

export function handleTranscriptionChunk(data) {
  if (!contentEl) return

  // Limpiar placeholder
  contentEl.querySelector('.panel-empty')?.remove()

  const block = document.createElement('div')
  block.className = 'transcription-block'
  block.innerHTML = `
    <div>${escapeHtml(data.text)}</div>
    ${data.confidence ? `<div class="transcription-confidence">Confianza: ${Math.round(data.confidence * 100)}%</div>` : ''}
  `
  contentEl.appendChild(block)
  contentEl.scrollTop = contentEl.scrollHeight

  // Actualizar badge de confianza en el header
  const badge = document.getElementById('transcription-confidence')
  if (badge && data.confidence) {
    badge.textContent = `${Math.round(data.confidence * 100)}%`
  }
}

function escapeHtml(str) {
  return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
