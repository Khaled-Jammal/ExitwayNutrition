import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = path.dirname(fileURLToPath(import.meta.url))
const processes = [
  { name: 'API', args: ['--watch', 'server.js'], env: process.env },
  { name: 'Vite', args: [path.join(projectDirectory, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1'], env: process.env },
].map(({ name, args, env }) => ({
  name,
  child: spawn(process.execPath, args, { cwd: projectDirectory, env, stdio: 'inherit' }),
}))

let stopping = false

function stopChildren() {
  for (const { child } of processes) {
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
}

for (const { name, child } of processes) {
  child.on('error', (error) => {
    console.error(`${name} failed to start:`, error)
    process.exitCode = 1
    stopping = true
    stopChildren()
  })

  child.on('exit', (code, signal) => {
    if (stopping) return
    stopping = true
    process.exitCode = code ?? (signal ? 1 : 0)
    stopChildren()
  })
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return
    stopping = true
    process.exitCode = signal === 'SIGINT' ? 130 : 0
    stopChildren()
  })
}
