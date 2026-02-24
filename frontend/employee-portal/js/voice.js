import { sendTextMessage } from './chat.js'

let mediaRecorder = null
let audioChunks   = []
let isRecording   = false
let analyser      = null
let animationFrame = null

export function initVoice() {
  const btnVoice = document.getElementById('btn-voice')

  // Mantener pulsado para grabar, soltar para enviar
  btnVoice.addEventListener('mousedown', startRecording)
  btnVoice.addEventListener('mouseup', stopRecording)
  btnVoice.addEventListener('mouseleave', stopRecording)
  btnVoice.addEventListener('touchstart', startRecording, { passive: true })
  btnVoice.addEventListener('touchend', stopRecording)
}

async function startRecording() {
  if (APP.isProcessing || isRecording) return

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    // Web Audio API para el visualizador
    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    drawVisualizer()

    // MediaRecorder
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    audioChunks = []

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data)
    }

    mediaRecorder.start(250)
    isRecording = true

    document.getElementById('btn-voice').classList.add('recording')

  } catch (error) {
    console.error('Error accediendo al micrófono:', error)
    alert('No se pudo acceder al micrófono. Verifica los permisos del navegador.')
  }
}

async function stopRecording() {
  if (!mediaRecorder || !isRecording) return
  isRecording = false

  cancelAnimationFrame(animationFrame)
  clearVisualizer()
  document.getElementById('btn-voice').classList.remove('recording')

  mediaRecorder.stop()
  mediaRecorder.stream.getTracks().forEach(track => track.stop())

  // Esperar a que finalice el recorder
  await new Promise(resolve => { mediaRecorder.onstop = resolve })

  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })

  if (audioBlob.size > 1000) {
    await sendAudioToAgent(audioBlob)
  }
}

async function sendAudioToAgent(audioBlob) {
  const arrayBuffer = await audioBlob.arrayBuffer()
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

  APP.isProcessing = true
  try {
    await fetch(`${APP.config.AGENT_URL}/audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': APP.sessionId
      },
      body: JSON.stringify({ audio: base64, mimeType: 'audio/webm' })
    })
  } catch (error) {
    console.error('Error enviando audio:', error)
    APP.isProcessing = false
  }
}

function drawVisualizer() {
  const canvas = document.getElementById('voice-visualizer')
  const ctx = canvas.getContext('2d')
  const dataArray = new Uint8Array(analyser.frequencyBinCount)

  function draw() {
    animationFrame = requestAnimationFrame(draw)
    analyser.getByteFrequencyData(dataArray)

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const barWidth = 3
    const barGap   = 2
    const bars     = Math.floor(canvas.width / (barWidth + barGap))
    const step     = Math.floor(dataArray.length / bars)

    ctx.fillStyle = '#F6821F'
    for (let i = 0; i < bars; i++) {
      const value     = dataArray[i * step] / 255
      const barHeight = value * canvas.height
      const x         = i * (barWidth + barGap)
      const y         = (canvas.height - barHeight) / 2
      ctx.fillRect(x, y, barWidth, barHeight)
    }
  }
  draw()
}

function clearVisualizer() {
  const canvas = document.getElementById('voice-visualizer')
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}
