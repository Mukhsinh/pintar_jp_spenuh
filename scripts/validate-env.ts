import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
]

const optionalEnvVars = [
  'NODE_ENV',
  'VERCEL_URL',
  'VERCEL_ENV'
]

function validateEnvironment() {
  console.log('🔍 Validating environment variables...')

  const missing: string[] = []
  const present: string[] = []

  // Check required variables
  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      present.push(envVar)
    } else {
      missing.push(envVar)
    }
  }

  // Report results
  console.log(`✅ Present (${present.length}):`)
  present.forEach(env => console.log(`   - ${env}`))

  if (optionalEnvVars.some(env => process.env[env])) {
    console.log(`ℹ️  Optional:`)
    optionalEnvVars
      .filter(env => process.env[env])
      .forEach(env => console.log(`   - ${env}: ${process.env[env]}`))
  }

  if (missing.length > 0) {
    console.log(`❌ Missing (${missing.length}):`)
    missing.forEach(env => console.log(`   - ${env}`))
    console.log('\n💡 Create .env.local file with required variables')
    process.exit(1)
  }

  console.log('✅ All required environment variables are present!')
}

if (require.main === module) {
  validateEnvironment()
}

export { validateEnvironment }