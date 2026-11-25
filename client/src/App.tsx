import { useEffect, useState } from 'react'

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
          <div className="flex items-center gap-2">
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
            <button
              onClick={handleTestCheckIn}
              className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-4 py-2 text-sm cursor-pointer"
            >
              Test Check-In
            </button>
          </div>
        </header>

        {statusMessage && (
          <div className="rounded-lg bg-slate-900 border border-slate-800 px-4 py-2.5 text-sm text-emerald-300">
            {statusMessage}
          </div>
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