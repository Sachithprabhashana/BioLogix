import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { WebcamCapture } from './components/WebcamCapture'

const OFFLINE_QUEUE_KEY = 'biologix_offline_queue_v1'
const AUTH_TOKEN_KEY = 'biologix_auth_token_v1'
const AUTH_USER_KEY = 'biologix_auth_user_v1'

interface User {
  id: string
  employeeCode: string
  fullName: string
  email: string
  role: 'ADMIN' | 'EMPLOYEE'
  biometricHash?: string | null
}

interface AttendanceRecord {
  id: string
  userId: string
  checkInTime: string
  checkOutTime?: string | null
  totalHours?: number | null
  latitude: number | null
  longitude: number | null
  confidenceScore: number | null
  status: string
  isOfflineSync: boolean
  user?: {
    employeeCode: string
    fullName: string
    email: string
  }
}

interface OfflineQueuedCheckIn {
  id: string
  employeeCode: string
  checkInTime: string
  latitude: number | null
  longitude: number | null
  confidenceScore: number | null
  status: 'OFFLINE_QUEUED'
  isOfflineSync: true
}

function readOfflineQueue(): OfflineQueuedCheckIn[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeOfflineQueue(items: OfflineQueuedCheckIn[]) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items))
  } catch (err) {
    console.error('Failed to save offline queue:', err)
  }
}

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

export function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(AUTH_TOKEN_KEY)
  )
  const [currentUser, setCurrentUser] = useState<User | null>(() =>
    readStoredUser()
  )
  const [loginIdentifier, setLoginIdentifier] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [authError, setAuthError] = useState('')

  const [users, setUsers] = useState<User[]>([])
  const [logs, setLogs] = useState<AttendanceRecord[]>([])
  const [selectedCode, setSelectedCode] = useState(
    () => readStoredUser()?.employeeCode || 'EMP001'
  )
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [showAddUser, setShowAddUser] = useState(false)
  const [employeeCode, setEmployeeCode] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('Employee123')
  const [role, setRole] = useState<'EMPLOYEE' | 'ADMIN'>('EMPLOYEE')
  const [enrollingFace, setEnrollingFace] = useState(false)

  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedCheckIn[]>(() =>
    readOfflineQueue()
  )
  const [syncingQueue, setSyncingQueue] = useState(false)

  const isAdmin = currentUser?.role === 'ADMIN'
  const activeEmployeeCode = isAdmin
    ? selectedCode
    : currentUser?.employeeCode || selectedCode

  const handleLogout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
    setToken(null)
    setCurrentUser(null)
    setUsers([])
    setLogs([])
    setStatusMessage('')
  }, [])

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const headers = new Headers(init.headers)
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      const res = await fetch(input, { ...init, headers })
      if (res.status === 401) {
        handleLogout()
      }
      return res
    },
    [token, handleLogout]
  )

  function enqueueOfflineCheckIn(
    code: string,
    confidenceScore: number | null = null
  ) {
    const item: OfflineQueuedCheckIn = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      employeeCode: code,
      checkInTime: new Date().toISOString(),
      latitude: 6.7951,
      longitude: 79.9009,
      confidenceScore,
      status: 'OFFLINE_QUEUED',
      isOfflineSync: true,
    }

    setOfflineQueue((prev) => {
      const next = [...prev, item]
      writeOfflineQueue(next)
      setStatusMessage(
        `Offline: queued check-in for ${code} (${next.length} pending sync).`
      )
      return next
    })
  }

  const loadDashboardData = useCallback(async () => {
    if (!token || !currentUser) return
    setLoading(true)
    try {
      const logsRes = await authFetch('/api/attendance')
      const logsJson = await logsRes.json()
      if (Array.isArray(logsJson.data)) {
        const allLogs: AttendanceRecord[] = logsJson.data
        setLogs(
          currentUser.role === 'ADMIN'
            ? allLogs
            : allLogs.filter(
              (log) =>
                log.user?.employeeCode === currentUser.employeeCode ||
                log.userId === currentUser.id
            )
        )
      }

      if (currentUser.role === 'ADMIN') {
        const usersRes = await authFetch('/api/users')
        const usersJson = await usersRes.json()
        if (Array.isArray(usersJson.data)) setUsers(usersJson.data)
      }
    } catch {
      setStatusMessage('Could not reach backend API on port 5000.')
    } finally {
      setLoading(false)
    }
  }, [token, currentUser, authFetch])

  const syncOfflineQueue = useCallback(
    async (queueToSync?: OfflineQueuedCheckIn[]) => {
      if (!token) return
      const currentQueue = queueToSync ?? readOfflineQueue()
      if (currentQueue.length === 0 || syncingQueue) return

      setSyncingQueue(true)
      try {
        const remaining: OfflineQueuedCheckIn[] = []
        let syncedCount = 0

        for (const item of currentQueue) {
          try {
            const res = await authFetch('/api/attendance/check-in', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                employeeCode: item.employeeCode,
                checkInTime: item.checkInTime,
                latitude: item.latitude,
                longitude: item.longitude,
                confidenceScore: item.confidenceScore,
                status: 'OFFLINE_QUEUED',
                isOfflineSync: true,
              }),
            })

            if (res.ok) {
              syncedCount += 1
            } else {
              remaining.push(item)
            }
          } catch {
            remaining.push(item)
          }
        }

        setOfflineQueue(remaining)
        writeOfflineQueue(remaining)

        if (syncedCount > 0) {
          setStatusMessage(
            `Synced ${syncedCount} offline check-in${syncedCount > 1 ? 's' : ''} to server.`
          )
          await loadDashboardData()
        }
      } finally {
        setSyncingQueue(false)
      }
    },
    [token, syncingQueue, authFetch, loadDashboardData]
  )

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    const identifier = loginIdentifier.trim()
    if (!identifier || !loginPassword) {
      setAuthError('Please enter your email (or employee code) and password.')
      return
    }

    setLoggingIn(true)
    setAuthError('')
    try {
      const payload = identifier.includes('@')
        ? { email: identifier, password: loginPassword }
        : { employeeCode: identifier, password: loginPassword }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok || !data.token || !data.user) {
        setAuthError(data.message || 'Invalid credentials.')
        return
      }

      localStorage.setItem(AUTH_TOKEN_KEY, data.token)
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user))
      setToken(data.token)
      setCurrentUser(data.user)
      setSelectedCode(data.user.employeeCode)
      setLoginPassword('')
    } catch {
      setAuthError('Could not connect to server on port 5000.')
    } finally {
      setLoggingIn(false)
    }
  }

  async function handleAiCheckIn() {
    if (!selectedFile) {
      setStatusMessage('Please choose an image first.')
      return
    }

    if (!navigator.onLine) {
      enqueueOfflineCheckIn(activeEmployeeCode)
      return
    }

    setStatusMessage('Verifying image with AI service...')
    try {
      const formData = new FormData()
      formData.append('employeeCode', activeEmployeeCode)
      formData.append('latitude', '6.7951')
      formData.append('longitude', '79.9009')
      formData.append('image', selectedFile)

      const res = await authFetch('/api/attendance/verify-check-in', {
        method: 'POST',
        body: formData,
      })
      const result = await res.json()

      if (!res.ok) {
        setStatusMessage(result.message || 'AI check-in failed.')
        return
      }

      const score = result.data?.confidenceScore ?? '—'
      const logStatus = result.data?.status ?? 'REVIEW'
      setStatusMessage(
        `AI Check-In saved (${logStatus}, confidence: ${score}) for ${activeEmployeeCode}.`
      )
      await loadDashboardData()
    } catch {
      enqueueOfflineCheckIn(activeEmployeeCode)
    }
  }

  async function handleTestCheckIn() {
    if (!navigator.onLine) {
      enqueueOfflineCheckIn(activeEmployeeCode, 0.96)
      return
    }

    setStatusMessage('Recording check-in...')
    try {
      const res = await authFetch('/api/attendance/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeCode: activeEmployeeCode,
          latitude: 6.7951,
          longitude: 79.9009,
          confidenceScore: 0.96,
          status: 'VERIFIED',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatusMessage(data.message || 'Check-in failed.')
        return
      }
      setStatusMessage(`Check-in recorded for ${activeEmployeeCode}.`)
      await loadDashboardData()
    } catch {
      enqueueOfflineCheckIn(activeEmployeeCode, 0.96)
    }
  }

  async function handleCheckOut() {
    if (!activeEmployeeCode) return

    setStatusMessage('Recording check-out...')
    try {
      const res = await authFetch('/api/attendance/check-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeCode: activeEmployeeCode }),
      })

      const data = await res.json()
      if (!res.ok) {
        setStatusMessage(data.error || data.message || 'Check-out failed.')
        return
      }

      setStatusMessage(data.message || `Checked out ${activeEmployeeCode}.`)
      await loadDashboardData()
    } catch {
      setStatusMessage('Network error while checking out.')
    }
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault()

    if (!employeeCode.trim() || !fullName.trim() || !email.trim()) {
      setStatusMessage('Please fill in Employee Code, Full Name, and Email.')
      return
    }

    setStatusMessage('Creating employee...')
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeCode: employeeCode.trim(),
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          role,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setStatusMessage(data.message || 'Could not create employee.')
        return
      }

      const createdCode = data.data?.employeeCode || employeeCode.trim()
      setEmployeeCode('')
      setFullName('')
      setEmail('')
      setPassword('Employee123')
      setShowAddUser(false)
      setSelectedCode(createdCode)
      setStatusMessage(`Added employee ${createdCode}.`)
      await loadDashboardData()
    } catch {
      setStatusMessage('Network error while creating employee.')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setSelectedFile(file)
    if (file) {
      setPhotoPreview(URL.createObjectURL(file))
    } else {
      setPhotoPreview(null)
    }
  }

  useEffect(() => {
    if (token && currentUser) {
      void loadDashboardData()
    }
  }, [token, currentUser, loadDashboardData])

  useEffect(() => {
    const onOnline = () => {
      const pending = readOfflineQueue()
      if (pending.length > 0 && token) {
        void syncOfflineQueue(pending)
      }
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [syncOfflineQueue, token])

  const handleEnrollFace = async () => {
    if (!activeEmployeeCode) {
      setStatusMessage('Please select an employee first.')
      return
    }

    if (!selectedFile) {
      setStatusMessage('Please choose a photo or capture from the webcam first.')
      return
    }

    try {
      setEnrollingFace(true)
      setStatusMessage('')

      const formData = new FormData()
      formData.append('image', selectedFile)

      const res = await authFetch(
        `/api/users/${encodeURIComponent(activeEmployeeCode)}/enroll-face`,
        {
          method: 'POST',
          body: formData,
        }
      )

      const data = await res.json()

      if (!res.ok || data.status === 'error') {
        setStatusMessage(data.message || 'Failed to enroll face.')
        return
      }

      setStatusMessage(data.message || `Face enrolled for ${activeEmployeeCode}`)

      if (data.user) {
        setUsers((prev) =>
          prev.map((u) =>
            u.employeeCode === data.user.employeeCode
              ? { ...u, biometricHash: data.user.biometricHash }
              : u
          )
        )
      }
    } catch (err) {
      console.error('Enroll face error:', err)
      setStatusMessage('Error connecting to server while enrolling face.')
    } finally {
      setEnrollingFace(false)
    }
  }

  if (!token || !currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4"
        >
          <div>
            <h1 className="text-2xl font-bold tracking-tight">BioLogix</h1>
            <p className="text-sm text-slate-400">
              Sign in with your email or employee code
            </p>
          </div>

          {authError && (
            <div className="rounded-lg bg-rose-500/15 border border-rose-500/40 px-3 py-2 text-sm text-rose-300">
              {authError}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">
              Email or Employee Code
            </label>
            <input
              type="text"
              placeholder="EMP001 or admin@biologix.com"
              value={loginIdentifier}
              onChange={(e) => setLoginIdentifier(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loggingIn}
            className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold py-2.5 text-sm disabled:opacity-50 cursor-pointer"
          >
            {loggingIn ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">BioLogix</h1>
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${isAdmin
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'bg-sky-500/20 text-sky-300'
                  }`}
              >
                {currentUser.role}
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Signed in as {currentUser.fullName} ({currentUser.employeeCode})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? (
              <select
                value={selectedCode}
                onChange={(e) => setSelectedCode(e.target.value)}
                className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
              >
                {users.length > 0 ? (
                  users.map((u) => (
                    <option key={u.id} value={u.employeeCode}>
                      {u.employeeCode} — {u.fullName}
                    </option>
                  ))
                ) : (
                  <option value={currentUser.employeeCode}>
                    {currentUser.employeeCode}
                  </option>
                )}
              </select>
            ) : (
              <span className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm font-mono text-emerald-400">
                {currentUser.employeeCode}
              </span>
            )}

            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="text-xs text-slate-300 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-100 hover:file:bg-slate-700 cursor-pointer"
            />

            <button
              type="button"
              onClick={handleAiCheckIn}
              className="rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold px-4 py-2 text-sm cursor-pointer"
            >
              AI Verify Check-In
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={handleEnrollFace}
                disabled={enrollingFace}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50 cursor-pointer"
              >
                {enrollingFace ? 'Enrolling...' : 'Enroll Face'}
              </button>
            )}

            <button
              type="button"
              onClick={handleTestCheckIn}
              className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-4 py-2 text-sm cursor-pointer"
            >
              Test Check-In
            </button>

            {offlineQueue.length > 0 && (
              <button
                type="button"
                onClick={() => void syncOfflineQueue()}
                disabled={syncingQueue}
                className="rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold px-4 py-2 text-sm disabled:opacity-50 cursor-pointer"
              >
                {syncingQueue
                  ? 'Syncing...'
                  : `Sync Offline (${offlineQueue.length})`}
              </button>
            )}

            <button
              type="button"
              onClick={handleCheckOut}
              className="rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold px-4 py-2 text-sm cursor-pointer"
            >
              Check-Out
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAddUser((prev) => !prev)}
                className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold px-3.5 py-2 text-sm cursor-pointer"
              >
                {showAddUser ? 'Close Form' : '+ Add Employee'}
              </button>
            )}

            <WebcamCapture
              onPhotoCaptured={(file, previewUrl) => {
                setSelectedFile(file)
                setPhotoPreview(previewUrl)
                setStatusMessage(
                  'Webcam photo captured. Click "AI Verify Check-In" to submit.'
                )
              }}
              onCameraError={(msg) => setStatusMessage(msg)}
            />

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-medium px-3 py-2 text-sm cursor-pointer"
            >
              Logout
            </button>

            {photoPreview && (
              <div className="mt-2 flex items-center gap-3">
                <img
                  src={photoPreview}
                  alt="Selected check-in preview"
                  className="h-20 w-20 rounded-lg border border-slate-700 object-cover"
                />
                <span className="text-xs text-slate-400">
                  {selectedFile?.name} ready for AI verification
                </span>
              </div>
            )}
          </div>
        </header>

        {statusMessage && (
          <div className="rounded-lg bg-slate-900 border border-slate-800 px-4 py-2.5 text-sm text-emerald-300">
            {statusMessage}
          </div>
        )}

        {isAdmin && showAddUser && (
          <form
            onSubmit={handleCreateUser}
            className="rounded-xl bg-slate-900 border border-slate-800 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3"
          >
            <input
              type="text"
              placeholder="Code (e.g. EMP002)"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            />
            <select
              value={role}
              onChange={(e) =>
                setRole(e.target.value === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE')
              }
              className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
            >
              <option value="EMPLOYEE">EMPLOYEE</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <button
              type="submit"
              className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-4 py-2 text-sm cursor-pointer"
            >
              Save Employee
            </button>
          </form>
        )}

        {isAdmin && (
          <section className="rounded-xl bg-slate-900 border border-slate-800 p-4">
            <h2 className="text-base font-semibold mb-3">
              Employees ({users.length})
            </h2>
            {loading ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 pr-4">Code</th>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Role</th>
                      <th className="py-2">Biometrics</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="py-2 pr-4 font-mono text-emerald-400">
                          {u.employeeCode}
                        </td>
                        <td className="py-2 pr-4">{u.fullName}</td>
                        <td className="py-2 pr-4 text-slate-300">{u.email}</td>
                        <td className="py-2 pr-4">{u.role}</td>
                        <td className="py-2">
                          {u.biometricHash ? (
                            <span className="rounded bg-emerald-500/20 px-2 py-1 text-xs font-medium text-emerald-400">
                              Enrolled
                            </span>
                          ) : (
                            <span className="rounded bg-slate-700/60 px-2 py-1 text-xs font-medium text-slate-400">
                              Not Enrolled
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <section className="rounded-xl bg-slate-900 border border-slate-800 p-4">
          <h2 className="text-base font-semibold mb-3">
            {isAdmin
              ? `Attendance Logs (${logs.length})`
              : `My Attendance Logs (${logs.length})`}
          </h2>
          {loading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 pr-4">Employee</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Confidence</th>
                    <th className="py-2 pr-4">Check-In Time</th>
                    <th className="py-2 pr-4">Check-Out Time</th>
                    <th className="py-2 pr-4">Hours</th>
                    <th className="py-2">Offline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-4">
                        {log.user?.employeeCode ?? log.userId} —{' '}
                        {log.user?.fullName ?? 'Employee'}
                      </td>
                      <td className="py-2 pr-4 text-emerald-400">{log.status}</td>
                      <td className="py-2 pr-4">
                        {log.confidenceScore ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-slate-300">
                        {new Date(log.checkInTime).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-slate-300">
                        {log.checkOutTime
                          ? new Date(log.checkOutTime).toLocaleString()
                          : 'Active'}
                      </td>
                      <td className="py-2 pr-4 text-amber-300">
                        {log.totalHours !== null && log.totalHours !== undefined
                          ? `${log.totalHours} hrs`
                          : '—'}
                      </td>
                      <td className="py-2">
                        {log.isOfflineSync ? (
                          <span className="rounded bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-300">
                            Synced
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default App