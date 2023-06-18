import type { Response } from 'node-fetch'
import fetch from 'node-fetch'
import type CloudflareDnsRecord from '../types/CloudflareDnsRecord.d'
import type CloudflareResponse from '../types/CloudflareResponse.d'
import type CloudflareZone from '../types/CloudflareZone.d'

/**
 * Verify an API token with Cloudflare.
 *
 * @param {string} token - The API token to verify.
 *
 * @returns {Promise<boolean>} - Whether the token is valid.
 * @throws {Error} - If the request fails.
 */
export const verifyToken = async (token: string): Promise<boolean> => {
  try {
    request('GET', 'user/tokens/verify', undefined, undefined, token, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Get all zones from Cloudflare.
 *
 * @returns {Promise<object[]>} - The zones.
 */
export const getZones = async (): Promise<CloudflareZone[]> => {
  return await request<CloudflareZone[]>('GET', 'zones')
}

/**
 * Get all DNS records for a zone from Cloudflare.
 *
 * @param {string} zoneId - The zone ID to use.
 */
export const getRecords = async (zoneId: string): Promise<CloudflareDnsRecord[]> => {
  return await request<CloudflareDnsRecord[]>('GET', `zones/${zoneId}/dns_records`)
}

/**
 * Get all Zones with their DNS records from Cloudflare.
 *
 * @returns {Promise<any>} - The Cloudflare data.
 */
export const getZonesAndRecords = async (): Promise<(CloudflareZone & { records: CloudflareDnsRecord[] })[]> => {
  const zones = await getZones()
  const data: (CloudflareZone & { records: CloudflareDnsRecord[] })[] = []

  for (const zone of zones) {
    const zoneRecords = await getRecords(zone.id)
    data.push({ ...zone, records: zoneRecords })
  }

  return data
}

/**
 * Send authenticated requests to the Cloudflare API.
 */
let cache: Map<string, { result: any; time: Date }> = new Map()
const request = async <T>(method: string, endpoint: string, headers?: object, body?: object, token?: string, cacheTimeSeconds: number = 60 * 5): Promise<T> => {
  const cacheExists = cache.has(endpoint)
  const cacheExpired = cacheExists && cache.get(endpoint)!.time.getTime() < Date.now() - 1000 * cacheTimeSeconds
  if (cacheExists && !cacheExpired) return cache.get(endpoint)!.result

  const response = await retriedRequest(method, endpoint, headers, body, token)

  if (!response) throw new Error('Failed to send request to Cloudflare API.')
  if (!response.ok) throw new Error(`Failed to send request to Cloudflare API on path ${endpoint} with status ${response.status}.`)

  const json = (await response.json()) as CloudflareResponse<T>

  if (cacheTimeSeconds > 0) cache.set(endpoint, { result: json.result, time: new Date() })
  return json.result
}

/**
 * Send multiple requests to the Cloudflare API until one succeeds
 * or the maximum number of tries is reached.
 */
const retriedRequest = async (method: string, endpoint: string, headers?: object, body?: object, token?: string) => {
  let response: Response | undefined
  let tries = 0

  while (!response && tries < 10) {
    try {
      response = await fetch(`https://api.cloudflare.com/client/v4/${endpoint}`, {
        method,
        headers: {
          'Authorization': `Bearer ${token ?? API_KEY}`,
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify(body)
      })
    } catch (err) {
      tries++
      continue
    }
  }

  return response
}

/**
 * Load the API key from the .env file.
 */
const API_KEY = await (async () => {
  // Get the API key from the environment variables.
  const API_KEY = process.env.CLOUDFLARE_API_KEY
  if (!API_KEY) {
    console.error('No Cloudflare API key found in environment variables.')
    process.exit(1)
  }

  // Verify the API key.
  const valid = await verifyToken(API_KEY)
  if (!valid) {
    console.error('Invalid Cloudflare API key.')
    process.exit(1)
  }

  return API_KEY
})()
