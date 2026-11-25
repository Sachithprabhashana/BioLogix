import { type FormEvent, useEffect, useState } from 'react'

interface User {
  id: string
  employeeCode: string
  fullName: string
  email: string
  role: string
}

interface AttendanceRecord {
  id: string
  userId: string
  checkInTime: string
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

export function App() {
  const [users, setUsers] = useState<User[]>([])
  const [logs, setLogs] = useState<AttendanceRecord[]>([])
  const [selectedCode, setSelectedCode] = useState('EMP001')
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const [showAddUser, setShowAddUser] = useState(false)
  const [employeeCode, setEmployeeCode] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('Employee123')
  const [role, setRole] = useState<'EMPLOYEE' | 'ADMIN'>('EMPLOYEE')

  async function loadDashboardData() {
    setLoading(true)
    try {
      const [usersRes, logsRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/attendance'),
      ])
      const usersJson = await usersRes.json()
      const logsJson = await logsRes.json()

      if (Array.isArray(usersJson.data)) setUsers(usersJson.data)
      if (Array.isArray(logsJson.data)) setLogs(logsJson.data)
    } catch {
      setStatusMessage('Could not reach backend API on port 5000.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAiCheckIn() {
    if (!selectedFile) {
      setStatusMessage('Please choose an image first.')
      return
    }

    setStatusMessage('Verifying image with AI service...')
    try {
      const formData = new FormData()
      formData.append('employeeCode', selectedCode)
      formData.append('latitude', '6.7951')
      formData.append('longitude', '79.9009')
      formData.append('image', selectedFile)

      const res = await fetch('/api/attendance/verify-check-in', {
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
        `AI Check-In saved (${logStatus}, confidence: ${score}) for ${selectedCode}.`
      )
      await loadDashboardData()
    } catch {
      setStatusMessage('Network error during AI check-in.')
    }
  }

  async function handleTestCheckIn() {
    setStatusMessage('Recording check-in...')
    try {
      const res = await fetch('/api/attendance/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeCode: selectedCode,
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
      setStatusMessage(`Check-in recorded for ${selectedCode}.`)
      await loadDashboardData()
    } catch {
      setStatusMessage('Network error while checking in.')
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
      const res = await fetch('/api/users', {
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

  useEffect(() => {
    loadDashboardData()
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">BioLogix</h1>
            <p className="text-sm text-slate-400">
              Attendance &amp; Employee Dashboard
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
                <option value="EMP001">EMP001</option>
              )}
            </select>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="text-xs text-slate-300 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-100 hover:file:bg-slate-700 cursor-pointer"
            />

            <button
              type="button"
              onClick={handleAiCheckIn}
              className="rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold px-4 py-2 text-sm cursor-pointer"
            >
              AI Verify Check-In
            </button>

            <button
              type="button"
              onClick={handleTestCheckIn}
              className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-4 py-2 text-sm cursor-pointer"
            >
              Test Check-In
            </button>

            <button
              type="button"
              onClick={() => setShowAddUser((prev) => !prev)}
              className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold px-3.5 py-2 text-sm cursor-pointer"
            >
              {showAddUser ? 'Close Form' : '+ Add Employee'}
            </button>
          </div>
        </header>

        {statusMessage && (
          <div className="rounded-lg bg-slate-900 border border-slate-800 px-4 py-2.5 text-sm text-emerald-300">
            {statusMessage}
          </div>
        )}

        {showAddUser && (
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
                    <th className="py-2">Role</th>
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
                      <td className="py-2">{u.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl bg-slate-900 border border-slate-800 p-4">
          <h2 className="text-base font-semibold mb-3">
            Attendance Logs ({logs.length})
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
                    <th className="py-2">Check-In Time</th>
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
                      <td className="py-2 text-slate-300">
                        {new Date(log.checkInTime).toLocaleString()}
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