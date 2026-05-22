#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import { Client } from 'ssh2'

const SSH_HOST = process.env.SSH_HOST
const SSH_PORT = Number(process.env.SSH_PORT || 22)
const SSH_USER = process.env.SSH_USER
const SSH_KEY_PATH = process.env.SSH_KEY_PATH

function requireConfig() {
  const missing = []
  if (!SSH_HOST) missing.push('SSH_HOST')
  if (!SSH_USER) missing.push('SSH_USER')
  if (!SSH_KEY_PATH) missing.push('SSH_KEY_PATH')
  if (missing.length) {
    throw new Error(`Missing MCP SSH environment variables: ${missing.join(', ')}`)
  }
}

async function connect() {
  requireConfig()
  const privateKey = await readFile(SSH_KEY_PATH, 'utf8')

  return new Promise((resolve, reject) => {
    const client = new Client()
    client
      .on('ready', () => resolve(client))
      .on('error', reject)
      .connect({
        host: SSH_HOST,
        port: SSH_PORT,
        username: SSH_USER,
        privateKey,
        readyTimeout: 20000
      })
  })
}

async function runCommand(command, cwd = '') {
  const client = await connect()
  const safeCommand = cwd ? `cd ${shellQuote(cwd)} && ${command}` : command

  return new Promise((resolve, reject) => {
    client.exec(safeCommand, { pty: false }, (error, stream) => {
      if (error) {
        client.end()
        reject(error)
        return
      }

      let stdout = ''
      let stderr = ''
      let exitCode = null

      stream
        .on('close', (code) => {
          exitCode = code
          client.end()
          resolve({ exitCode, stdout, stderr })
        })
        .on('data', (data) => {
          stdout += data.toString()
        })

      stream.stderr.on('data', (data) => {
        stderr += data.toString()
      })
    })
  })
}

async function uploadTextFile(path, content, mode = '0644') {
  const client = await connect()

  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error) {
        client.end()
        reject(error)
        return
      }

      const stream = sftp.createWriteStream(path, { mode: Number.parseInt(mode, 8) })
      stream.on('error', (streamError) => {
        client.end()
        reject(streamError)
      })
      stream.on('close', () => {
        client.end()
        resolve({ path, bytes: Buffer.byteLength(content), mode })
      })
      stream.end(content)
    })
  })
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

const server = new Server(
  {
    name: 'fone-vps-mcp',
    version: '0.1.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'run_command',
      description: 'Run a shell command on the configured fone-vps server over SSH.',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Shell command to execute.'
          },
          cwd: {
            type: 'string',
            description: 'Optional working directory on the remote server.'
          }
        },
        required: ['command']
      }
    },
    {
      name: 'upload_text_file',
      description: 'Upload a UTF-8 text file to the configured fone-vps server over SFTP.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute remote file path.'
          },
          content: {
            type: 'string',
            description: 'Text content to upload.'
          },
          mode: {
            type: 'string',
            description: 'Unix file mode, default 0644.'
          }
        },
        required: ['path', 'content']
      }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params

  if (name === 'run_command') {
    const result = await runCommand(args.command, args.cwd)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ],
      isError: result.exitCode !== 0
    }
  }

  if (name === 'upload_text_file') {
    const result = await uploadTextFile(args.path, args.content, args.mode || '0644')
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    }
  }

  throw new Error(`Unknown tool: ${name}`)
})

const transport = new StdioServerTransport()
await server.connect(transport)
