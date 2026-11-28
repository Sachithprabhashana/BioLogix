import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from './src/config/prisma'

async function main() {
    const adminHash = await bcrypt.hash('Admin123!', 12)
    const empHash = await bcrypt.hash('Employee123!', 12)

    await prisma.user.update({
        where: { employeeCode: 'EMP001' },
        data: { passwordHash: adminHash },
    })

    await prisma.user.update({
        where: { employeeCode: 'EMP002' },
        data: { passwordHash: empHash },
    })

    console.log('Updated bcrypt passwords for EMP001 and EMP002')
    process.exit(0)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})