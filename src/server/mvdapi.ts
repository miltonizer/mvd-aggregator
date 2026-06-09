import axios, { AxiosInstance } from 'axios'

const MVD_API_URL = process.env.MVD_API_URL
if (!MVD_API_URL) {
  throw new Error('MVD_API_URL must be set in the environment')
}

export interface LoadDemoResult {
  demoId: string
  sha256: string
  fromCache: boolean
  schemaVersion: number
}

// Concurrency limiter: max N simultaneous in-flight requests
function makeLimiter(max: number) {
  let active = 0
  const queue: Array<() => void> = []
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        active++
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--
            if (queue.length > 0) queue.shift()!()
          })
      }
      if (active < max) run()
      else queue.push(run)
    })
  }
}

const limit = makeLimiter(4)

class MvdApiClient {
  private http: AxiosInstance | null = null

  private getHttp(): AxiosInstance {
    if (!this.http) {
      this.http = axios.create({ baseURL: MVD_API_URL, timeout: 120_000 })
    }
    return this.http
  }

  async loadDemo(gameId: number): Promise<LoadDemoResult> {
    const http = this.getHttp()
    const resp = await http.post<LoadDemoResult>(`/v1/demos/gameId:${gameId}`)
    return resp.data
  }

  async getDemoInfo(demoId: string): Promise<unknown> {
    const http = this.getHttp()
    const resp = await http.get(`/v1/demos/${demoId}/demoinfo`)
    return resp.data
  }

  async getFrags(demoId: string): Promise<unknown> {
    const http = this.getHttp()
    const resp = await http.get(`/v1/demos/${demoId}/frags`)
    return resp.data
  }

  async getItems(demoId: string, kinds?: string[]): Promise<unknown> {
    const http = this.getHttp()
    const params = kinds ? { kinds: kinds.join(',') } : {}
    const resp = await http.get(`/v1/demos/${demoId}/items`, { params })
    return resp.data
  }

  async getOverview(demoId: string): Promise<unknown> {
    const http = this.getHttp()
    const resp = await http.get(`/v1/demos/${demoId}/overview`)
    return resp.data
  }

  async getBackpacks(demoId: string): Promise<unknown> {
    const http = this.getHttp()
    // API returns a bare array; wrap it so consumers can do data['backpacks']
    const resp = await http.get(`/v1/demos/${demoId}/backpacks`)
    return { backpacks: resp.data }
  }

  async getWeaponPickups(demoId: string): Promise<unknown> {
    const http = this.getHttp()
    // API returns a bare array; wrap it so consumers can do data['pickups']
    const resp = await http.get(`/v1/demos/${demoId}/weapon-pickups`)
    return { pickups: resp.data }
  }

  // Rate-limited loadDemo for bulk operations
  loadDemoLimited(gameId: number): Promise<LoadDemoResult> {
    return limit(() => this.loadDemo(gameId))
  }

  // Rate-limited generic fetch for bulk operations
  fetchLimited<T>(fn: () => Promise<T>): Promise<T> {
    return limit(fn)
  }
}

export const mvdApi = new MvdApiClient()
