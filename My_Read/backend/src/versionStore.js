import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

import { getPool } from './db.js'

const VERSIONS_FILE = path.join(config.dataDir, 'app-versions.json')

async function mysqlPool() {
  return getPool()
}

function ensureDataDir() {
  fs.mkdirSync(config.dataDir, { recursive: true })
}

function readVersionsFromFile() {
  try {
    if (!fs.existsSync(VERSIONS_FILE)) return []
    return JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf8'))
  } catch (error) {
    console.warn(`Failed to read local versions file: ${error.message}`)
    return []
  }
}

function writeVersionsToFile(versions) {
  ensureDataDir()
  fs.writeFileSync(VERSIONS_FILE, `${JSON.stringify(versions, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

export async function getLatestVersion() {
  const pool = await mysqlPool()
  if (pool) {
    const [rows] = await pool.execute('SELECT * FROM my_read_app_versions ORDER BY version_code DESC LIMIT 1')
    if (rows && rows.length > 0) {
      const row = rows[0]
      return {
        id: row.id,
        versionName: row.version_name,
        versionCode: row.version_code,
        releaseNotes: row.release_notes,
        apkUrl: row.apk_url,
        isForceUpdate: Boolean(row.is_force_update),
        createdAt: row.created_at?.toISOString?.() || row.created_at
      }
    }
    return null
  }

  const versions = readVersionsFromFile()
  if (!versions.length) return null
  // Return the one with highest versionCode
  return versions.reduce((latest, current) => current.versionCode > latest.versionCode ? current : latest, versions[0])
}

export async function saveVersion(version) {
  const pool = await mysqlPool()
  if (pool) {
    await pool.execute(
      `INSERT INTO my_read_app_versions
        (id, version_name, version_code, release_notes, apk_url, is_force_update, created_at)
       VALUES
        (:id, :versionName, :versionCode, :releaseNotes, :apkUrl, :isForceUpdate, NOW())`,
      {
        id: version.id,
        versionName: version.versionName,
        versionCode: version.versionCode,
        releaseNotes: version.releaseNotes,
        apkUrl: version.apkUrl,
        isForceUpdate: version.isForceUpdate ? 1 : 0
      }
    )
    return
  }

  const versions = readVersionsFromFile()
  versions.push(version)
  writeVersionsToFile(versions)
}
