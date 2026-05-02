#!/bin/bash

# Script para generar claves de seguridad para Transport Pro
# Uso: ./scripts/generate-keys.sh

set -e

echo "🔑 Generando claves de seguridad para Transport Pro..."

# Crear directorios necesarios
mkdir -p backend/keys
mkdir -p scripts

echo "📁 Directorios creados"

# Generar claves RSA para JWT
echo "🔐 Generando claves RSA para JWT..."
cd backend/keys

# Clave privada RSA
openssl genrsa -out private.pem 2048
echo "✅ Clave privada RSA generada: backend/keys/private.pem"

# Clave pública RSA  
openssl rsa -in private.pem -pubout -out public.pem
echo "✅ Clave pública RSA generada: backend/keys/public.pem"

# Establecer permisos seguros
chmod 600 private.pem
chmod 644 public.pem
echo "🔒 Permisos establecidos para claves RSA"

cd ../..

# Generar claves secretas
echo "🎲 Generando claves secretas..."

# JWT Secret (64 caracteres base64)
JWT_SECRET=$(openssl rand -base64 64)
echo "✅ JWT_SECRET generado"

# JWT Refresh Secret (64 caracteres base64)  
JWT_REFRESH_SECRET=$(openssl rand -base64 64)
echo "✅ JWT_REFRESH_SECRET generado"

# Owner API Key (64 caracteres base64)
OWNER_API_KEY=$(openssl rand -base64 64)
echo "✅ OWNER_API_KEY generado"

# PostgreSQL Password (32 caracteres base64)
POSTGRES_PASSWORD=$(openssl rand -base64 32)
echo "✅ POSTGRES_PASSWORD generado"

# Crear archivo .env con las claves
cat > .env << EOF
# Variables de entorno para Transport Pro - $(date)
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
EOF

echo "📝 Archivo .env creado con todas las claves"

# Establecer permisos seguros para .env
chmod 600 .env
echo "🔒 Permisos seguros establecidos para .env"

# Mostrar resumen
echo ""
echo "🎉 ¡Claves generadas exitosamente!"
echo ""
echo "📋 Resumen:"
echo "   • Claves RSA: backend/keys/private.pem, backend/keys/public.pem"
echo "   • Variables de entorno: .env"
echo "   • Permisos seguros aplicados"
echo ""
echo "⚠️  IMPORTANTE:"
echo "   • No compartir el archivo .env"
echo "   • Hacer backup de las claves RSA en lugar seguro"
echo "   • Rotar claves periódicamente (cada 90 días recomendado)"
echo ""
echo "🚀 Para iniciar el sistema:"
echo "   docker compose up --build"
echo ""

# Verificar claves generadas
echo "🔍 Verificando claves generadas..."
echo "JWT_SECRET length: ${#JWT_SECRET} caracteres"
echo "JWT_REFRESH_SECRET length: ${#JWT_REFRESH_SECRET} caracteres" 
echo "OWNER_API_KEY length: ${#OWNER_API_KEY} caracteres"
echo "POSTGRES_PASSWORD length: ${#POSTGRES_PASSWORD} caracteres"

if [ ${#JWT_SECRET} -ge 64 ] && [ ${#JWT_REFRESH_SECRET} -ge 64 ] && [ ${#OWNER_API_KEY} -ge 64 ]; then
    echo "✅ Todas las claves cumplen con la longitud mínima requerida"
else
    echo "❌ ERROR: Algunas claves no cumplen con la longitud mínima"
    exit 1
fi

echo "🏁 Script completado exitosamente"
