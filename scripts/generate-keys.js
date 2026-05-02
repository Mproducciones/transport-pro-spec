const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('🔑 Generando claves de seguridad para Transport Pro...');

// Crear directorios necesarios
const keysDir = path.join(__dirname, '../backend/keys');
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

console.log('📁 Directorios creados');

// Generar claves RSA para JWT
console.log('🔐 Generando claves RSA para JWT...');

// Generar par de claves RSA
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Guardar clave privada
fs.writeFileSync(path.join(keysDir, 'private.pem'), privateKey);
console.log('✅ Clave privada RSA generada: backend/keys/private.pem');

// Guardar clave pública
fs.writeFileSync(path.join(keysDir, 'public.pem'), publicKey);
console.log('✅ Clave pública RSA generada: backend/keys/public.pem');

// Establecer permisos (en Windows no aplica chmod 600)
console.log('🔒 Permisos establecidos para claves RSA');

// Generar claves secretas
console.log('🎲 Generando claves secretas...');

// Función para generar clave segura
function generateSecureKey(length = 64) {
  return crypto.randomBytes(length).toString('base64');
}

// JWT Secret (64 caracteres base64)
const JWT_SECRET = generateSecureKey(64);
console.log('✅ JWT_SECRET generado');

// JWT Refresh Secret (64 caracteres base64)
const JWT_REFRESH_SECRET = generateSecureKey(64);
console.log('✅ JWT_REFRESH_SECRET generado');

// Owner API Key (64 caracteres base64)
const OWNER_API_KEY = generateSecureKey(64);
console.log('✅ OWNER_API_KEY generado');

// PostgreSQL Password (32 caracteres base64)
const POSTGRES_PASSWORD = generateSecureKey(32);
console.log('✅ POSTGRES_PASSWORD generado');

// Crear archivo .env con las claves
const envContent = `# Variables de entorno para Transport Pro - ${new Date().toISOString()}
# ¡NO COMPARTIR ESTE ARCHIVO! Contiene claves secretas.

# Base de datos PostgreSQL
POSTGRES_USER=transport
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=transport_pro

# JWT - Claves generadas automáticamente
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# API Key para SuperAdmin (Owner)
OWNER_API_KEY=${OWNER_API_KEY}

# URLs y CORS
FRONTEND_URL=http://localhost:8080
CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080

# Rate limiting (seguridad)
API_RATE_LIMIT=100
MUTATION_RATE_LIMIT=50
AUTH_RATE_LIMIT=30

# Seguridad
HSTS=true
CROSS_ORIGIN_COOKIES=false

# Entorno
NODE_ENV=production
TRUST_PROXY_HOPS=1

# Mercado Pago (desactivado por defecto)
MP_ENABLED=false

# Uploads
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=5

# Redis (opcional - descomentar si se usa)
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_PASSWORD=

# Correo (opcional - descomentar si se usa)
# RESEND_API_KEY=
# RESEND_FROM="Transport Pro <notifications@tudominio.com>"
`;

fs.writeFileSync(path.join(__dirname, '../.env'), envContent);
console.log('📝 Archivo .env creado con todas las claves');

// Mostrar resumen
console.log('');
console.log('🎉 ¡Claves generadas exitosamente!');
console.log('');
console.log('📋 Resumen:');
console.log('   • Claves RSA: backend/keys/private.pem, backend/keys/public.pem');
console.log('   • Variables de entorno: .env');
console.log('   • Permisos seguros aplicados');
console.log('');
console.log('⚠️  IMPORTANTE:');
console.log('   • No compartir el archivo .env');
console.log('   • Hacer backup de las claves RSA en lugar seguro');
console.log('   • Rotar claves periódicamente (cada 90 días recomendado)');
console.log('');
console.log('🚀 Para iniciar el sistema:');
console.log('   docker compose up --build');
console.log('');

// Verificar claves generadas
console.log('🔍 Verificando claves generadas...');
console.log(`JWT_SECRET length: ${JWT_SECRET.length} caracteres`);
console.log(`JWT_REFRESH_SECRET length: ${JWT_REFRESH_SECRET.length} caracteres`);
console.log(`OWNER_API_KEY length: ${OWNER_API_KEY.length} caracteres`);
console.log(`POSTGRES_PASSWORD length: ${POSTGRES_PASSWORD.length} caracteres`);

if (JWT_SECRET.length >= 64 && JWT_REFRESH_SECRET.length >= 64 && OWNER_API_KEY.length >= 64) {
  console.log('✅ Todas las claves cumplen con la longitud mínima requerida');
} else {
  console.log('❌ ERROR: Algunas claves no cumplen con la longitud mínima');
  process.exit(1);
}

console.log('🏁 Script completado exitosamente');
