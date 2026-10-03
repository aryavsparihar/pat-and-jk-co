/**
 * Runs the server's masked e-Aadhaar check (src/kyc/aadhaarCheck.ts) on a real file, on your own
 * machine, to confirm it before the check is ever made enforcing (docs/KYC.md#verification).
 *
 *   pnpm kyc:check-aadhaar /path/to/masked-eaadhaar.pdf
 *
 * It asks for the PDF's password, the last four digits, the name on the PAN and the date of
 * birth, with typing hidden, keeps them in memory, and prints only the result, the reasons (which
 * never contain a value from the file) and the signer. It writes nothing and sends nothing.
 */
import { readFileSync } from 'node:fs'
import readline from 'node:readline'

import { checkMaskedAadhaar } from '../src/kyc/aadhaarCheck'

/** Answers piped in (for trying it on made-up fixtures), read once */
let piped: string[] | null = null
const nextPiped = async (): Promise<string> => {
  if (!piped) {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
    piped = Buffer.concat(chunks).toString('utf8').split('\n')
  }
  return (piped.shift() ?? '').trim()
}

const ask = (question: string): Promise<string> =>
  !process.stdin.isTTY
    ? nextPiped()
    : new Promise((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          terminal: true,
        }) as readline.Interface & {
          _writeToOutput: (s: string) => void
          output: NodeJS.WriteStream
        }
        rl._writeToOutput = (s: string) => {
          if (s.includes(question)) rl.output.write(question)
        }
        rl.question(question, (answer) => {
          rl.close()
          process.stdout.write('\n')
          resolve(answer.trim())
        })
      })

const file = process.argv[2]
if (!file) {
  console.log('Usage: pnpm kyc:check-aadhaar /path/to/masked-eaadhaar.pdf')
  process.exit(1)
}

const bytes = readFileSync(file)
console.log(
  '\nTyping is hidden for every answer. Leave the password empty to skip reading inside.\n',
)
const password = await ask('PDF password: ')
const last4 = await ask('Last four Aadhaar digits: ')
const panName = await ask('Name as on the PAN: ')
const dateOfBirth = await ask('Date of birth (YYYY-MM-DD): ')

const check = await checkMaskedAadhaar({
  file: bytes,
  password: password || undefined,
  last4,
  panName,
  dateOfBirth,
})

console.log(`\nResult: ${check.result}`)
for (const reason of check.reasons) console.log(`  - ${reason}`)
if (check.signer)
  console.log(`Signed by: ${check.signer}${check.signedOn ? ` on ${check.signedOn}` : ''}`)
console.log('\nNothing was saved, and nothing above contains your details.\n')
